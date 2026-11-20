/**
 * The fog objects of a map, for whoever acts on the fog under a point. A fog object is a
 * connected body of the fog there is: fog that touches is one, whatever it was painted with, and
 * nothing else is an object. Beside it, the revealed fog that is remembered (`fogAreas.ts`)
 * under a point, which is what can be hidden again there.
 */

import { normalizePolygon, shapeParts, subtractShapes } from '../lighting/polygonClip';
import { shapeContains } from '../lighting/shapeContains';
import type { QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { areaOutline, type FogArea } from './fogAreas';
import { keyholed } from './fogKeyhole';
import { pointsOf, shapeOf } from './fogOutlineShape';

type Outline = readonly Point[];

const isPlace = (point: Point): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);

/** Whether the outline, filled as fog fills it, covers the point. */
function covers(outline: Outline, point: Point): boolean {
  if (outline.length < 3) return false;
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { x, y } of outline) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return false;
  const shape = shapeOf(outline);
  return shape !== null && shapeContains(shape, point);
}

/**
 * The remembered revealed fog the point lies in: where several overlap, the one revealed last.
 * Null where the point is in none.
 */
export function areaAt(areas: readonly FogArea[], point: Point): FogArea | null {
  if (!isPlace(point)) return null;
  let found: FogArea | null = null;
  for (const area of areas) {
    if (found && !(area.timestamp >= found.timestamp)) continue;
    if (covers(areaOutline(area), point)) found = area;
  }
  return found;
}

/**
 * The body of fog under `point`: the connected piece of `coverage` (the fog of a level) that
 * holds the point, as the one outline it is written with. Where it has holes, the outline runs
 * to each on a slit of no width (`keyholed`), so fog that stands free inside a hole is no part
 * of it. Null where the point is not in fog.
 */
export function fogBodyAt(coverage: QShape, point: Point): Point[] | null {
  if (!isPlace(point)) return null;
  for (const part of shapeParts(coverage)) {
    if (!shapeContains([part.outline], point)) continue;
    // A ring by itself says nothing of which way it runs: each is filled, and the holes taken out.
    const ground = subtractShapes(normalizePolygon(part.outline), part.holes.flatMap((hole) => normalizePolygon(hole)));
    if (shapeContains(ground, point)) return keyholed(pointsOf(part.outline), part.holes.map(pointsOf));
  }
  return null;
}
