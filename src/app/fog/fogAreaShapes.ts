/**
 * The outlines fog areas are given as they are drawn and edited: a new one fitted to its
 * neighbours, a shape joined to an area or taken away from it, and a freehand outline with few
 * enough corners to keep. An area is always one outline, so an edit that would leave two pieces
 * or nothing is none, and so is one that would leave a hole in an area that has none. An area
 * with holes (a corridor round a room: `fogKeyhole.ts`) keeps them, each on a slit of no width.
 */

import { inflateShape, intersectShapes, shapeParts, subtractShapes, unionShapes } from '../lighting/polygonClip';
import { simplifyStroke } from '../pixi/lighting/wallEdits';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { areaOfShape, hasHoles, onCornersOf, oneOutline, pointsOf, shapeOf } from './fogOutlineShape';

type Outline = readonly Point[];

/** How far, in map pixels, a simplified outline may stray from the one drawn, to begin with. */
const SIMPLIFY_TOLERANCE = 0.5;
/** And at most: about a texel of the raster rooms are found on, so an outline along walls stays on them. */
const MOST_TOLERANCE = 2;

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
  return oneOutline(subtractShapes(own, neighbours), hasHoles(own)) ?? drawn;
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

/**
 * `area` with `shapes` added to it; null where they make no single outline together: they lie
 * apart, or enclose a hole and the area has none.
 */
export function joinedArea(area: Outline, ...shapes: Outline[]): Point[] | null {
  const all = unionOf([area, ...shapes]);
  const own = shapeOf(area);
  return all && own ? oneOutline(all, hasHoles(own)) : null;
}

/**
 * Each of `areas` without what `shapes` cover of it together: undefined for an area they cover
 * nothing of (one they only touch too), which stays as it is; null where what is left is no
 * single outline: pieces, nothing, or a hole in an area that had none. The shapes are worked out
 * once, however many areas there are.
 */
export function trimmedAreas(areas: ReadonlyArray<Outline>, shapes: ReadonlyArray<Outline>): Array<Point[] | null | undefined> {
  const taken = unionOf(shapes);
  if (!taken || taken.length === 0) return areas.map(() => undefined);
  const reach = boxOf(shapes.flat());
  return areas.map((area) => {
    if (area.length < 3 || !boxesMeet(boxOf(area), reach)) return undefined;
    const own = shapeOf(area);
    if (!own || intersectShapes(own, taken).length === 0) return undefined;
    return oneOutline(subtractShapes(own, taken), hasHoles(own));
  });
}

/** The share of `outline` that `other` covers, from 0 to 1; 0 where either cannot be read or `outline` encloses nothing. */
export function coveredShare(outline: Outline, other: Outline): number {
  const [own, others] = [shapeOf(outline), shapeOf(other)];
  const whole = own ? areaOfShape(own) : 0;
  if (!own || !others || !(whole > 0)) return 0;
  return areaOfShape(intersectShapes(own, others)) / whole;
}

/** The share of `outline` that `others` cover together, from 0 to 1; 0 where it cannot be read or encloses nothing. */
export function coveredShareOfAll(outline: Outline, others: ReadonlyArray<Outline>): number {
  const own = shapeOf(outline);
  const whole = own ? areaOfShape(own) : 0;
  if (!own || !(whole > 0)) return 0;
  const box = boxOf(outline);
  // Rings of several shapes fill what any of them fills.
  const rings = others.flatMap((other) => (other.length >= 3 && boxesMeet(box, boxOf(other)) ? shapeOf(other) ?? [] : []));
  return rings.length === 0 ? 0 : areaOfShape(intersectShapes(own, rings)) / whole;
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
 * `simpler`, an outline of fewer corners, as far as it lies inside `drawn`, the outline it was
 * made of and whose shape is `shape`; null where that is no single outline. Itself where it lies
 * inside whole, to the eighth of a pixel shapes are rounded to.
 */
function keptInside(simpler: Point[], drawn: Outline, shape: QShape): Point[] | null {
  const own = shapeOf(simpler);
  if (!own) return null;
  if (subtractShapes(own, inflateShape(shape, 1, 'miter')).length === 0) return simpler;
  const inside = oneOutline(intersectShapes(own, shape));
  return inside ? onCornersOf(inside, [drawn]) : null;
}

/**
 * A closed outline with fewer corners where it has more than `maxCorners`: the fewest that stay
 * within a tolerance of it (Douglas–Peucker), the tolerance doubled until they fit, though never
 * past a texel, and nothing kept that lies outside the outline: an area never covers more than
 * was drawn or found. Where that leaves more corners than `maxCorners`, the outline has more; one
 * with holes stays as it is.
 */
export function simplifiedOutline(points: Outline, maxCorners = 200): Point[] {
  const outline = points.map((point) => ({ x: point.x, y: point.y }));
  const most = Math.max(3, Math.floor(maxCorners));
  const first = outline[0];
  if (outline.length <= most || !first) return outline;
  const shape = shapeOf(outline);
  // The slits of an outline with holes are kept to the last bit.
  if (!shape || hasHoles(shape)) return outline;
  // The outline closes on its first corner, which the simplifying keeps at both ends.
  const closed = [...outline, first];
  let best = outline;
  for (let tolerance = SIMPLIFY_TOLERANCE; tolerance <= MOST_TOLERANCE && best.length > most; tolerance *= 2) {
    const simpler = simplifyStroke(closed, tolerance).slice(0, -1);
    const kept = simpler.length >= 3 ? keptInside(simpler, outline, shape) : null;
    if (kept && kept.length >= 3 && kept.length < best.length) best = kept;
  }
  return best;
}
