import type { Renderer, RenderTexture } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { LIGHT_REACH, wallRadius } from '../../../lighting/lightingConstants';
import { placeLight } from '../../../lighting/lightPlacement';
import { areaBounds } from '../../../lighting/lightArea';
import { segOf, solidSegments, splitBlocking, type BlockingWalls, type Rect } from '../../../lighting/segments';
import { blocksFrom, type MapBounds } from '../../../vision/visibility';
import { CapsuleField } from './CapsuleField';
import type { GpuPacer } from './GpuPacer';
import { LimitedTileMask } from './LimitedTileMask';
import { TileTracer, type TileJob, type TileTracerOptions } from './TileTracer';
import type { EngineLight } from './types';

/** A light's traced visibility, at the spot it was placed. */
export interface Tile {
  x: number;
  y: number;
  flame: number;
  rect: Rect;
  texture: RenderTexture;
  /** An area light's: the signed distance to its outline on the tile's texel grid, which its falloff counts from. */
  distance?: RenderTexture;
  /** Traced while its light moved, with few rays: traced in full once the light rests. */
  moving?: true;
}

/** How much tile work may go to the graphics device now (`GpuPacer`). */
export type TilePacer = Pick<GpuPacer, 'allowance' | 'submitted'>;

/** Builds every tile at once. */
const AT_ONCE: TilePacer = { allowance: () => Infinity, submitted: () => {} };

interface Build {
  /** The light the tile is built for. */
  light: EngineLight;
  job: TileJob;
  placed: { x: number; y: number; flame: number };
  walls: readonly WallSegment[];
  limited: boolean;
}

/** The field of a light's one-way walls is its build's own, unless it is the moving lights' (`TileCache.movingOneWay`), which stays. */
function ownOneWay(job: TileJob, shared: CapsuleField | null): void {
  if (job.oneWay !== shared) job.oneWay?.destroy();
}

interface Entry {
  light: EngineLight;
  /** The tile shown: the light's own, or while `build` runs the one it had before it moved. */
  tile: Tile | null;
  build: Build | null;
}

/**
 * One visibility tile per light, rebuilt only when the light moves, grows or changes its flame,
 * or when walls change within its tile. Tiles are built one after another, as much at a time as
 * the pacer lets through, so a slow device gets them over several frames: a light shows its old
 * tile meanwhile, but a tile walls changed within is dropped at once, since it could show light
 * past a door that has just closed. A moving light (`EngineLight.moving`: a carried torch being
 * dragged) is the exception: its tile is traced with few rays and at once, whatever the pacer
 * says, so it is drawn where the light is in the frame it moved in (a paced tile never finished
 * during a drag, and the light stayed where the drag began). Once it rests, its tile is traced in
 * full as any other, the quick one shown meanwhile.
 */
// ponytail: no memory budget; every active light keeps its tile (~1 MB for a 40 ft torch). Evict tiles of lights far off-screen if large scenes run out of GPU memory.
// ponytail: tiles are built in the order lights come; build the ones on screen first if a slow device takes long to light a large scene.
export class TileCache {
  private readonly tracer: TileTracer;
  /** What limited walls stop, which no trace can tell, is taken out of a finished tile. */
  private readonly limited: LimitedTileMask;
  private readonly entries = new Map<string, Entry>();
  /** The one-way walls' field of a moving light's tile, moved along with it from tile to tile: one per build cost an allocation every frame of a drag. */
  private movingOneWay: CapsuleField | null = null;

  /** Tiles never reach past the map (rounded up to the texel grid), however far a light shines. */
  constructor(private readonly renderer: Renderer, private readonly field: CapsuleField, private readonly bounds: MapBounds, tracing: TileTracerOptions = {}) {
    this.tracer = new TileTracer(renderer, field, tracing);
    this.limited = new LimitedTileMask(renderer, field.texel);
  }

  tiles(): ReadonlyMap<string, Tile> {
    const out = new Map<string, Tile>();
    for (const [key, entry] of this.entries) if (entry.tile) out.set(key, entry.tile);
    return out;
  }

  /** Tiles still to build. */
  busy(): boolean {
    for (const entry of this.entries.values()) if (entry.build) return true;
    return false;
  }

