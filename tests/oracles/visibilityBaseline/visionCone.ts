// Frozen from 29c9495a56eeb8e49b86ff5b2a51d4312bb31dcd src/app/vision/visionCone.ts. Only import paths are adapted.
import type { Point } from '../../../src/app/types/visionTypes';
import type { Polygon } from './visibility';
import { positiveNumber } from '../../../src/app/utils/numberInput';
import { angleTo, raySegmentIntersect } from './visionGeometry';

const TURN = 2 * Math.PI;
const DEGREE = Math.PI / 180;
const FULL_TURN_DEGREES = 360;
/** Relative angles this close to a cone edge count as on it. */
const EDGE_SLACK = 1e-9;
/** Largest angle between two points of the viewer's own space outside its cone; the chords stay within a tenth of a pixel of a 60 px circle. */
const ARC_STEP = (2 * Math.PI) / 64;

/** Where a token looks, in world radians (`atan2` on the y-down map), and how wide it sees. */
export interface VisionCone {
  facing: number;
  /** Full width in radians, below a full turn. */
  angle: number;
  /**
   * Radius of the viewer's own space, in world pixels (half the token's size): seen all around,
   * as in Foundry, so a token never darkens half its own art. Unset or 0 closes the cone at the viewer.
   */
  apex?: number;
}

/**
 * The cone of a token with `rotation` (degrees) seeing `angle` degrees wide, or none when it
 * sees all around. Rotation follows the token renderer (`SpriteFactory` sets the art sprite's
 * `rotation` to these degrees in radians): 0 faces the art's up, which is up on the map, and
 * positive turns clockwise on screen, so 90 faces right. On the y-down map that is the world
 * angle `rotation - 90°`.
 */
export function visionCone(rotation: number | undefined, angle: number | undefined, apex = 0): VisionCone | undefined {
  const degrees = coneAngle(angle);
  if (degrees === undefined) return undefined;
  return { facing: ((rotation ?? 0) - 90) * DEGREE, angle: degrees * DEGREE, ...(apex > 0 && { apex }) };
}

/** Whether two cones are the same: none both, or the same facing, width and own space. */
export function sameCone(a: VisionCone | undefined, b: VisionCone | undefined): boolean {
  return a === b || (!!a && !!b && a.facing === b.facing && a.angle === b.angle && (a.apex ?? 0) === (b.apex ?? 0));
}

/**
 * The width in degrees of a vision cone set to `angle`: at least one degree, below a full turn.
 * Undefined (seeing all around) for 360 or more and for anything that is not a positive number.
 * The one check for stored angles, typed ones and the cone itself.
 */
export function coneAngle(angle: unknown): number | undefined {
  const degrees = positiveNumber(angle);
  return degrees !== undefined && degrees < FULL_TURN_DEGREES ? Math.max(1, degrees) : undefined;
}

/** Whether `point` lies in the cone of a viewer at `origin`, or within its own space. */
export function coneContains(cone: VisionCone, origin: Point, point: Point): boolean {
  if (Math.hypot(point.x - origin.x, point.y - origin.y) <= (cone.apex ?? 0)) return true;
  const start = cone.facing - cone.angle / 2;
  const turned = (((Math.atan2(point.y - origin.y, point.x - origin.x) - start) % TURN) + TURN) % TURN;
  return turned <= cone.angle + EDGE_SLACK || turned >= TURN - EDGE_SLACK;
}

/**
 * The part of `polygon` (star-shaped around `origin`) inside the cone: its vertices within the
 * cone, closed through the origin by the cone's two edges. The edges end where they cross the
 * polygon's outline, so the result never reaches beyond it and stays star-shaped around the origin.
 * With an `apex`, the rest of the way round the polygon is kept within that radius instead: the
 * cone and the viewer's own space, both cut to the polygon, so clipping still only removes sight.
 */
export function clipToCone(origin: Point, polygon: Polygon, cone: VisionCone): Polygon {
  const start = cone.facing - cone.angle / 2;
  const end = start + cone.angle;
  const inCone = [outlineAt(origin, polygon, start), ...within(origin, polygon, start, cone.angle), outlineAt(origin, polygon, end)];
  const apex = cone.apex ?? 0;
  if (!(apex > 0)) return [{ ...origin }, ...inCone];
  return withoutRepeats([...inCone, ...outlineWithin(origin, polygon, end, TURN - cone.angle, apex)]);
}

