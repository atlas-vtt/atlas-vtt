import type { Renderer, Texture } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { BOUNCE, DARKNESS, LIGHT_REACH, beamEnd, tileWallReach, worldTexel } from '../../../lighting/lightingConstants';
import { DEFAULT_LIGHTING_QUALITY, bouncesOn, type LightingQuality } from '../../../lighting/lightingQuality';
import { changedWallRects } from '../../../lighting/wallChanges';
import type { Rect } from '../../../lighting/segments';
import { lightReach } from '../../../vision/sight';
import type { MapBounds, Polygon } from '../../../vision/visibility';
import { sameCone } from '../../../vision/visionCone';
import { LightFlicker, STEADY, type FlickerSample } from '../lightFlicker';
import type { CapsuleField } from './CapsuleField';
import { DarknessMap, type DrawnDarkness, type PierceShape } from './DarknessMap';
import { LightMap, type DrawnLight } from './LightMap';
import { RadianceCascades } from './RadianceCascades';
import { TileCache } from './TileCache';
import type { EngineLight, EngineZone } from './types';
import { WallFields } from './WallFields';
import { ZoneMap, sameZoneLook, type ZoneLook } from './ZoneMap';

/**
 * Everything the lighting keeps in world space for one map: the wall field, each light's tile,
 * the light map, the bounce and, once the map has a darkness source, the darkness map.
 * Independent of any camera; rebuilt only for what changed. Its texel and whether light
 * bounces come from the lighting quality it is made with (`LightingQuality`).
 * Constructing it draws nothing: the first `update` builds every texture.
 */
export class LightingWorld {
  readonly texel: number;
  /** The walls as light and sight each read them (`WallFields`). */
  readonly fields: WallFields;
  readonly lightMap: LightMap;
  /** The bounce, where the quality lets light bounce on this map. */
  readonly cascades: RadianceCascades | null;
  /** How often flickering lights are redrawn, or null to keep them steady (`setFlicker`). */
  private flickerMs: number | null;
  /** Created with the first darkness source; `trim` frees it once the scene has none and the composite has let go of it. */
  private darkness: DarknessMap | null = null;
  /** Each darkness source's area as the rule counts it, kept while the source and the walls stay. */
  private readonly areas = new Map<string, { light: EngineLight; walls: readonly WallSegment[]; polygon: Polygon }>();
  private pierce: readonly PierceShape[] = [];
  /** Created with the scene's first ambient zone; `trim` frees it once the scene has none. */
  private zoneTexture: ZoneMap | null = null;
  private zones: readonly EngineZone[] = NO_ZONES;
  private zoneLook: ZoneLook = {};
  /** The walls changed since the zones were drawn: their soft edges end at walls. */
  private zonesStale = false;
  private readonly tiles: TileCache;
  private readonly flicker = new LightFlicker();
  private walls: readonly WallSegment[] | null = null;
  private lights: readonly EngineLight[] = [];
  private albedo: Texture | null = null;
  private bounceDirty = false;
  private lastBounce = -Infinity;
  /** When the light map last took its flicker; -Infinity while it holds the steady lights. */
  private lastFlicker = -Infinity;

  constructor(private readonly renderer: Renderer, readonly bounds: MapBounds, quality: LightingQuality = DEFAULT_LIGHTING_QUALITY) {
    this.texel = worldTexel(bounds, quality.maxTexels);
    this.flickerMs = quality.flickerMs;
    this.fields = new WallFields(renderer, bounds, this.texel);
    this.lightMap = new LightMap(renderer, bounds, this.texel);
    this.cascades = bouncesOn(quality, bounds) ? new RadianceCascades(renderer, bounds, this.fields.tiles) : null;
    this.tiles = new TileCache(renderer, this.fields.tiles, bounds);
  }

  /** Lights that stop flickering are drawn steady at once; the world's textures stay. */
  setFlicker(ms: number | null): void {
    if (ms === this.flickerMs) return;
    const flickered = this.animated() && this.lastFlicker !== -Infinity;
    this.flickerMs = ms;
    if (ms === null && flickered) this.drawSteady();
  }

  /** Whether this world was made as `quality` makes one for its map: else it is built anew. */
  fits(quality: LightingQuality): boolean {
    return this.texel === worldTexel(this.bounds, quality.maxTexels) && !!this.cascades === bouncesOn(quality, this.bounds);
  }

  /** Every wall that blocks light, one-way walls too, which bounce treats as blocking both ways. */
  fieldAll(): CapsuleField {
    return this.fields.light();
  }

  /** The darkness map while the scene has a darkness source: the composite reads it only then. */
  darknessMap(): DarknessMap | null {
    return this.lights.some((light) => light.darkness) ? this.darkness : null;
  }

