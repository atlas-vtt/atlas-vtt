/**
 * An area that stops at walls: its shape cut by what a straight way from its origin reaches, with
 * the sweep light uses. No channel is named, so every wall that stops sight or light stops the
 * area, closed doors too, open doors not. Hand it the walls light is traced through (the scene
 * model's sealed walls), or it passes the gaps light does not.
 */

import { intersectShapes } from '../lighting/polygonClip';
import { quantizeCoordinate } from '../lighting/quantizedPoint';
import { MAX_Q, Q_SCALE, type QPolygon } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';
import { indexOutline, outlineAt, type OutlineIndex } from '../vision/outlineIndex';
import { computeVisibility, type Polygon } from '../vision/visibility';
import { blocksInReach } from '../vision/wallReach';
import { EDGE_TOLERANCE, ringBounds, type MeasureArea, type ShapedArea } from './measureGeometry';

/**
 * How far along its direction an area is reached from, world pixels. A wall its origin lies on
 * stops nothing for the sweep, and areas start on cell corners and edges, where walls run: reached
 * from just inside, a cone from a wall's foot stays on the side it points to.
 */
const INSIDE = 1 / Q_SCALE;
/** The sweep's edge is a polygon of chords, which must not cut into the area: its radius is this much more than the area's reach. */
const CHORD_ROOM = 1.002;
const MIN_SWEEP_RADIUS = 256;
/** The sweeps kept for one list of walls. */
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

/** The point the walls are swept from for `area`: its origin, or just inside it for an area with a direction. */
export function wallSweepPoint(area: ShapedArea): Point {
  const { origin, towards } = area;
  return towards ? { x: origin.x + towards.x * INSIDE, y: origin.y + towards.y * INSIDE } : origin;
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
    const oldest = kept.keys().next();
    if (kept.size >= MAX_SWEEPS && !oldest.done) kept.delete(oldest.value);
    kept.set(key, sweep);
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

/**
 * `area` as `walls` leave it: what of it a straight way from its origin reaches. Its outline is
 * the shape's cut with the sweep's (to an eighth of a pixel), a point is in it when it is in the
 * shape and reached, and a line's middle line ends where the sweep does. The area itself where no
 * wall stands in its reach, and nothing where it lies beyond what clipping can hold (two million
 * pixels from the map's corner).
 */
export function areaWithinWalls(area: ShapedArea, walls: readonly WallSegment[]): MeasureArea {
  const from = wallSweepPoint(area);
  const sweep = sweepFrom(from, area.reach + INSIDE, walls);
  if (!sweep) return area;
  const outline = area.rings.map(quantized);
  if (!sweep.ring || outline.some((ring) => ring === null)) return NOTHING;
  const rings = intersectShapes(outline.filter((ring) => ring !== null), [sweep.ring]).map((ring) => {
    const corners: Point[] = [];
    for (let i = 0; i < ring.length; i += 2) corners.push({ x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE });
    return corners;
  });
  return {
    rings,
    bounds: ringBounds(rings),
    contains: (point) => area.contains(point) && reached(sweep, point),
    ...(area.spine && { spine: spineWithin(sweep, area.spine) }),
  };
}
