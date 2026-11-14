/**
 * Between an outline (a closed run of corners in map pixels) and the filled shape fog is worked
 * out with (`QShape`): the shape an outline fills, its rings as corners, and what it covers.
 */

import { normalizePolygon } from '../lighting/polygonClip';
import { quantizeCoordinate } from '../lighting/quantizedPoint';
import { Q_SCALE, type QPolygon, type QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';

type Outline = readonly Point[];

/** The filled shape of an outline, crossings resolved; null where a corner is no place fog can reach. */
export function shapeOf(outline: Outline): QShape | null {
  try {
    return normalizePolygon(outline.flatMap((point) => [quantizeCoordinate(point.x), quantizeCoordinate(point.y)]));
  } catch {
    return null;
  }
}

/** The corners of an outline in eighths of a pixel, as they come: crossings are left to whoever fills it. Null where a corner is no place fog can reach. */
export function ringOf(outline: Outline): QPolygon | null {
  try {
    return outline.flatMap((point) => [quantizeCoordinate(point.x), quantizeCoordinate(point.y)]);
  } catch {
    return null;
  }
}

export function pointsOf(ring: QPolygon): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < ring.length; i += 2) points.push({ x: ring[i]! / Q_SCALE, y: ring[i + 1]! / Q_SCALE });
  return points;
}

/** What a shape covers, in square map pixels: its outlines less their holes. */
export function areaOfShape(shape: QShape): number {
  let twice = 0;
  for (const ring of shape) {
    for (let i = 0; i < ring.length; i += 2) {
      const next = (i + 2) % ring.length;
      twice += ring[i]! * ring[next + 1]! - ring[next]! * ring[i + 1]!;
    }
  }
  return Math.abs(twice) / 2 / (Q_SCALE * Q_SCALE);
}

/** The corners of `outline` put where `given` has a corner in the same eighth of a pixel: a shape's corners are rounded to eighths, the outlines it was made of are not. */
export function onCornersOf(outline: Outline, given: ReadonlyArray<Outline>): Point[] {
  const places = new Map<string, Point>();
  const eighth = (point: Point): string => `${Math.round(point.x * Q_SCALE)},${Math.round(point.y * Q_SCALE)}`;
  for (const corners of given) for (const corner of corners) places.set(eighth(corner), corner);
  return outline.map((corner) => {
    const { x, y } = places.get(eighth(corner)) ?? corner;
    return { x, y };
  });
}
