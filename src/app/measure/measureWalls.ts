/**
 * An area that stops at walls: its shape cut by what a straight way from its origin reaches, with
 * the sweep light uses. No channel is named, so every wall that stops sight or light stops the
 * area, closed doors too, open doors not. Hand it the walls light is traced through (the scene
 * model's sealed walls), or it passes the gaps light does not.
 */

import { intersectShapes } from '../lighting/polygonClip';
import { quantizeCoordinate } from '../lighting/quantizedPoint';
import { blocksNothing, distToSeg, segOf } from '../lighting/segments';
import { MAX_Q, Q_SCALE, type QPolygon } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { indexOutline, outlineAt, type OutlineIndex } from '../vision/outlineIndex';
import { computeVisibility, type Polygon } from '../vision/visibility';
import { blocksInReach } from '../vision/wallReach';
import { EDGE_TOLERANCE, ringBounds, type MeasureArea, type ShapedArea } from './measureGeometry';

/**
 * How far from its origin an area is reached from where that lies on a wall, world pixels. A wall
 * the sweep starts on stops nothing for it, and areas start on cell corners and edges, where walls
 * run: reached from just beside the wall, an area stays on the side it was dragged to.
 */
const INSIDE = 1 / Q_SCALE;
/** An origin this near a wall lies on it. */
const ON_WALL = INSIDE / 2;
const TURN = 2 * Math.PI;
/** The sweep's edge is a polygon of chords, which must not cut into the area: its radius is this much more than the area's reach. */
const CHORD_ROOM = 1.002;
const MIN_SWEEP_RADIUS = 256;
/** The sweeps kept for one list of walls, and the origins whose walls are remembered. */
const MAX_SWEEPS = 64;

/** What a straight way from `origin` reaches within `radius`. */
interface Sweep {
  readonly origin: Point;
  readonly polygon: Polygon;
  readonly index: OutlineIndex | null;
  /** The polygon for clipping; null where it lies beyond what clipping can hold. */
  readonly ring: QPolygon | null;
}

const sweeps = new WeakMap<readonly WallSegment[], Map<string, Sweep | null>>();
const raysAt = new WeakMap<readonly WallSegment[], Map<string, readonly number[]>>();
const NOTHING: MeasureArea = { rings: [], bounds: ringBounds([]), contains: () => false };

function quantized(ring: readonly Point[]): QPolygon | null {
  const limit = MAX_Q / Q_SCALE;
  const coordinates: number[] = [];
  for (const { x, y } of ring) {
    if (!(Math.abs(x) < limit) || !(Math.abs(y) < limit)) return null;
    coordinates.push(quantizeCoordinate(x), quantizeCoordinate(y));
  }
  return coordinates;
}

/** Keeps `value` under `key`, the oldest entry giving way once `MAX_SWEEPS` are held. */
function remember<T>(kept: Map<string, T>, key: string, value: T): void {
  const oldest = kept.keys().next();
  if (kept.size >= MAX_SWEEPS && !oldest.done) kept.delete(oldest.value);
  kept.set(key, value);
}

/**
 * The ways the walls that `origin` lies on lead away from it, as angles in rising order: one for a
 * wall that ends there, two for one that passes. None where it lies on no wall that stops anything.
 * Kept by the walls and the origin, so asking again while an area is dragged looks at no wall.
 */
function wallRaysAt(origin: Point, walls: readonly WallSegment[]): readonly number[] {
  let kept = raysAt.get(walls);
  if (!kept) raysAt.set(walls, (kept = new Map<string, readonly number[]>()));
  const key = `${origin.x},${origin.y}`;
  let rays = kept.get(key);
  if (!rays) {
    const found: number[] = [];
    for (const wall of walls) {
      if (blocksNothing(wall) || distToSeg(origin.x, origin.y, segOf(wall)) > ON_WALL) continue;
      for (const end of [wall.p1, wall.p2]) {
        const x = end.x - origin.x;
        const y = end.y - origin.y;
        if (Math.hypot(x, y) > ON_WALL) found.push(Math.atan2(y, x));
      }
    }
    rays = found.sort((a, b) => a - b);
    remember(kept, key, rays);
  }
  return rays;
}

/**
 * The point the walls are swept from for an area: its origin. Where that lies on walls, they part
 * the ground around it, and the area is reached from just inside the part it points into, halfway
 * between the two walls beside its direction. Every direction into one part gives the same point,
 * so an area turned or resized there is swept once.
 */
export function wallSweepPoint({ origin, towards }: Pick<ShapedArea, 'origin' | 'towards'>, walls: readonly WallSegment[]): Point {
  const rays = wallRaysAt(origin, walls);
  if (rays.length === 0) return origin;
  const angle = Math.atan2(towards.y, towards.x);
  let before = 0;
  while (before < rays.length && rays[before]! <= angle) before++;
  const from = before > 0 ? rays[before - 1]! : rays[rays.length - 1]! - TURN;
  const to = before < rays.length ? rays[before]! : rays[0]! + TURN;
  const middle = (from + to) / 2;
  return { x: origin.x + Math.cos(middle) * INSIDE, y: origin.y + Math.sin(middle) * INSIDE };
}

