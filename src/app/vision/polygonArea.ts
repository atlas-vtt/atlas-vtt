/** Polygons the GM draws on the map as areas (light zones, stairs): whether corners make one, and where its handle sits. */

import type { Point } from '../types/visionTypes';
import { pointInPolygon } from './visibility';

/** Whether corners enclose an area: three on one line, or all in one place, enclose none. */
export function hasArea(polygon: readonly Point[]): boolean {
  let twice = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    twice += a.x * b.y - b.x * a.y;
  }
  return Math.abs(twice) > 1e-6;
}

/** Where an area's handle sits: at its centroid, or at a point inside it when the area bends around its centroid. */
export function areaHandlePoint(polygon: readonly Point[]): Point {
  let area = 0;
  let x = 0;
  let y = 0;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i]!;
    const b = polygon[(i + 1) % polygon.length]!;
    const cross = a.x * b.y - b.x * a.y;
    area += cross;
    x += (a.x + b.x) * cross;
    y += (a.y + b.y) * cross;
  }
  const centroid = Math.abs(area) > 1e-6 ? { x: x / (3 * area), y: y / (3 * area) } : polygon[0]!;
  if (pointInPolygon(centroid, polygon as Point[])) return centroid;
  // ponytail: the middle of the first corner's ear; a pole of inaccessibility if areas get shapes this misses.
  for (let i = 0; i < polygon.length; i++) {
    const [a, b, c] = [polygon[i]!, polygon[(i + 1) % polygon.length]!, polygon[(i + 2) % polygon.length]!];
    const ear = { x: (a.x + b.x + c.x) / 3, y: (a.y + b.y + c.y) / 3 };
    if (pointInPolygon(ear, polygon as Point[])) return ear;
  }
  return polygon[0]!;
}
