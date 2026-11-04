import { LIGHT_LEVELS, REFLECTION, lightFade } from '../lighting/lightingConstants';
import { distToSeg, type Seg } from '../lighting/segments';
import { unionShapes } from '../lighting/polygonClip';
import { quantizeCoordinate } from '../lighting/quantizedPoint';
import { Q_SCALE } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { nearbySegments, twoWayWalls, type LightReachPart } from './areaReach';
import { inBox, polygonBox } from './polygonBounds';
import { computeVisibility, pointInPolygon, type Polygon } from './visibility';

/**
 * Reflected light (`REFLECTION`), for the rules: the floor a light lights gives some of it back
 * into the shadows beside it. Only the floor along a shadow's edge matters: any clear line from
 * a point in the shadow to the lit floor crosses the lit area's outline where it is a shadow's
 * edge (its other edges lie on walls, or on the light's dim radius, where nothing is left to give).
 * So points along those edges are traced like little lights (`ReflectionPart`), each as far as
 * what is left of the light's dim range there, and no farther than the reflection's own reach,
 * which shrinks with how lit the floor there is.
 */

/** Most points one light's reflection is traced from: a long shadow is sampled more thinly, so a wall's edit never retraces without end. */
export const MAX_REFLECTION_SAMPLES = 32;

/** A point of a light's lit floor at a shadow's edge, and where the light it gives back reaches. World pixels. */
export interface ReflectionPart {
  origin: Point;
  /** How far from `origin` the rule counts its light: what is left of the light's dim range there, within the reflection's own reach. */
  reach: number;
  /** How lit the floor is there, 1 in the light's bright range, down to its dim level's share of that (`floorLight`). */
  strength: number;
  /** What the rule counts lit by it, and the picture draws: what a clear line from `origin` reaches within `reach`. */
  polygon: Polygon;
}

/** How a light's reflection is sampled: points along shadows this far apart, none nearer a wall than `clearance`, none reaching farther than `reach`. */
export interface ReflectionSampling {
  spacing: number;
  clearance: number;
  reach: number;
}

/** A light's reach as the rule reads it, which is what reflects. */
export interface ReflectingReach {
  origin: Point;
  bright: number;
  dim: number;
  polygon: Polygon;
  /** An area light's reaches beyond its area: its lit floor is their union. */
  parts?: readonly LightReachPart[];
}

/** Edges whose ends lie this far apart around their source, at most (sine), are along a ray from it: the sweep casts its rays 1e-5 apart. */
const RADIAL = 5e-4;
/** Shorter edges are no shadow. */
const MIN_EDGE = 1;
/** Most points looked at for an area light before those inside its lit floor are left out. */
const MAX_CANDIDATES = 16 * MAX_REFLECTION_SAMPLES;

interface Sample {
  point: Point;
  /** How far the light travelled to it. */
  travelled: number;
}

/** The edges of `polygon` that run along a ray from `source`: a shadow's edges, and a beam's sides. */
function shadowEdges(polygon: Polygon, source: Point): [Point, Point][] {
  const edges: [Point, Point][] = [];
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!, b = polygon[(i + 1) % polygon.length]!;
    const ax = a.x - source.x, ay = a.y - source.y, bx = b.x - source.x, by = b.y - source.y;
    const ra = Math.hypot(ax, ay), rb = Math.hypot(bx, by);
    if (Math.abs(ra - rb) < MIN_EDGE) continue;
    if (ra < 1e-6 || rb < 1e-6 || (ax * bx + ay * by > 0 && Math.abs(ax * by - ay * bx) <= RADIAL * ra * rb)) edges.push([a, b]);
  }
  return edges;
}

/** Points along `edges` about `spacing` apart, at least one per edge. */
function along(edges: readonly [Point, Point][], spacing: number): Point[] {
  const points: Point[] = [];
  for (const [a, b] of edges) {
    const n = Math.max(1, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / spacing));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      points.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  return points;
}

function totalLength(edges: readonly [Point, Point][]): number {
  return edges.reduce((sum, [a, b]) => sum + Math.hypot(b.x - a.x, b.y - a.y), 0);
}

/** The points a light's reflection is traced from, with how far its light travelled to each. */
function samples(reach: ReflectingReach, spacing: number): Sample[] {
  const { origin, polygon, parts } = reach;
  if (!parts) {
    const edges = shadowEdges(polygon, origin);
    const step = Math.max(spacing, totalLength(edges) / MAX_REFLECTION_SAMPLES);
    return along(edges, step).map((point) => ({ point, travelled: Math.hypot(point.x - origin.x, point.y - origin.y) }));
  }
  // An area light's lit floor is the union of the reaches of its outline: a shadow's edge of one
  // of them is the floor's only where no other reach and not the area itself holds the point.
  const edgesOf = parts.map((part) => shadowEdges(part.polygon, part.origin));
  const step = Math.max(spacing, edgesOf.reduce((sum, edges) => sum + totalLength(edges), 0) / MAX_CANDIDATES);
  const found: Sample[] = [];
  edgesOf.forEach((edges, i) => {
    const source = parts[i]!.origin;
    for (const point of along(edges, step)) {
      if (pointInPolygon(point, polygon) || withinAnother(point, parts, i, reach.dim)) continue;
      found.push({ point, travelled: Math.hypot(point.x - source.x, point.y - source.y) });
    }
  });
  return found;
}

