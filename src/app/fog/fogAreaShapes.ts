/**
 * The outlines fog areas are given as they are drawn and edited: a new one fitted to its
 * neighbours, a shape joined to an area or taken away from it, and a freehand outline with few
 * enough corners to keep. An area is always one outline without holes, so an edit that would
 * leave two pieces, a hole or nothing is none.
 */

import { intersectShapes, normalizePolygon, shapeParts, subtractShapes, unionShapes } from '../lighting/polygonClip';
import { quantizeCoordinate } from '../lighting/quantizedPoint';
import { simplifyStroke } from '../pixi/lighting/wallEdits';
import { Q_SCALE, type QPolygon, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';

type Outline = readonly Point[];

/** How far, in map pixels, a simplified outline may stray from the one drawn, to begin with. */
const SIMPLIFY_TOLERANCE = 0.5;

/** The filled shape of an outline, crossings resolved; null where a corner is no place fog can reach. */
function shapeOf(outline: Outline): QShape | null {
  try {
    return normalizePolygon(outline.flatMap((point) => [quantizeCoordinate(point.x), quantizeCoordinate(point.y)]));
  } catch {
    return null;
  }
}

function pointsOf(ring: QPolygon): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < ring.length; i += 2) points.push({ x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE });
  return points;
}

/** The corners of a shape that is one outline without holes; null for any other. */
function oneOutline(shape: QShape): Point[] | null {
  const [only] = shape;
  return only && shape.length === 1 ? pointsOf(only) : null;
}

interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boxOf(outline: Outline): Box {
  const box: Box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const { x, y } of outline) {
    if (x < box.minX) box.minX = x;
    if (y < box.minY) box.minY = y;
    if (x > box.maxX) box.maxX = x;
    if (y > box.maxY) box.maxY = y;
  }
  return box;
}

const boxesMeet = (a: Box, b: Box): boolean => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY;

/**
 * A new area fitted to its neighbours: `shape` without what `others` already cover, where that
 * is one outline without holes. Where it is not (the neighbours cut it in two, leave a hole in
 * it or cover it whole), and where it meets none of them, the shape as it was drawn.
 */
export function fittedArea(shape: Outline, others: ReadonlyArray<Outline>): Point[] {
  const drawn = shape.map((point) => ({ x: point.x, y: point.y }));
  const own = shapeOf(shape);
  if (!own || own.length === 0) return drawn;
  const box = boxOf(shape);
  let neighbours: QShape = [];
  for (const other of others) {
    if (other.length < 3 || !boxesMeet(box, boxOf(other))) continue;
    const covered = shapeOf(other);
    if (covered) neighbours = unionShapes(neighbours, covered);
  }
  if (neighbours.length === 0 || intersectShapes(own, neighbours).length === 0) return drawn;
  return oneOutline(subtractShapes(own, neighbours)) ?? drawn;
}

/** The shape `outlines` cover together; null where one of them cannot be read. */
function unionOf(outlines: ReadonlyArray<Outline>): QShape | null {
  let all: QShape = [];
  for (const outline of outlines) {
    const shape = shapeOf(outline);
    if (!shape) return null;
    all = unionShapes(all, shape);
  }
  return all;
}

/** `area` with `shapes` added to it; null where they make no single outline without holes together (they lie apart, or enclose a hole). */
export function joinedArea(area: Outline, ...shapes: Outline[]): Point[] | null {
  const all = unionOf([area, ...shapes]);
  return all ? oneOutline(all) : null;
}

/**
 * Each of `areas` without what `shapes` cover of it together: undefined for an area they cover
 * nothing of (one they only touch too), which stays as it is; null where what is left is no
 * single outline without holes. The shapes are worked out once, however many areas there are.
 */
export function trimmedAreas(areas: ReadonlyArray<Outline>, shapes: ReadonlyArray<Outline>): Array<Point[] | null | undefined> {
  const taken = unionOf(shapes);
  if (!taken || taken.length === 0) return areas.map(() => undefined);
  const reach = boxOf(shapes.flat());
  return areas.map((area) => {
    if (area.length < 3 || !boxesMeet(boxOf(area), reach)) return undefined;
    const own = shapeOf(area);
    if (!own || intersectShapes(own, taken).length === 0) return undefined;
    return oneOutline(subtractShapes(own, taken));
  });
}

/**
 * The outer outlines of what `shapes` cover together, one per piece: shapes that touch are one
 * piece, and what a piece encloses belongs to it. Shapes that lie apart, each one outline, come
 * back as they were given, to the last bit.
 */
export function outerOutlines(shapes: ReadonlyArray<Outline>): Point[][] {
  const given = shapes.map((shape) => shape.map((point) => ({ x: point.x, y: point.y })));
  if (given.length <= 1) return given;
  const all = unionOf(shapes);
  if (!all) return given;
  const parts = shapeParts(all);
  if (parts.length === given.length && parts.every((part) => part.holes.length === 0)) return given;
  return parts.map((part) => pointsOf(part.outline));
}

/**
 * A closed outline with at most `maxCorners` corners: itself where it has no more, else the
 * fewest corners that stay within a tolerance of it (Douglas–Peucker), the tolerance doubled
 * until they fit.
 */
export function simplifiedOutline(points: Outline, maxCorners = 200): Point[] {
  const outline = points.map((point) => ({ x: point.x, y: point.y }));
  const most = Math.max(3, Math.floor(maxCorners));
  const first = outline[0];
  if (outline.length <= most || !first) return outline;
  // The outline closes on its first corner, which the simplifying keeps at both ends.
  const closed = [...outline, first];
  for (let tolerance = SIMPLIFY_TOLERANCE; Number.isFinite(tolerance); tolerance *= 2) {
    const simpler = simplifyStroke(closed, tolerance).slice(0, -1);
    // A scribble smaller than the tolerance comes to a point: its corners are thinned evenly instead.
    if (simpler.length <= most) return simpler.length >= 3 ? simpler : evenly(outline, most);
  }
  return evenly(outline, most);
}

/** `count` of the outline's corners, evenly spread along it. */
function evenly(outline: readonly Point[], count: number): Point[] {
  return Array.from({ length: count }, (_, index) => outline[Math.floor((index * outline.length) / count)]!);
}
