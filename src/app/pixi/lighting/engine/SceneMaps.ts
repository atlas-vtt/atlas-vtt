import type { Renderer } from 'pixi.js';
import type { WallSegment } from '../../../types/wallTypes';
import { DARKNESS } from '../../../lighting/lightingConstants';
import { areaRadius } from '../../../lighting/lightArea';
import { filledPieces } from '../../../lighting/polygonFill';
import { lightReach } from '../../../vision/sight';
import type { MapBounds, Polygon } from '../../../vision/visibility';
import { sameCone } from '../../../vision/visionCone';
import { DarknessMap, type DrawnDarkness, type LitShape, type PierceShape } from './DarknessMap';
import type { EngineShaderSource } from './engineShaders';
import { middleOf } from './polygonFans';
import type { EngineLight, EngineZone } from './types';
import { ZoneMap, sameZoneLook, type ZoneLook, type ZoneWalls } from './ZoneMap';

/** A scene without ambient zones, the same list each time. */
export const NO_ZONES: readonly EngineZone[] = [];

/** How a world's zones are drawn: the program, and how far past its outline a darker zone lies on the walls (`ZoneMap`). */
export interface ZoneDrawing {
  shader: EngineShaderSource;
  wallReach?: number;
}

/**
 * What a world keeps beside its light map, the same for both pictures: the darkness map, once the
 * scene has a darkness source, and the zone map, once it has an ambient zone (`ZoneMap`, drawn
 * with `zoneShader`). Each is freed by `trim` once the scene has none and the composite has let
 * go of it. A darkness is drawn as the area the rule counts (`areaOf`).
 */
export class SceneMaps {
  private darkness: DarknessMap | null = null;
  /** Each darkness source's area as the rule counts it, kept while the source and the walls stay. */
  private readonly areas = new Map<string, { light: EngineLight; walls: readonly WallSegment[]; polygon: Polygon }>();
  private pierce: readonly PierceShape[] = [];
  private zoneTexture: ZoneMap | null = null;
  private drawnZones: readonly EngineZone[] = NO_ZONES;
  private zoneLook: ZoneLook = {};
  /** The walls changed since the zones were drawn: they end at walls. */
  private zonesStale = false;
  private walls: readonly WallSegment[] = [];
  private lights: readonly EngineLight[] = [];

  /** `zones` is how the zone map is drawn (`ZoneMap`'s program and how far a darker zone lies on the walls). */
  constructor(private readonly renderer: Renderer, private readonly bounds: MapBounds, private readonly texel: number, private readonly zones: ZoneDrawing) {}

  /** The scene's walls and lights as the world draws them now; `wallsMoved` once the walls a zone ends at changed. */
  setScene(walls: readonly WallSegment[], lights: readonly EngineLight[], wallsMoved: boolean): void {
    if (wallsMoved) this.zonesStale = true;
    this.walls = walls;
    if (lights !== this.lights) {
      const keys = new Set(lights.map((light) => light.key));
      for (const key of this.areas.keys()) if (!keys.has(key)) this.areas.delete(key);
    }
    this.lights = lights;
  }

  /** What the senses that see in magical darkness perceive (`pierceShapes`); true when it changed. */
  setPierce(pierce: readonly PierceShape[]): boolean {
    const changed = pierce !== this.pierce;
    this.pierce = pierce;
    return changed;
  }

  get pierced(): readonly PierceShape[] {
    return this.pierce;
  }

  /** The darkness map while the scene has a darkness source: the composite reads it only then. */
  darknessMap(): DarknessMap | null {
    return this.lights.some((light) => light.darkness) ? this.darkness : null;
  }

  /** The darkness map drawn anew, where the scene has a darkness source. */
  drawDarkness(): void {
    const sources = this.lights.filter((light) => light.darkness);
    if (sources.length === 0) return;
    this.darkness ??= new DarknessMap(this.renderer, this.bounds, this.texel);
    // Where a light near a darkness would shine: the darkness veils what it swallows there.
    const lit = this.lights.filter((light) => !light.darkness && sources.some((source) => Math.hypot(source.x - light.x, source.y - light.y) < source.dim + light.dim + (light.surface ? areaRadius(light.surface, light) : 0)));
    this.darkness.draw(sources.map((light) => this.darknessOf(light)), this.pierce, lit.flatMap((light) => this.litShapes(light)));
  }