/** Whether `point` lies within a reach of `parts` other than the `own` one, looking at its neighbours along the outline first. */
function withinAnother(point: Point, parts: readonly LightReachPart[], own: number, dim: number): boolean {
  for (let k = 1; k < parts.length; k++) {
    const j = (own + (k % 2 === 1 ? (k + 1) / 2 : parts.length - k / 2)) % parts.length;
    const part = parts[j]!;
    if (Math.hypot(point.x - part.origin.x, point.y - part.origin.y) <= dim && pointInPolygon(point, part.polygon)) return true;
  }
  return false;
}

/**
 * How lit a light's floor is at `travelled` from it, as the picture shows it, as a share of its
 * bright level: the light's own levels (`LIGHT_LEVELS`, the knee between them at the bright
 * radius) and its fade within the dim range (`lightFade`), without its halo.
 */
export function floorLight({ bright, dim }: Pick<ReflectingReach, 'bright' | 'dim'>, travelled: number): number {
  const t = travelled / Math.max(bright, 1);
  return ((LIGHT_LEVELS.dim + (LIGHT_LEVELS.bright - LIGHT_LEVELS.dim) / (1 + t ** 4)) / LIGHT_LEVELS.bright) * lightFade(bright, dim, travelled);
}

/**
 * How far the reflection from a point reaches when the light travelled `travelled` to it: what is
 * left of the dim range, within the reflection's own reach, which is `share` of the dim range
 * where the floor is brightly lit and less as it is less lit (`floorLight`).
 */
export function reflectionReach({ bright, dim }: Pick<ReflectingReach, 'bright' | 'dim'>, travelled: number, sampling: Pick<ReflectionSampling, 'reach'>): number {
  return Math.min(REFLECTION.share * dim * floorLight({ bright, dim }, travelled), sampling.reach, dim - travelled);
}

/**
 * Where the light `reach` lights gives some of it back: points along its shadows' edges, each
 * traced (`computeVisibility`, channel `light`, one-way walls stopping it both ways, as for area
 * lights, since the floor may lie on both sides) as far as `reflectionReach`. Points nearer a
 * wall than the clearance give nothing past it, as with area lights.
 */
export function reflectionParts(reach: ReflectingReach, walls: readonly WallSegment[], sampling: ReflectionSampling): ReflectionPart[] {
  const solid = twoWayWalls(walls);
  const found = samples(reach, sampling.spacing);
  if (found.length === 0) return [];
  const near: Seg[] = nearbySegments(found.map((sample) => sample.point), solid, sampling.clearance);
  const kept = found.filter(({ point, travelled }) => reflectionReach(reach, travelled, sampling) >= sampling.spacing
    && near.every((seg) => distToSeg(point.x, point.y, seg) >= sampling.clearance));
  return evenlyChosen(kept, MAX_REFLECTION_SAMPLES).map(({ point, travelled }) => {
    const radius = reflectionReach(reach, travelled, sampling);
    return { origin: point, reach: radius, strength: floorLight(reach, travelled), polygon: computeVisibility(point, radius, solid, undefined, 'light') };
  });
}

/** At most `count` of `items`, spread evenly over them. */
function evenlyChosen<T>(items: readonly T[], count: number): readonly T[] {
  if (items.length <= count) return items;
  return Array.from({ length: count }, (_, k) => items[Math.floor(((k + 0.5) * items.length) / count)]!);
}

/** Whether reflected light the rule counts reaches `point`. */
export function reflectedAt(point: Point, parts: readonly ReflectionPart[]): boolean {
  return parts.some((part) => Math.hypot(point.x - part.origin.x, point.y - part.origin.y) <= part.reach && inBox(point, polygonBox(part.polygon)) && pointInPolygon(point, part.polygon));
}

const areas = new WeakMap<readonly ReflectionPart[], Polygon[]>();

/**
 * Where a light's reflection lights the floor as the rule counts it, in a few outlines rather than
 * one polygon per part, for explored memory to stamp (each stamped polygon is cut into triangles
 * on every sight change): the union of the parts' polygons, worked out once per list. Only the
 * union's outer outlines: a hole in it (a pillar the reflection lies all round) is stamped too.
 */
export function reflectedArea(parts: readonly ReflectionPart[]): Polygon[] {
  let area = areas.get(parts);
  if (!area) {
    const rings = unionShapes(parts.map((part) => part.polygon.flatMap((p) => [quantizeCoordinate(p.x), quantizeCoordinate(p.y)])), [])
      .map((ring) => Array.from({ length: ring.length / 2 }, (_, i) => ({ x: ring[2 * i]! / Q_SCALE, y: ring[2 * i + 1]! / Q_SCALE })));
    const signed = rings.map(signedArea);
    const outer = Math.sign(signed.reduce((largest, a) => (Math.abs(a) > Math.abs(largest) ? a : largest), 0));
    area = rings.filter((_, i) => Math.sign(signed[i]!) === outer);
    areas.set(parts, area);
  }
  return area;
}

function signedArea(ring: Polygon): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) sum += (ring[j]!.x - ring[i]!.x) * (ring[j]!.y + ring[i]!.y);
  return sum / 2;
}

