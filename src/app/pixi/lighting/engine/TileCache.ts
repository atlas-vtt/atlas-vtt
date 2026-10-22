import type { Renderer, RenderTexture } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { LIGHT_REACH, wallRadius } from '../../../lighting/lightingConstants';
import { placeLight } from '../../../lighting/lightPlacement';
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

interface Entry {
  light: EngineLight;
  /** The tile shown: the light's own, or while `build` runs the one it had before it moved. */
  tile: Tile | null;
  build: Build | null;
}

/**
 * One visibility tile per light, rebuilt only when the light moves, grows or changes its flame,
 * or when walls change within its tile. Tiles are built one after another, as much at a time as
 * the pacer lets through, so a slow device gets them over several frames: a moved light shows
 * its old tile meanwhile, but a tile walls changed within is dropped at once, since it could
 * show light past a door that has just closed.
 */
// ponytail: no memory budget; every active light keeps its tile (~1 MB for a 40 ft torch). Evict tiles of lights far off-screen if large scenes run out of GPU memory.
// ponytail: tiles are built in the order lights come; build the ones on screen first if a slow device takes long to light a large scene.
export class TileCache {
  private readonly tracer: TileTracer;
  /** What limited walls stop, which no trace can tell, is taken out of a finished tile. */
  private readonly limited: LimitedTileMask;
  private readonly entries = new Map<string, Entry>();

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
      if (entry && sameShape(pending?.light ?? entry.light, light) && !touches(pending?.job.rect ?? entry.tile?.rect ?? null, changed)) {
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
      entry.build = this.begin(light, blocking, walls);
      if (entry.build) started = true;
      else {
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
  }

  private begin(light: EngineLight, blocking: BlockingWalls, walls: readonly WallSegment[]): Build | null {
    const { texel } = this.field;
    const placed = placeLight(light.x, light.y, light.flame, solidSegments(blocking), texel);
    if (!placed) return null;
    const rect = this.tileRect(placed.x, placed.y, light.dim * LIGHT_REACH);
    if (!rect) return null;
    const blockingOneWay = blocking.oneWay.filter((wall) => blocksFrom(wall, placed, 'light'));
    let oneWay: CapsuleField | null = null;
    if (blockingOneWay.length > 0) {
      oneWay = new CapsuleField(this.renderer, rect, texel, wallRadius(texel), 'uOneWay');
      oneWay.build(blockingOneWay.map(segOf));
    }
    const job = this.tracer.begin([placed.x, placed.y], placed.flame, rect, oneWay);
    return { light, job, placed, walls, limited: blocking.limited.length > 0 };
  }

  private finish(entry: Entry, build: Build): void {
    const { job, placed, light } = build;
    job.oneWay?.destroy();
    // The rule counts from where the light is, wherever a wall it stands in made the engine place it.
    const texture = build.limited ? this.limited.apply(job.tile, job.rect, { x: light.x, y: light.y }, build.walls) : job.tile;
    entry.tile?.texture.destroy(true);
    entry.tile = { x: placed.x, y: placed.y, flame: placed.flame, rect: job.rect, texture };
    entry.light = light;
    entry.build = null;
  }

  private cancel(entry: Entry): void {
    if (!entry.build) return;
    entry.build.job.oneWay?.destroy();
    entry.build.job.tile.destroy(true);
    entry.build = null;
  }

  private drop(entry: Entry): void {
    this.cancel(entry);
    this.dropTile(entry);
  }

  /** Destroys the tile shown; true when there was one. */
  private dropTile(entry: Entry): boolean {
    if (!entry.tile) return false;
    entry.tile.texture.destroy(true);
    entry.tile = null;
    return true;
  }

  /** The square of half-size `half` around (x, y) on the texel grid, clipped to the map; null if empty. */
  private tileRect(x: number, y: number, half: number): Rect | null {
    const { texel } = this.field;
    const width = Math.ceil(this.bounds.width / texel) * texel, height = Math.ceil(this.bounds.height / texel) * texel;
    const x0 = Math.max(0, Math.floor((x - half) / texel) * texel), y0 = Math.max(0, Math.floor((y - half) / texel) * texel);
    const x1 = Math.min(width, Math.ceil((x + half) / texel) * texel), y1 = Math.min(height, Math.ceil((y + half) / texel) * texel);
    return x1 > x0 && y1 > y0 ? [x0, y0, x1 - x0, y1 - y0] : null;
  }
}

function sameShape(a: EngineLight, b: EngineLight): boolean {
  return a.x === b.x && a.y === b.y && a.dim === b.dim && a.flame === b.flame;
}

function touches(rect: Rect | null, changed: readonly Rect[] | 'all'): boolean {
  if (changed === 'all') return true;
  if (!rect) return changed.length > 0;
  const [x, y, w, h] = rect;
  return changed.some(([cx, cy, cw, ch]) => cx <= x + w && cx + cw >= x && cy <= y + h && cy + ch >= y);
}
