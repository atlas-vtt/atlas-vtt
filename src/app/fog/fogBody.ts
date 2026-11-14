/**
 * What lies under a point of the map, for whoever acts on the fog there: the remembered piece of
 * fog (an area, `fogAreas.ts`) the point is in, and the body of loose fog around it, which is
 * the connected fog there less the remembered pieces that are hidden, so that revealing loose
 * fog never opens a piece that still counts as hidden.
 */

import { normalizePolygon, shapeParts, subtractShapes } from '../lighting/polygonClip';
import { shapeContains } from '../lighting/shapeContains';
import type { QPolygon, QShape } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { areaIsHidden, areaOutline, type FogArea } from './fogAreas';
import { keyholed } from './fogKeyhole';
import { pointsOf, shapeOf } from './fogOutlineShape';

type Outline = readonly Point[];

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

const isPlace = (point: Point): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);

/** Whether the outline, filled as fog fills it, covers the point. */
function covers(outline: Outline, point: Point): boolean {
  if (outline.length < 3) return false;
  const box = boxOf(outline);
  if (point.x < box.minX || point.x > box.maxX || point.y < box.minY || point.y > box.maxY) return false;
  const shape = shapeOf(outline);
  return shape !== null && shapeContains(shape, point);
}

/**
 * The remembered piece the point lies in that is hidden (`hidden`), or revealed: where several
 * overlap, the one that was hidden or revealed last. Null where the point is in none.
 */
export function areaAt(areas: readonly FogArea[], point: Point, hidden: boolean): FogArea | null {
  if (!isPlace(point)) return null;
  let found: FogArea | null = null;
  for (const area of areas) {
    if (areaIsHidden(area) !== hidden || (found && !(area.timestamp >= found.timestamp))) continue;
    if (covers(areaOutline(area), point)) found = area;
  }
  return found;
}

/**
 * The ground the hidden pieces among `areas` cover, as rings that fill what any of them fills.
 * `near`, where given, leaves out the pieces whose box does not meet the box of those points.
 */
export function hiddenGround(areas: readonly FogArea[], near?: Outline): QShape {
  const reach = near ? boxOf(near) : null;
  const rings: QPolygon[] = [];
  for (const area of areas) {
    const outline = areaOutline(area);
    if (!areaIsHidden(area) || outline.length < 3 || (reach && !boxesMeet(reach, boxOf(outline)))) continue;
    rings.push(...(shapeOf(outline) ?? []));
  }
  return rings;
}

/**
 * A shape as the outlines fog is written with: one per piece, a piece with holes as one outline
 * with a slit to each (`keyholed`), so what stands free inside a hole is no part of it.
 */
export function outlinesOf(shape: QShape): Point[][] {
  return shapeParts(shape).map((part) => keyholed(pointsOf(part.outline), part.holes.map(pointsOf)));
}

/** The piece of `coverage` that holds the point, with its holes cut out; null where the point is not covered. */
function partAt(coverage: QShape, point: Point): QShape | null {
  for (const part of shapeParts(coverage)) {
    if (!shapeContains([part.outline], point)) continue;
    // A ring by itself says nothing of which way it runs: each is filled, and the holes taken out.
    const ground = subtractShapes(normalizePolygon(part.outline), part.holes.flatMap((hole) => normalizePolygon(hole)));
    if (shapeContains(ground, point)) return ground;
  }
  return null;
}

/**
 * The body of fog under `point`: the connected piece of `coverage` (the fog of a level) that
 * holds the point, less what the hidden pieces among `areas` cover, as the outlines to reveal it
 * with. None where the point is not in fog, or nothing of the body lies outside those pieces.
 */
export function fogBodyAt(coverage: QShape, point: Point, areas: readonly FogArea[]): Point[][] {
  if (!isPlace(point)) return [];
  const part = partAt(coverage, point);
  if (!part) return [];
  const [outer] = part;
  const kept = hiddenGround(areas, outer ? pointsOf(outer) : undefined);
  return outlinesOf(kept.length > 0 ? subtractShapes(part, kept) : part);
}
