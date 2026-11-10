import type { Renderer, Texture } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { BOUNCE, tileWallReach } from '../../../lighting/lightingConstants';
import { DEFAULT_LIGHTING_QUALITY, bouncesOn, pictureTexel, type LightingQuality, type TracedQuality } from '../../../lighting/lightingQuality';
import { changedWallRects } from '../../../lighting/wallChanges';
import type { Rect } from '../../../lighting/segments';
import type { MapBounds } from '../../../vision/visibility';
import { flickerSlots, LightFlicker, STEADY, type FlickerSample } from '../lightFlicker';
import { animationFrameDue, slotsOf } from '../../utils/animationFrames';
import type { Box } from '../../../vision/polygonBounds';
import type { CapsuleField } from './CapsuleField';
import { glOf } from './gpu';
import { GpuPacer } from './GpuPacer';
import { bounceScale, changedArea, type SteadyDrawing } from './bounceArea';
import type { DarknessMap, DrawnDarkness, PierceShape } from './DarknessMap';
import { areaRadius } from '../../../lighting/lightArea';
import { ENGINE_SHADERS } from './engineShaders';
import { LightMap, type DrawnLight } from './LightMap';
import { RadianceCascades } from './RadianceCascades';
import { ReflectionTiles } from './ReflectionTiles';
import { TileCache, type TilePacer } from './TileCache';
import { NO_ZONES, SceneMaps, byPriority, sameLights } from './SceneMaps';
import type { EngineLight, EngineZone } from './types';
import { WallFields } from './WallFields';
import type { ZoneLook, ZoneMap } from './ZoneMap';

/**
 * Everything the lighting keeps in world space for one map: the wall field, each light's tile,
 * the light map, the bounce and, once the map has a darkness source, the darkness map.
 * Independent of any camera; rebuilt only for what changed. Its texel and whether light
 * bounces come from the lighting quality it is made with (`LightingQuality`).
 * Constructing it draws nothing: the first `update` builds every texture. A paced world
 * (`paced`) sends its heavy work, light tiles, bounce and flicker, only as fast as the graphics
 * device runs it (`GpuPacer`), so a slow device builds a scene's lights over several frames.
 */
export class LightingWorld {
  readonly picture = 'traced';
  readonly texel: number;
  /** Rays each light's tile traces across its flame (`LightingQuality.tileRays`). */
  readonly tileRays: number;
  /** The walls as light and sight each read them (`WallFields`). */
  readonly fields: WallFields;
  readonly lightMap: LightMap;
  /** The bounce, where the quality lets light bounce on this map. */
  readonly cascades: RadianceCascades | null;
  /** How often flickering lights are redrawn, at most, in milliseconds (`setFlicker`). */
  private flickerMs: number;
  /** The darkness map and the zone map, each made with the scene's first darkness source or zone. */
  private readonly maps: SceneMaps;
  private readonly tiles: TileCache;
  private readonly reflections: ReflectionTiles;
  private readonly pacer: GpuPacer;
  private readonly flicker = new LightFlicker();
  private walls: readonly WallSegment[] | null = null;
  private lights: readonly EngineLight[] = [];
  private albedo: Texture | null = null;
  private bounceDirty = false;
  /** The bounce must be built over the whole map: the walls or the map image changed since the last build. */
  private bounceAll = true;
  /** What the steady light map drew for the last bounce build: the next draws only where that changed. */
  private bounceDrawn: SteadyDrawing | null = null;
  private lastBounce = -Infinity;
  /** When the light map last took its flicker; -Infinity while it holds the steady lights. */
  private lastFlicker = -Infinity;
  /** The animated lights and how often the light map is redrawn for them, worked out once per list of lights. */
  private flickering: { lights: readonly EngineLight[]; animated: readonly EngineLight[]; slots: number } | null = null;

