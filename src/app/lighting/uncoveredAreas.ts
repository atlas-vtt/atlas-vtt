import { Q_SCALE, type QPolygon, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { normalizePolygon, subtractToAreas, unionShapes } from './polygonClip';
import { quantizeCoordinate } from './quantizedPoint';

/** A filled outline and the holes in it, each as [x0, y0, x1, y1, …] in world pixels. */
export interface FilledArea {
  outline: number[];
  holes: number[][];
}

function unionOf(polygons: readonly (readonly Point[])[]): QShape {
  let shape: QShape = [];
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    // Each outline by itself first: one that runs the other way round must not cancel another.
    shape = unionShapes(shape, normalizePolygon(polygon.flatMap((point) => [quantizeCoordinate(point.x), quantizeCoordinate(point.y)])));
  }
  return shape;
}

function worldRing(ring: QPolygon): number[] {
  return ring.map((coordinate) => coordinate / Q_SCALE);
}

/**
 * What is left of `covered` once `open` is taken out, each read as the union of its polygons.
 * The holes of an area lie inside its outline and apart from each other, which a drawer that
 * cuts holes one by one cannot be given by polygons that overlap or reach past the outline.
 * Throws a `RangeError` for a polygon with a corner that is no number or lies millions of pixels out.
 */
export function uncoveredAreas(covered: readonly (readonly Point[])[], open: readonly (readonly Point[])[]): FilledArea[] {
  const coveredShape = unionOf(covered);
  if (coveredShape.length === 0) return [];
  return subtractToAreas(coveredShape, unionOf(open)).map(({ outline, holes }) => ({ outline: worldRing(outline), holes: holes.map(worldRing) }));
}
