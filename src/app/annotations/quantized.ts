/**
 * World points on the clipping library's grid and back. The grid is eighths of a pixel
 * (`Q_SCALE`), so whatever comes back from a clip lies within a sixteenth of a pixel of where
 * exact arithmetic would put it, on each axis.
 */

import { shapeParts } from '../lighting/polygonClip';
import { quantizeCoordinate } from '../lighting/quantizedPoint';
import { MAX_Q, Q_SCALE, type QPolygon, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';

/** An area as it is filled: its outline and the rings cut out of it, world pixels, none with a repeated closing point. */
export interface FilledPart {
  readonly outline: Point[];
  readonly holes: Point[][];
}

const LIMIT = MAX_Q / Q_SCALE;

/** Whether every point lies where the grid can hold it (two million pixels from the origin); a clip of others throws. */
export function onClipGrid(points: readonly Point[], margin = 0): boolean {
  const limit = LIMIT - margin;
  for (const { x, y } of points) {
    if (!(Math.abs(x) <= limit) || !(Math.abs(y) <= limit)) return false;
  }
  return true;
}

/** A length on the grid. */
export function lengthQ(pixels: number): number {
  return Math.round(pixels * Q_SCALE);
}

/** `points` as a line or ring of the grid; they must lie on it (`onClipGrid`). */
export function pointsQ(points: readonly Point[]): number[] {
  const coordinates: number[] = [];
  for (const { x, y } of points) coordinates.push(quantizeCoordinate(x), quantizeCoordinate(y));
  return coordinates;
}

function ringPoints(ring: QPolygon): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < ring.length; i += 2) points.push({ x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE });
  return points;
}

/** A clipped shape as the areas it is made of, in world pixels. */
export function filledParts(shape: QShape): FilledPart[] {
  return shapeParts(shape).map(({ outline, holes }) => ({ outline: ringPoints(outline), holes: holes.map(ringPoints) }));
}