  /** `cell` is the map's grid cell in world px, which the texel follows (`pictureTexel`); unknown, the map's size alone decides. */
  constructor(renderer: Renderer, readonly bounds: MapBounds, quality: TracedQuality = DEFAULT_LIGHTING_QUALITY, paced = false, private readonly cell?: number) {
    this.texel = pictureTexel(bounds, quality, cell);
    this.tileRays = quality.tileRays;
    this.flickerMs = quality.flickerMs;
    this.fields = new WallFields(renderer, bounds, this.texel);
    this.lightMap = new LightMap(renderer, bounds, this.texel);
    this.cascades = bouncesOn(quality, bounds) ? new RadianceCascades(renderer, bounds, this.fields.tiles, bounceScale(this.texel, cell)) : null;
    this.tiles = new TileCache(renderer, this.fields.tiles, bounds, { rays: quality.tileRays });
    this.reflections = new ReflectionTiles(renderer, bounds, this.texel);
    this.maps = new SceneMaps(renderer, bounds, this.texel, { shader: ENGINE_SHADERS.zone });
    const gl = paced ? glOf(renderer) : null;
    this.pacer = new GpuPacer(gl && 'fenceSync' in gl ? gl : null);
  }

  /** Flickering lights are redrawn at most this often from now on; the world's textures stay. */
  setFlicker(ms: number): void {
    this.flickerMs = ms;
  }

  /** Whether this world was made as `quality` makes one for its map and cell (a traced picture, texel, bounce and its scale, tile rays): else it is built anew. */
  fits(quality: LightingQuality, cell: number | undefined = this.cell): boolean {
    if (quality.picture === 'polygons') return false;
    const texel = pictureTexel(this.bounds, quality, cell);
    const bounce = bouncesOn(quality, this.bounds);
    return this.texel === texel && !!this.cascades === bounce && (!this.cascades || this.cascades.scale === bounceScale(texel, cell)) && this.tileRays === quality.tileRays;
  }

  /** What the composite binds of this world, the same object for as long as it binds the same textures. */
  binding(): object {
    return this.fields.bound();
  }

  /** Every wall that blocks light, one-way walls too, which bounce treats as blocking both ways. */
  fieldAll(): CapsuleField {
    return this.fields.light();
  }

  /** The darkness map while the scene has a darkness source: the composite reads it only then. */
  darknessMap(): DarknessMap | null {
    return this.maps.darknessMap();
  }

  /**
   * `pierce` is what the senses that see in magical darkness perceive (`pierceShapes`), the same
   * list while nothing changed; it is drawn into the darkness map, so it costs nothing on a map
   * without a darkness source.
   */
  update(walls: readonly WallSegment[], lights: readonly EngineLight[], albedo: Texture | null, pierce: readonly PierceShape[] = this.maps.pierced): void {
    const pierceChanged = this.maps.setPierce(pierce);
    let changed: Rect[] | 'all' = [];
    let moved = false;
    if (walls !== this.walls) {
      changed = this.walls ? changedWallRects(this.walls, walls, tileWallReach(this.texel)) : 'all';
      this.walls = walls;
      if (changed === 'all' || changed.length > 0) {
        this.fields.rebuild(walls);
        this.bounceDirty = true;
        this.bounceAll = true;
        moved = true;
      }
    }
    // A darkness has no tile: its area is the rule's polygon, which changes with any wall.
    const shining = lights.filter((light) => !light.darkness);
    const tilesChanged = this.tiles.sync(shining, walls, changed, this.pacer);
    // After the fields: a reflection ends at the walls' capsules as a tile does.
    const reflectionsChanged = this.reflections.sync(shining, this.fieldAll());
    const lightsChanged = !sameLights(this.lights, lights);
    const areasChanged = changed !== 'all' && changed.length === 0 ? false : lights.some((light) => light.darkness);
    if (lightsChanged) this.forgetRemoved(lights);
    this.lights = lights;
    this.maps.setScene(walls, lights, moved);
    if (tilesChanged || reflectionsChanged || lightsChanged || areasChanged) {
      this.drawSteady();
      this.bounceDirty = true;
    } else if (pierceChanged && this.darknessMap()) {
      this.maps.drawDarkness();
    }
    if (albedo !== this.albedo) {
      this.albedo = albedo;
      this.bounceDirty = true;
      this.bounceAll = true;
    }
  }