/**
 * The sweep from `origin` that holds everything within `reach`; null where no wall stands that
 * near, so nothing is cut. Its radius is a power of two, so an area that grows or shrinks is swept
 * again only when it passes one: the sweep depends on the origin and the walls alone, and is kept
 * by them.
 */
function sweepFrom(origin: Point, reach: number, walls: readonly WallSegment[]): Sweep | null {
  const radius = Math.max(MIN_SWEEP_RADIUS, 2 ** Math.ceil(Math.log2(reach * CHORD_ROOM)));
  let kept = sweeps.get(walls);
  if (!kept) sweeps.set(walls, (kept = new Map<string, Sweep | null>()));
  const key = `${origin.x},${origin.y},${radius}`;
  let sweep = kept.get(key);
  if (sweep === undefined) {
    sweep = null;
    if (walls.some((wall) => blocksInReach(wall, origin, radius * radius))) {
      const polygon = computeVisibility(origin, radius, walls);
      sweep = { origin, polygon, index: indexOutline(origin, polygon), ring: quantized(polygon) };
    }
    remember(kept, key, sweep);
  }
  return sweep;
}

/** Whether `point` lies within the sweep: no farther from its origin than its outline is that way. */
function reached({ origin, polygon, index }: Sweep, point: Point): boolean {
  const x = point.x - origin.x;
  const y = point.y - origin.y;
  const distance = Math.hypot(x, y);
  if (distance <= EDGE_TOLERANCE) return true;
  const edge = outlineAt(origin, polygon, Math.atan2(y, x), index);
  return distance <= Math.hypot(edge.x - origin.x, edge.y - origin.y) + EDGE_TOLERANCE;
}

/** A line's middle line as far as the sweep reaches along it. */
function spineWithin(sweep: Sweep, [from, to]: readonly [Point, Point]): readonly [Point, Point] {
  const { origin, polygon, index } = sweep;
  const x = to.x - origin.x;
  const y = to.y - origin.y;
  const edge = outlineAt(origin, polygon, Math.atan2(y, x), index);
  return Math.hypot(x, y) <= Math.hypot(edge.x - origin.x, edge.y - origin.y) ? [from, to] : [from, edge];
}

/** What of `shapes` (rings of corners) `sweep` reaches; null where one lies beyond what clipping can hold. */
function cutBy(sweep: Sweep, shapes: readonly (readonly Point[])[]): Point[][] | null {
  if (!sweep.ring) return null;
  const outlines: QPolygon[] = [];
  for (const shape of shapes) {
    const outline = quantized(shape);
    if (!outline) return null;
    outlines.push(outline);
  }
  return intersectShapes(outlines, [sweep.ring]).map((ring) => {
    const corners: Point[] = [];
    for (let i = 0; i < ring.length; i += 2) corners.push({ x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE });
    return corners;
  });
}

/**
 * `area` as `walls` leave it: what of it a straight way from its origin reaches (from just beside
 * the walls its origin lies on, `wallSweepPoint`). Its outline is
 * the shape's cut with the sweep's (to an eighth of a pixel), a point is in it when it is in the
 * shape and reached, and a line's middle line ends where the sweep does. The area itself where no
 * wall stands in its reach, and nothing where it lies beyond what clipping can hold (two million
 * pixels from the map's corner).
 */
export function areaWithinWalls(area: ShapedArea, walls: readonly WallSegment[]): MeasureArea {
  const from = wallSweepPoint(area, walls);
  const sweep = sweepFrom(from, area.reach + INSIDE, walls);
  if (!sweep) return area;
  const rings = cutBy(sweep, area.rings);
  if (!rings) return NOTHING;
  return {
    rings,
    bounds: ringBounds(rings),
    contains: (point) => area.contains(point) && reached(sweep, point),
    ...(area.spine && { spine: spineWithin(sweep, area.spine) }),
  };
}

/**
 * What `walls` leave of `shapes` (rings of corners) that are drawn with `area` and lie no farther
 * than `beyond` past its reach, as the tint of a cell it covers does: what a straight way from the
 * area's origin reaches of them, by the sweep the area itself is cut with, taken that much farther
 * so that its own edge cuts nothing. The shapes themselves where no wall stands that near.
 */
export function shapesWithinWalls(area: ShapedArea, walls: readonly WallSegment[], shapes: readonly (readonly Point[])[], beyond: number): readonly (readonly Point[])[] {
  const sweep = sweepFrom(wallSweepPoint(area, walls), area.reach + beyond + INSIDE, walls);
  return sweep ? cutBy(sweep, shapes) ?? [] : shapes;
}