  /**
   * A darkness source as it is drawn: the area the rule counts, its reach's polygon as the scene
   * model hands it on, or `lightReach` from the same place through the same walls, so picture
   * and rule cannot differ.
   */
  darknessOf(light: EngineLight): DrawnDarkness {
    return { origin: { x: light.x, y: light.y }, dim: light.dim, soft: Math.min(DARKNESS.rim, DARKNESS.rimShare * light.dim), polygon: this.areaOf(light) };
  }

  /** The area the rule counts for a light: the one it came with, else traced here and kept while the light and the walls stay. */
  areaOf(light: EngineLight): Polygon {
    if (light.area) return light.area;
    const walls = this.walls;
    let area = this.areas.get(light.key);
    if (!area || area.walls !== walls || area.light.x !== light.x || area.light.y !== light.y || area.light.dim !== light.dim || !sameCone(area.light.cone, light.cone)) {
      area = { light, walls, polygon: lightReach({ x: light.x, y: light.y }, light.dim, walls, light.bright, light).polygon };
      this.areas.set(light.key, area);
    }
    return area.polygon;
  }

  /** The zone map while the scene has an ambient zone: the composite reads it only then. */
  zoneMap(): ZoneMap | null {
    return this.drawnZones.length > 0 ? this.zoneTexture : null;
  }

  /**
   * The scene's ambient zones (the same list while they stay) and what of the scene decides their
   * light, ending at the walls `walls` tells of. Drawn anew only when the zones, the walls or what
   * that look decides changed (`sameZoneLook`).
   */
  setZones(zones: readonly EngineZone[], look: ZoneLook, walls: () => ZoneWalls): void {
    if (zones === this.drawnZones && !this.zonesStale && sameZoneLook(zones, look, this.zoneLook)) return;
    this.drawnZones = zones;
    this.zoneLook = { ambient: look.ambient, ambientColor: look.ambientColor, litThreshold: look.litThreshold, brightThreshold: look.brightThreshold };
    this.zonesStale = false;
    if (zones.length === 0) return;
    this.zoneTexture ??= new ZoneMap(this.renderer, this.bounds, this.texel, this.zones.shader, this.zones.wallReach);
    this.zoneTexture.draw(zones, this.zoneLook, walls());
  }

  get holdsZoneMap(): boolean {
    return !!this.zoneTexture;
  }

  get holdsDarknessMap(): boolean {
    return !!this.darkness;
  }

  /** Frees the darkness map and the zone map of a scene that has none left; call it once the composite has let go of them. */
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
  }

  destroy(): void {
    this.darkness?.destroy();
    this.zoneTexture?.destroy();
  }

  /**
   * Where a light would shine, as shapes drawn as fans from their origins: a light's area, or an
   * area light's area in convex pieces and the reaches of its outline the rule counts (`parts`,
   * where the builder handed them on), and where its reflection reaches.
   */
  private litShapes(light: EngineLight): LitShape[] {
    const reflected = light.reflection ?? [];
    if (!light.surface) return [{ origin: { x: light.x, y: light.y }, polygon: this.areaOf(light) }, ...reflected];
    const pieces = filledPieces(light.surface).map((piece) => ({ origin: middleOf(piece), polygon: piece }));
    return [...pieces, ...(light.parts ?? []), ...reflected];
  }
}

/**
 * The lights in the order the light map draws them: by priority, a darkness after the lights of
 * its own priority, so it swallows them and every light below, and a light above it shines in it.
 * A scene without a darkness keeps its order: lights only add up.
 */
export function byPriority(lights: readonly EngineLight[]): readonly EngineLight[] {
  if (!lights.some((light) => light.darkness)) return lights;
  // By priority, whatever fraction it is; a darkness after the lights that share its own.
  return [...lights].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || Number(!!a.darkness) - Number(!!b.darkness));
}

/** Whether two lists of lights are drawn alike, light by light. */
export function sameLights(a: readonly EngineLight[], b: readonly EngineLight[]): boolean {
  return a.length === b.length && a.every((x, i) => {
    const y = b[i]!;
    return x.key === y.key && x.x === y.x && x.y === y.y && x.bright === y.bright && x.dim === y.dim && x.flame === y.flame
      && x.intensity === y.intensity && x.animation === y.animation && x.color.every((c, j) => c === y.color[j])
      && !!x.darkness === !!y.darkness && (x.priority ?? 0) === (y.priority ?? 0) && sameCone(x.cone, y.cone) && x.edge === y.edge && x.area === y.area && x.surface === y.surface && x.parts === y.parts && x.reflection === y.reflection && x.moving === y.moving;
  });
}