  /**
   * Tiles still to build, throttled flicker and bounce, each as the pacer lets it through; true
   * when a world texture changed. A light map drawn steady (a light moved, the bounce was built)
   * takes its flicker back at once, so a dragged light never blinks between the two. Bounce
   * waits for the last tile: it reads the light map they make. While a light moves
   * (`EngineLight.moving`) the bounce is built one pass a frame (`RadianceCascades.step`), so it
   * follows a dragged light without the stall a whole build costs; frozen, it stayed where the
   * drag began until the drop. `buildBounce` builds a pending bounce whatever the pacer says or
   * moves (`flush`).
   */
  animate(now: number, buildBounce = false, view?: Box): boolean {
    let drew = this.buildTiles(this.pacer);
    const { cascades } = this;
    const waits = !buildBounce && this.pacer.allowance() <= 0;
    if (cascades && !waits) {
      const field = this.fieldAll();
      // A moving light's build goes a band a frame: a whole pass on a large map was a dropped frame.
      // The band paces it, so the next build starts as the last ends, without the throttle.
      const moving = !buildBounce && this.lights.some((light) => light.moving);
      const texels = moving ? BOUNCE.movingTexels : Infinity;
      if (cascades.building) {
        cascades.step(field, texels);
        this.pacer.submitted();
        drew = true;
      }
      if (!cascades.building && this.bounceDirty && !this.tiles.busy() && (moving || now - this.lastBounce >= BOUNCE.throttleMs)) {
        // Bounce uses steady intensity, so flicker never rebuilds it.
        const drawn = this.drawSteady();
        cascades.begin(this.lightMap, this.albedo, this.bounceAll ? null : changedArea(this.bounceDrawn, drawn));
        this.bounceDrawn = drawn;
        this.bounceAll = false;
        this.bounceDirty = false;
        this.lastBounce = now;
        cascades.step(field, texels);
        this.pacer.submitted();
        drew = true;
      }
    }
    if (this.flickerDue(now, view) && this.pacer.allowance() > 0) {
      this.drawLightMap((light) => this.flicker.sample(light.key, light.animation, now));
      this.pacer.submitted();
      this.lastFlicker = now;
      drew = true;
    }
    return drew;
  }

  /** The zone map while the scene has an ambient zone: the composite reads it only then. */
  zoneMap(): ZoneMap | null {
    return this.maps.zoneMap();
  }

  get holdsZoneMap(): boolean {
    return this.maps.holdsZoneMap;
  }

  /**
   * The scene's ambient zones (the same list while they stay) and what of the scene decides their
   * light; call it after `update`, which brings the walls their soft edges end at. Drawn anew
   * only when the zones, the walls or what that look decides changed (`sameZoneLook`).
   */
  setZones(zones: readonly EngineZone[] = NO_ZONES, look: ZoneLook): void {
    this.maps.setZones(zones, look, () => this.fields.zones());
  }

  /** Whether the darkness map's texture is allocated. */
  get holdsDarknessMap(): boolean {
    return this.maps.holdsDarknessMap;
  }

  /** Frees the darkness map and the zone map of a scene that has no darkness source or zone left, and the wall fields its walls no longer need; call it once nothing reads them (`darknessMap()`, `zoneMap()` are null, the composite has the fields of now). */
  trim(): void {
    this.maps.trim();
    this.fields.trim();
  }

  /** Tiles or bounce still to build, or animated lights: keep calling `animate`. */
  busy(): boolean {
    return (!!this.cascades && (this.bounceDirty || this.cascades.building)) || this.animated() || this.tiles.busy();
  }