  /**
   * `pierce` is what the senses that see in magical darkness perceive (`pierceShapes`), the same
   * list while nothing changed; it is drawn into the darkness map, so it costs nothing on a map
   * without a darkness source.
   */
  update(walls: readonly WallSegment[], lights: readonly EngineLight[], albedo: Texture | null, pierce: readonly PierceShape[] = this.pierce): void {
    const pierceChanged = pierce !== this.pierce;
    this.pierce = pierce;
    let changed: Rect[] | 'all' = [];
    if (walls !== this.walls) {
      changed = this.walls ? changedWallRects(this.walls, walls, tileWallReach(this.texel)) : 'all';
      this.walls = walls;
      if (changed === 'all' || changed.length > 0) {
        this.fields.rebuild(walls);
        this.bounceDirty = true;
        this.zonesStale = true;
      }
    }
    // A darkness has no tile: its area is the rule's polygon, which changes with any wall.
    const tilesChanged = this.tiles.sync(lights.filter((light) => !light.darkness), walls, changed);
    const lightsChanged = !sameLights(this.lights, lights);
    const areasChanged = changed !== 'all' && changed.length === 0 ? false : lights.some((light) => light.darkness);
    if (lightsChanged) this.forgetRemoved(lights);
    this.lights = lights;
    if (tilesChanged || lightsChanged || areasChanged) {
      this.drawSteady();
      this.bounceDirty = true;
    } else if (pierceChanged && this.darknessMap()) {
      this.drawDarkness();
    }
    if (albedo !== this.albedo) {
      this.albedo = albedo;
      this.bounceDirty = true;
    }
  }

  /**
   * Throttled flicker and bounce; true when a world texture changed. A light map drawn steady
   * (a light moved, the bounce was built) takes its flicker back at once, so a dragged light
   * never blinks between the two.
   */
  animate(now: number): boolean {
    let drew = false;
    if (this.bounceDirty && this.cascades && now - this.lastBounce >= BOUNCE.throttleMs) {
      // Bounce uses steady intensity, so flicker never rebuilds it.
      this.drawSteady();
      this.cascades.build(this.lightMap, this.albedo, this.fieldAll());
      this.bounceDirty = false;
      this.lastBounce = now;
      drew = true;
    }
    const flicker = this.flickerMs;
    if (flicker !== null && this.animated() && now - this.lastFlicker >= flicker) {
      this.drawLightMap((light) => this.flicker.sample(light.key, light.animation, now));
      this.lastFlicker = now;
      drew = true;
    }
    return drew;
  }

  /** The zone map while the scene has an ambient zone: the composite reads it only then. */
  zoneMap(): ZoneMap | null {
    return this.zones.length > 0 ? this.zoneTexture : null;
  }

  get holdsZoneMap(): boolean {
    return !!this.zoneTexture;
  }

  /**
   * The scene's ambient zones (the same list while they stay) and what of the scene decides their
   * light; call it after `update`, which brings the walls their soft edges end at. Drawn anew
   * only when the zones, the walls or what that look decides changed (`sameZoneLook`).
   */
  setZones(zones: readonly EngineZone[] = NO_ZONES, look: ZoneLook): void {
    if (zones === this.zones && !this.zonesStale && sameZoneLook(zones, look, this.zoneLook)) return;
    this.zones = zones;
    this.zoneLook = { ambient: look.ambient, ambientColor: look.ambientColor, litThreshold: look.litThreshold, brightThreshold: look.brightThreshold };
    this.zonesStale = false;
    if (zones.length === 0) return;
    this.zoneTexture ??= new ZoneMap(this.renderer, this.bounds, this.texel);
    this.zoneTexture.draw(zones, this.zoneLook, this.fields.zones());
  }

  /** Whether the darkness map's texture is allocated. */
  get holdsDarknessMap(): boolean {
    return !!this.darkness;
  }

  /** Frees the darkness map and the zone map of a scene that has no darkness source or zone left, and the wall fields its walls no longer need; call it once nothing reads them (`darknessMap()`, `zoneMap()` are null, the composite has the fields of now). */
  trim(): void {
    if (!this.darknessMap()) {
      this.darkness?.destroy();
      this.darkness = null;
      this.areas.clear();
    }
    if (!this.zoneMap()) {
      this.zoneTexture?.destroy();
      this.zoneTexture = null;
    }
    this.fields.trim();
  }

  /** Animated lights or bounce still to build: keep calling `animate`. */
  busy(): boolean {
    return (this.bounceDirty && !!this.cascades) || this.animated();
  }

  /** Builds the bounce now (map load finished, tests). */
  flush(): void {
    this.lastBounce = -Infinity;
    this.animate(performance.now());
  }