/** The polygon's vertices strictly between `from` and `from + span`, in angular order. */
function within(origin: Point, points: Polygon, from: number, span: number): Point[] {
  return points
    .map((point) => ({ point, rel: relativeAngle(angleTo(origin, point) - from) }))
    .filter(({ rel }) => rel > EDGE_SLACK && rel < span - EDGE_SLACK)
    .sort((a, b) => a.rel - b.rel)
    .map(({ point }) => point);
}

/**
 * The polygon's outline from `from` over `span`, pulled in to at most `radius` from the origin,
 * ends included. Its points are every vertex, every crossing of the outline with the circle
 * and the circle sampled every `ARC_STEP`, so between two neighbours the outline is one straight
 * piece lying wholly inside or wholly outside the circle: each chord then runs along the outline
 * or across the circle within the triangle that piece spans with the origin, never outside the polygon.
 */
function outlineWithin(origin: Point, polygon: Polygon, from: number, span: number, radius: number): Polygon {
  const candidates: Point[] = [];
  polygon.forEach((vertex, i) => {
    candidates.push(pullIn(origin, vertex, radius), ...circleCrossings(origin, vertex, polygon[(i + 1) % polygon.length]!, radius));
  });
  const steps = Math.ceil(span / ARC_STEP);
  for (let i = 1; i < steps; i++) candidates.push(pullIn(origin, outlineAt(origin, polygon, from + (span * i) / steps), radius));
  return [
    pullIn(origin, outlineAt(origin, polygon, from), radius),
    ...within(origin, candidates, from, span),
    pullIn(origin, outlineAt(origin, polygon, from + span), radius),
  ];
}

/** `point`, moved along its ray from the origin to at most `radius` away. */
function pullIn(origin: Point, point: Point, radius: number): Point {
  const d = Math.hypot(point.x - origin.x, point.y - origin.y);
  if (d <= radius) return point;
  return { x: origin.x + ((point.x - origin.x) * radius) / d, y: origin.y + ((point.y - origin.y) * radius) / d };
}

/** Where the segment from `a` to `b` crosses the circle of `radius` around the origin. */
function circleCrossings(origin: Point, a: Point, b: Point, radius: number): Point[] {
  const dx = b.x - a.x, dy = b.y - a.y;
  const fx = a.x - origin.x, fy = a.y - origin.y;
  const qa = dx * dx + dy * dy;
  if (qa === 0) return [];
  const qb = 2 * (fx * dx + fy * dy);
  const disc = qb * qb - 4 * qa * (fx * fx + fy * fy - radius * radius);
  if (disc <= 0) return [];
  const root = Math.sqrt(disc);
  return [(-qb - root) / (2 * qa), (-qb + root) / (2 * qa)]
    .filter((t) => t > 0 && t < 1)
    .map((t) => ({ x: a.x + t * dx, y: a.y + t * dy }));
}

/** Drops points equal to the one before them (or, for the last, the first): a cone edge ending inside the viewer's own space. */
function withoutRepeats(polygon: Polygon): Polygon {
  const kept = polygon.filter((p, i) => i === 0 || !samePoint(p, polygon[i - 1]!));
  return kept.length > 1 && samePoint(kept[kept.length - 1]!, kept[0]!) ? kept.slice(0, -1) : kept;
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a.x - b.x) < 1e-9 && Math.abs(a.y - b.y) < 1e-9;
}

/** `angle` in [0, 2π). */
function relativeAngle(angle: number): number {
  const rel = ((angle % TURN) + TURN) % TURN;
  return rel > TURN - EDGE_SLACK ? 0 : rel;
}

/** Where the ray from `origin` at `angle` leaves the polygon; the origin itself if it misses (never, for a star-shaped polygon). */
function outlineAt(origin: Point, polygon: Polygon, angle: number): Point {
  let reach = Infinity;
  for (let i = 0; i < polygon.length; i++) {
    reach = Math.min(reach, raySegmentIntersect(origin, angle, polygon[i]!, polygon[(i + 1) % polygon.length]!));
  }
  if (!Number.isFinite(reach)) return { ...origin };
  return { x: origin.x + Math.cos(angle) * reach, y: origin.y + Math.sin(angle) * reach };
}