  /** Builds every tile and the bounce now, whatever the pacer says (a thumbnail, tests). */
  flush(): void {
    this.buildTiles();
    this.lastBounce = -Infinity;
    this.animate(performance.now(), true);
  }

  destroy(): void {
    this.pacer.destroy();
    this.tiles.destroy();
    this.reflections.destroy();
    this.cascades?.destroy();
    this.lightMap.destroy();
    this.maps.destroy();
    this.fields.destroy();
  }

  /** Builds tiles as `pacer` lets through (by default all of them); a finished one is drawn steady and the bounce is built anew. True when one finished. */
  private buildTiles(pacer?: TilePacer): boolean {
    if (!this.tiles.pump(pacer)) return false;
    this.drawSteady();
    this.bounceDirty = true;
    return true;
  }

  /** Lights that flicker. */
  private animated(): boolean {
    return this.flickers().animated.length > 0;
  }

  private flickers(): NonNullable<LightingWorld['flickering']> {
    if (this.flickering?.lights !== this.lights) {
      const animated = this.lights.filter((light) => light.animation !== 'none');
      this.flickering = { lights: this.lights, animated, slots: Math.min(...animated.map((light) => flickerSlots(light.animation))) };
    }
    return this.flickering;
  }

  /**
   * Whether the flicker is due a redraw at `now`: on the map's animation clock (`animationFrameDue`),
   * every so many slots as the quality and the quickest of the animations ask, and only while one
   * of them lights something within `view` (world px; unset, anywhere): a light map redrawn for
   * lights nobody looks at is a render of the whole stage for nothing. One that comes back into
   * view takes its flicker on the next slot.
   */
  private flickerDue(now: number, view: Box | undefined): boolean {
    const { animated, slots } = this.flickers();
    if (animated.length === 0) return false;
    const last = this.lastFlicker === -Infinity ? null : this.lastFlicker;
    if (!animationFrameDue(now, last, Math.max(slotsOf(this.flickerMs), slots))) return false;
    return !view || animated.some((light) => lightsWithin(light, view));
  }

  private forgetRemoved(lights: readonly EngineLight[]): void {
    const keys = new Set(lights.map((light) => light.key));
    for (const light of this.lights) {
      if (keys.has(light.key)) continue;
      this.flicker.forget(light.key);
    }
  }

  private drawSteady(): SteadyDrawing {
    const drawn = this.drawLightMap(() => STEADY);
    this.lastFlicker = -Infinity;
    this.maps.drawDarkness();
    return drawn;
  }

  /** Draws the light map, each light as `sample` has it; what was drawn, by light, in order. */
  private drawLightMap(sample: (light: EngineLight) => FlickerSample): Map<string, DrawnLight | DrawnDarkness> {
    const tiles = this.tiles.tiles();
    const drawn = new Map<string, DrawnLight | DrawnDarkness>();
    for (const light of byPriority(this.lights)) {
      if (light.darkness) {
        drawn.set(light.key, this.maps.darknessOf(light));
        continue;
      }
      const tile = tiles.get(light.key);
      if (!tile) continue;
      const { intensity, radiusScale } = sample(light);
      // Flicker breathes the bright radius only: where a light ends is where the rules end it.
      drawn.set(light.key, { tile, bright: light.bright * radiusScale, dim: light.dim, color: light.color, intensity: light.intensity * intensity, cone: light.cone, edge: light.edge, reflection: this.reflections.get(light.key) });
    }
    this.lightMap.draw([...drawn.values()]);
    return drawn;
  }
}

/** Whether anything `light` lights may lie within `view` (world px). */
function lightsWithin(light: EngineLight, view: Box): boolean {
  const reach = light.dim + (light.surface ? areaRadius(light.surface, light) : 0);
  return light.x + reach >= view.minX && light.x - reach <= view.maxX && light.y + reach >= view.minY && light.y - reach <= view.maxY;
}