  /**
   * Brings tiles up to date, building as much as `pacer` lets through now (by default all of
   * it); true when a tile was built, dropped or replaced.
   */
  sync(lights: readonly EngineLight[], walls: readonly WallSegment[], changed: readonly Rect[] | 'all', pacer: TilePacer = AT_ONCE): boolean {
    let dirty = false;
    let started = false;
    const keys = new Set(lights.map((light) => light.key));
    for (const [key, entry] of this.entries) {
      if (keys.has(key)) continue;
      this.drop(entry);
      this.entries.delete(key);
      dirty = true;
    }
    const blocking = splitBlocking(walls, 'light');
    for (const light of lights) {
      let entry = this.entries.get(light.key);
      const pending = entry?.build;
      // A light that rests where its quick tile was traced is traced in full.
      const rested = !light.moving && !pending && !!entry?.tile?.moving;
      if (entry && !rested && sameShape(pending?.light ?? entry.light, light) && !touches(pending?.job.rect ?? entry.tile?.rect ?? null, changed)) {
        if (pending) pending.light = light;
        else entry.light = light;
        continue;
      }
      if (!entry) {
        entry = { light, tile: null, build: null };
        this.entries.set(light.key, entry);
      }
      if (entry.tile && touches(entry.tile.rect, changed)) {
        this.dropTile(entry);
        dirty = true;
      }
      this.cancel(entry);
      const build = this.begin(light, blocking, walls);
      entry.build = build;
      if (build) started = true;
      if (build?.job.moving) {
        // Whole and now; any other tile is built by `pump`, as the pacer lets it through.
        this.tracer.step(build.job, Infinity);
        this.finish(entry, build);
        dirty = true;
      } else if (!build) {
        entry.light = light;
        if (this.dropTile(entry)) dirty = true;
      }
    }
    if (this.pump(pacer)) dirty = true;
    // A light being dragged rebuilds its tile on every update: the tracer's raw targets are kept
    // until an update starts nothing (allocating them per rebuild made each about 40% slower).
    if (!started && !this.busy()) this.tracer.release();
    return dirty;
  }

  /** Builds as much as `pacer` lets through now (by default every tile); true when a tile was finished. */
  pump(pacer: TilePacer = AT_ONCE): boolean {
    // A tile under way finishes before another starts: jobs share the tracer's raw targets.
    const pending = [...this.entries.values()].filter((entry) => entry.build).sort((a, b) => Number(!!b.build!.job.raw) - Number(!!a.build!.job.raw));
    if (pending.length === 0) return false;
    const allowance = pacer.allowance();
    if (allowance <= 0) return false;
    let spent = 0;
    let finished = false;
    for (const entry of pending) {
      const build = entry.build!;
      spent += this.tracer.step(build.job, allowance - spent);
      if (build.job.phase === 'done') {
        this.finish(entry, build);
        finished = true;
      }
      if (spent >= allowance) break;
    }
    pacer.submitted();
    return finished;
  }

  destroy(): void {
    for (const entry of this.entries.values()) this.drop(entry);
    this.entries.clear();
    this.tracer.destroy();
    this.limited.destroy();
    this.movingOneWay?.destroy();
    this.movingOneWay = null;
  }

  private begin(light: EngineLight, blocking: BlockingWalls, walls: readonly WallSegment[]): Build | null {
    if (light.surface) return this.beginArea(light, light.surface, blocking, walls);
    const { texel } = this.field;
    const placed = placeLight(light.x, light.y, light.flame, solidSegments(blocking), texel);
    if (!placed) return null;
    const rect = this.tileRect(placed.x, placed.y, light.dim * LIGHT_REACH);
    if (!rect) return null;
    const blockingOneWay = blocking.oneWay.filter((wall) => blocksFrom(wall, placed, 'light'));
    let oneWay: CapsuleField | null = null;
    if (blockingOneWay.length > 0) {
      if (light.moving) {
        oneWay = this.movingOneWay ??= new CapsuleField(this.renderer, rect, texel, wallRadius(texel), 'uOneWay');
        oneWay.cover(rect);
      } else oneWay = new CapsuleField(this.renderer, rect, texel, wallRadius(texel), 'uOneWay');
      oneWay.build(blockingOneWay.map(segOf));
    }
    const limited = blocking.limited.length > 0;
    // What limited walls stop is taken out on the field's own texels.
    const job = this.tracer.begin([placed.x, placed.y], placed.flame, rect, oneWay, { moving: !!light.moving, reach: light.dim * LIGHT_REACH });
    return { light, job, placed, walls, limited };
  }

