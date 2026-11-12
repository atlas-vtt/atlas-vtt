/**
 * The area a measurement covers, in world pixels: its outline as a polygon, for drawing and
 * clipping, and a point test that asks the shape itself, so a circle's test is a circle's and
 * not its polygon's. An area has two points, its origin and the end it was dragged to.
 */

import type { Point } from '../types/visionTypes';
import type { Box } from '../vision/polygonBounds';
import type { ConeEnd } from './areaRules';
import type { Measurement } from './measureTypes';

/**
 * How far outside its edge a point still lies in an area, world pixels. Edges count as inside, and
 * snapped areas put their edges through cell centres: without it the rounding of a corner would
 * decide whether a row of cells is covered.
 */
export const EDGE_TOLERANCE = 1e-6;

/** An area on the map as the cell, token and wall rules read it. */
export interface MeasureArea {
  /** Its outline: one ring of corners (the last joins the first), or more where walls cut it apart. */
  readonly rings: readonly (readonly Point[])[];
  readonly bounds: Box;
  /** Whether `point` lies in the area, its edge included. */
  contains(point: Point): boolean;
  /**
   * A line's middle line, from its origin to its end or to where walls stop it. The cells it runs
   * through are the line's under every cell rule (`cellsInArea`); other areas have none.
   */
  readonly spine?: readonly [Point, Point];
}

/** An area as its measurement shapes it, before walls cut it. */
export interface ShapedArea extends MeasureArea {
  readonly origin: Point;
  /** The direction it was dragged in, one pixel long; null for a circle, which has none. */
  readonly towards: Point | null;
  /** How far from the origin its farthest point lies. */
  readonly reach: number;
}

/** What shapes an area besides its two points. */
export interface AreaShapeRules {
  /** The full opening of a cone, degrees. */
  readonly coneAngle: number;
  /** A cone that opens half a turn or more has no flat end and is round whatever this says. */
  readonly coneEnd: ConeEnd;
  /** The width of a line that names none (one cell), world pixels. */
  readonly lineWidth: number;
}

/** A circle's polygon lies within this of the circle, world pixels, while it has corners to spare. */
const ARC_SAGITTA = 0.25;
const MIN_CIRCLE_CORNERS = 32;
const MAX_CIRCLE_CORNERS = 128;
const TURN = 2 * Math.PI;

/**
 * The corners of a circle's polygon: enough to stay within a quarter pixel of the circle, between
 * 32 and 128, in eights so that its outermost points lie on it along both axes and diagonals.
 */
export function circleCorners(radius: number): number {
  const needed = Math.PI / Math.acos(Math.max(0, 1 - ARC_SAGITTA / radius));
  return Math.ceil(Math.min(MAX_CIRCLE_CORNERS, Math.max(MIN_CIRCLE_CORNERS, needed)) / 8) * 8;
}

/** The box around `rings`. */
export function ringBounds(rings: readonly (readonly Point[])[]): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const ring of rings) {
    for (const { x, y } of ring) {
      if (x < box.minX) box.minX = x;
      if (x > box.maxX) box.maxX = x;
      if (y < box.minY) box.minY = y;
      if (y > box.maxY) box.maxY = y;
    }
  }
  return box;
}

function circle(origin: Point, radius: number, towards: Point | null): ShapedArea {
  const corners = circleCorners(radius);
  const ring = Array.from({ length: corners }, (_, i) => {
    const angle = (TURN * i) / corners;
    return { x: origin.x + radius * Math.cos(angle), y: origin.y + radius * Math.sin(angle) };
  });
  const limit = (radius + EDGE_TOLERANCE) ** 2;
  return {
    origin,
    towards,
    reach: radius,
    rings: [ring],
    bounds: { minX: origin.x - radius, minY: origin.y - radius, maxX: origin.x + radius, maxY: origin.y + radius },
    contains: (point) => (point.x - origin.x) ** 2 + (point.y - origin.y) ** 2 <= limit,
  };
}