  destroy(): void {
    this.tiles.destroy();
    this.cascades?.destroy();
    this.lightMap.destroy();
    this.darkness?.destroy();
    this.zoneTexture?.destroy();
    this.fields.destroy();
  }

  /** Lights that flicker, while the quality lets them. */
  private animated(): boolean {
    return this.flickerMs !== null && this.lights.some((light) => light.animation !== 'none');
  }

  private forgetRemoved(lights: readonly EngineLight[]): void {
    const keys = new Set(lights.map((light) => light.key));
    for (const light of this.lights) {
      if (keys.has(light.key)) continue;
      this.flicker.forget(light.key);
      this.areas.delete(light.key);
    }
  }

  private drawSteady(): void {
    this.drawLightMap(() => STEADY);
    this.lastFlicker = -Infinity;
    if (this.lights.some((light) => light.darkness)) this.drawDarkness();
  }

  private drawDarkness(): void {
    this.darkness ??= new DarknessMap(this.renderer, this.bounds, this.texel);
    const sources = this.lights.filter((light) => light.darkness);
    // Where a light near a darkness would shine: the darkness veils what it swallows there.
    const lit = this.lights.filter((light) => !light.darkness && sources.some((source) => Math.hypot(source.x - light.x, source.y - light.y) < source.dim + light.dim));
    this.darkness.draw(sources.map((light) => this.darknessOf(light)), this.pierce, lit.map((light) => ({ origin: { x: light.x, y: light.y }, polygon: this.areaOf(light) })));
  }

  private drawLightMap(sample: (light: EngineLight) => FlickerSample): void {
    const tiles = this.tiles.tiles();
    const drawn: (DrawnLight | DrawnDarkness)[] = [];
    for (const light of byPriority(this.lights)) {
      if (light.darkness) {
        drawn.push(this.darknessOf(light));
        continue;
      }
      const tile = tiles.get(light.key);
      if (!tile) continue;
      const { intensity, radiusScale } = sample(light);
      // Flicker breathes the bright radius only: where a light ends is where the rules end it.
      drawn.push({ tile, bright: light.bright * radiusScale, dim: light.dim, reach: light.edge === undefined || !light.cone ? light.dim * LIGHT_REACH : light.dim + beamEnd(light.edge, light.dim, light.cone.angle, this.texel), color: light.color, intensity: light.intensity * intensity, cone: light.cone, edge: light.edge });
    }
    this.lightMap.draw(drawn);
  }

  /**
   * A darkness source as it is drawn: the area the rule counts, its reach's polygon as the scene
   * model hands it on, or `lightReach` from the same place through the same walls, so picture
   * and rule cannot differ.
   */
  private darknessOf(light: EngineLight): DrawnDarkness {
    return { origin: { x: light.x, y: light.y }, dim: light.dim, soft: Math.min(DARKNESS.rim, (LIGHT_REACH - 1) * light.dim), polygon: this.areaOf(light) };
  }

  /** The area the rule counts for a light: the one it came with, else traced here and kept while the light and the walls stay. */
  private areaOf(light: EngineLight): Polygon {
    if (light.area) return light.area;
    const walls = this.walls ?? [];
    let area = this.areas.get(light.key);
    if (!area || area.walls !== walls || area.light.x !== light.x || area.light.y !== light.y || area.light.dim !== light.dim || !sameCone(area.light.cone, light.cone)) {
      area = { light, walls, polygon: lightReach({ x: light.x, y: light.y }, light.dim, walls, light.bright, light).polygon };
      this.areas.set(light.key, area);
    }
    return area.polygon;
  }
}

const NO_ZONES: readonly EngineZone[] = [];

function sameLights(a: readonly EngineLight[], b: readonly EngineLight[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i]!;
    return x.key === y.key && x.x === y.x && x.y === y.y && x.bright === y.bright && x.dim === y.dim && x.flame === y.flame
      && x.intensity === y.intensity && x.animation === y.animation && x.color.every((c, j) => c === y.color[j])
      && !!x.darkness === !!y.darkness && (x.priority ?? 0) === (y.priority ?? 0) && sameCone(x.cone, y.cone) && x.edge === y.edge && x.area === y.area;
  });
}

/**
 * The lights in the order the light map draws them: by priority, a darkness after the lights of
 * its own priority, so it swallows them and every light below, and a light above it shines in it.
 * A scene without a darkness keeps its order: lights only add up.
 */
function byPriority(lights: readonly EngineLight[]): readonly EngineLight[] {
  if (!lights.some((light) => light.darkness)) return lights;
  // By priority, whatever fraction it is; a darkness after the lights that share its own.
  return [...lights].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || Number(!!a.darkness) - Number(!!b.darkness));
}