  /**
   * An area light's tile: over its area grown by its reach, traced from no single place, so it is
   * not placed like a flame. A one-way wall stops it from both sides, as the rule has it
   * (`twoWayWalls`): the area may lie on both. Limited walls, which no trace can count, are not
   * taken out of it (they are switched off, `LIMITED_WALLS`).
   */
  private beginArea(light: EngineLight, surface: NonNullable<EngineLight['surface']>, blocking: BlockingWalls, walls: readonly WallSegment[]): Build | null {
    const { texel } = this.field;
    const reach = light.dim * LIGHT_REACH;
    const [x, y, width, height] = areaBounds(surface);
    const rect = this.boxRect(x - reach, y - reach, x + width + reach, y + height + reach);
    if (!rect) return null;
    let oneWay: CapsuleField | null = null;
    if (blocking.oneWay.length > 0) {
      oneWay = new CapsuleField(this.renderer, rect, texel, wallRadius(texel), 'uOneWay');
      oneWay.build(blocking.oneWay.map(segOf));
    }
    const job = this.tracer.beginArea([light.x, light.y], { corners: surface, bright: light.bright, dim: light.dim, reach, blur: areaBlur(light.dim, texel) }, rect, oneWay);
    return { light, job, placed: { x: light.x, y: light.y, flame: 0 }, walls, limited: false };
  }

  private finish(entry: Entry, build: Build): void {
    const { job, placed, light } = build;
    ownOneWay(job, this.movingOneWay);
    // The rule counts from where the light is, wherever a wall it stands in made the engine place it.
    const texture = build.limited ? this.limited.apply(job.tile, job.rect, { x: light.x, y: light.y }, build.walls) : job.tile;
    destroyTile(entry.tile);
    entry.tile = { x: placed.x, y: placed.y, flame: placed.flame, rect: job.rect, texture, ...(job.moving && { moving: true as const }), ...(job.area && { distance: job.area.distance }) };
    entry.light = light;
    entry.build = null;
  }

  private cancel(entry: Entry): void {
    if (!entry.build) return;
    ownOneWay(entry.build.job, this.movingOneWay);
    entry.build.job.tile.destroy(true);
    entry.build.job.area?.distance.destroy(true);
    entry.build = null;
  }

  private drop(entry: Entry): void {
    this.cancel(entry);
    this.dropTile(entry);
  }

  /** Destroys the tile shown; true when there was one. */
  private dropTile(entry: Entry): boolean {
    if (!entry.tile) return false;
    destroyTile(entry.tile);
    entry.tile = null;
    return true;
  }

  /** The square of half-size `half` around (x, y) on the texel grid, clipped to the map; null if empty. */
  private tileRect(x: number, y: number, half: number): Rect | null {
    return this.boxRect(x - half, y - half, x + half, y + half);
  }

  /** The box from (x0, y0) to (x1, y1) grown to the texel grid, clipped to the map; null if empty. */
  private boxRect(left: number, top: number, right: number, bottom: number): Rect | null {
    const { texel } = this.field;
    const width = Math.ceil(this.bounds.width / texel) * texel, height = Math.ceil(this.bounds.height / texel) * texel;
    const x0 = Math.max(0, Math.floor(left / texel) * texel), y0 = Math.max(0, Math.floor(top / texel) * texel);
    const x1 = Math.min(width, Math.ceil(right / texel) * texel), y1 = Math.min(height, Math.ceil(bottom / texel) * texel);
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
  }
}

/**
 * How widely an area light's distance field is blurred (sigma, world pixels): a sixteenth of its
 * dim range, so the corners of its light round off alike at any size, never under two texels.
 */
export function areaBlur(dim: number, texel: number): number {
  return Math.max(2 * texel, dim / 16);
}

function destroyTile(tile: Tile | null): void {
  tile?.texture.destroy(true);
  tile?.distance?.destroy(true);
}

/** Whether two lights trace the same tile: an area light's by its area, its reach and its bright range, which weigh its rays. */
function sameShape(a: EngineLight, b: EngineLight): boolean {
  return a.x === b.x && a.y === b.y && a.dim === b.dim && a.flame === b.flame && a.surface === b.surface && (!a.surface || a.bright === b.bright);
}

function touches(rect: Rect | null, changed: readonly Rect[] | 'all'): boolean {
  if (changed === 'all') return true;
  if (!rect) return changed.length > 0;
  const [x, y, w, h] = rect;
  return changed.some(([cx, cy, cw, ch]) => cx <= x + w && cx + cw >= x && cy <= y + h && cy + ch >= y);
}