function cone(origin: Point, towards: Point, length: number, angle: number, end: ConeEnd): ShapedArea | null {
  if (!(angle > 0)) return null;
  if (angle >= 360) return circle(origin, length, towards);
  const half = (angle * Math.PI) / 360;
  const sin = Math.sin(half);
  const cos = Math.cos(half);
  const flat = end === 'flat' && angle < 180;
  const limit = (length + EDGE_TOLERANCE) ** 2;
  const contains = (point: Point): boolean => {
    const x = point.x - origin.x;
    const y = point.y - origin.y;
    const along = x * towards.x + y * towards.y;
    const across = Math.abs(x * towards.y - y * towards.x);
    // The distance past the cone's side: the point's distance from the apex times the sine of the angle it lies beyond it.
    if (across * cos - along * sin > EDGE_TOLERANCE) return false;
    return flat ? along <= length + EDGE_TOLERANCE : x * x + y * y <= limit;
  };
  const ring: Point[] = [{ x: origin.x, y: origin.y }];
  if (flat) {
    const side = (length * sin) / cos;
    const far = { x: origin.x + towards.x * length, y: origin.y + towards.y * length };
    ring.push({ x: far.x + towards.y * side, y: far.y - towards.x * side }, { x: far.x - towards.y * side, y: far.y + towards.x * side });
  } else {
    const base = Math.atan2(towards.y, towards.x);
    const steps = Math.max(1, Math.ceil((circleCorners(length) * angle) / 360));
    for (let i = 0; i <= steps; i++) {
      const at = base - half + (2 * half * i) / steps;
      ring.push({ x: origin.x + length * Math.cos(at), y: origin.y + length * Math.sin(at) });
    }
  }
  // The arc reaches past its polygon where it crosses an axis.
  const outermost = [{ x: origin.x + length, y: origin.y }, { x: origin.x - length, y: origin.y }, { x: origin.x, y: origin.y + length }, { x: origin.x, y: origin.y - length }];
  const bounds = ringBounds([flat ? ring : [...ring, ...outermost.filter(contains)]]);
  return { origin, towards, reach: flat ? length / cos : length, rings: [ring], bounds, contains };
}

/** A box from the middle of its near side, `length` along `towards` and `halfWidth` to either side. */
function box(origin: Point, towards: Point, length: number, halfWidth: number): ShapedArea | null {
  if (!(halfWidth > 0) || !Number.isFinite(halfWidth)) return null;
  const sideX = -towards.y * halfWidth;
  const sideY = towards.x * halfWidth;
  const farX = origin.x + towards.x * length;
  const farY = origin.y + towards.y * length;
  const ring = [
    { x: origin.x - sideX, y: origin.y - sideY },
    { x: origin.x + sideX, y: origin.y + sideY },
    { x: farX + sideX, y: farY + sideY },
    { x: farX - sideX, y: farY - sideY },
  ];
  return {
    origin,
    towards,
    reach: Math.hypot(length, halfWidth),
    rings: [ring],
    bounds: ringBounds([ring]),
    contains: (point) => {
      const x = point.x - origin.x;
      const y = point.y - origin.y;
      const along = x * towards.x + y * towards.y;
      return along >= -EDGE_TOLERANCE && along <= length + EDGE_TOLERANCE && Math.abs(x * towards.y - y * towards.x) <= halfWidth + EDGE_TOLERANCE;
    },
  };
}

/**
 * The area of `measurement`: a circle around its origin as far as its end; a cone from its origin
 * towards its end, as long as the drag; a square whose near side has the origin at its middle, as
 * long and as wide as the drag; a line from its origin as long as the drag and its width wide.
 * Null for a ruler, and for an area without a size or with points that are no place.
 */
export function shapedArea(measurement: Measurement, rules: AreaShapeRules): ShapedArea | null {
  const [origin, end] = measurement.points;
  if (measurement.shape === 'ruler' || !origin || !end) return null;
  const x = end.x - origin.x;
  const y = end.y - origin.y;
  const length = Math.hypot(x, y);
  if (!(length > 0) || !Number.isFinite(length) || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null;
  const towards = { x: x / length, y: y / length };
  switch (measurement.shape) {
    case 'circle':
      return circle(origin, length, null);
    case 'cone':
      return cone(origin, towards, length, rules.coneAngle, rules.coneEnd);
    case 'square':
      return box(origin, towards, length, length / 2);
    case 'line': {
      const line = box(origin, towards, length, (measurement.width ?? rules.lineWidth) / 2);
      return line && { ...line, spine: [origin, { x: origin.x + towards.x * length, y: origin.y + towards.y * length }] };
    }
  }
}
