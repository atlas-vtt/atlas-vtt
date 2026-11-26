import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { computeVisibility, type Polygon } from './visibility';
import { areaParts, type AreaSampling, type LightReachPart } from './areaReach';
import { reflectedArea, type ReflectionPart } from './reflectedLight';
import type { VisionCone } from './visionCone';

/** The area a light illuminates, for deciding on the CPU how well a point is lit. World pixels. */
export interface LightReach {
  origin: Point;
  /** Radius of bright light; 0 for a light that is dim throughout. */
  bright: number;
  /** Radius where the light ends. */
  dim: number;
  /** What the light reaches within `dim`, clipped by walls. */
  polygon: Polygon;
  /** A source of magical darkness: nothing within `dim` is lit, by it or by a light that does not outrank it. */
  darkness?: boolean;
  /** Which of a light and a darkness that meet wins: the higher one, the darkness when equal. Unset is 0. */
  priority?: number;
  /** A light that shines one way: `polygon` is cut to it. */
  cone?: VisionCone;
  /**
   * A light that glows from an area (lava): `polygon` is that area, bright throughout, and
   * `parts` say where its light reaches beyond it, each within `dim` of a point along the area's
   * outline (`areaParts`); `bright` and `dim` count from that point. `origin` is the area's middle.
   */
  parts?: readonly LightReachPart[];
  /**
   * Where the light its lit floor gives back reaches (`reflectionParts`): dim light in the shadows
   * beside it, as far as what is left of the light's dim range. None for a darkness.
   */
  reflection?: readonly ReflectionPart[];
}

/** What a reach is besides its radii. */
export type LightReachKind = Pick<LightReach, 'darkness' | 'priority' | 'cone'>;

/**
 * Where a light at `origin` reaches: its `dim` radius clipped by the `walls` that block light and, for a light that
 * shines one way, by its cone (with its own space around it). Without `bright` it has no bright part.
 */
export function lightReach(origin: Point, dim: number, walls: readonly WallSegment[], bright = 0, kind: LightReachKind = {}): LightReach {
  return reachOf(origin, bright, dim, computeVisibility(origin, dim, walls, kind.cone, 'light'), kind);
}

/** A light's reach from what was traced of it: its polygon (an area light's area) and an area light's parts. */
export function reachOf(origin: Point, bright: number, dim: number, polygon: Polygon, kind: LightReachKind, parts?: readonly LightReachPart[]): LightReach {
  return { origin, bright, dim, polygon, ...(parts && { parts }), ...kindOf(kind) };
}

/**
 * Where a light that glows from `area` reaches (`LightReach.parts`): the area itself and, within
 * `dim` of its outline, what a clear line from the outline reaches. `origin` is the light's middle.
 */
export function areaLightReach(origin: Point, area: readonly Point[], dim: number, walls: readonly WallSegment[], sampling: AreaSampling, bright = 0, kind: LightReachKind = {}): LightReach {
  return reachOf(origin, bright, dim, area as Polygon, kind, areaParts(area, dim, walls, sampling));
}

/** Every polygon a light lights: its reach, or an area light's area and the reaches of its outline, and where its reflection reaches. */
export function litPolygons(reach: LightReach): Polygon[] {
  const direct = reach.parts ? [reach.polygon, ...reach.parts.map((part) => part.polygon)] : [reach.polygon];
  return reach.reflection?.length ? [...direct, ...reflectedArea(reach.reflection)] : direct;
}

/** The fields of `kind` that say something: a light without them is stored as it always was. */
export function kindOf({ darkness, priority, cone }: LightReachKind): LightReachKind {
  return { ...(darkness && { darkness }), ...(priority !== undefined && priority !== 0 && { priority }), ...(cone && { cone }) };
}
