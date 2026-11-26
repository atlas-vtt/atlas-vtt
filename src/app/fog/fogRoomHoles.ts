/**
 * A room without the rooms and rock it encloses: a corridor that runs all round a room ends at
 * that room's walls, so hiding or revealing it leaves the room inside as it is. The room stays
 * one outline, with a slit of no width to each hole (`fogKeyhole.ts`).
 */

import { shapeParts, subtractShapes } from '../lighting/polygonClip';
import type { QPolygon } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';
import { keyholed } from './fogKeyhole';
import { areaOfShape, onCornersOf, pointsOf, ringOf, shapeOf } from './fogOutlineShape';

type Outline = readonly Point[];

/** The holes a room keeps: of more, the largest. A slit is sought for each among all the corners there are. */
export const MOST_HOLES = 64;

export interface HoledRoom {
  readonly outline: Point[];
  /** What it encloses, in square map pixels, less its holes. */
  readonly area: number;
}

/**
 * `outer`, a room's outer outline, less `enclosed`, the outer outlines of what lies inside it,
 * which all run the same way round. Null where they take nothing from it, or leave nothing of
 * it. Corners stay the outlines' own.
 */
export function withoutEnclosed(outer: Outline, enclosed: ReadonlyArray<Outline>): HoledRoom | null {
  const own = shapeOf(outer);
  if (!own || enclosed.length === 0) return null;
  // Rings that run the same way round fill what any of them fills.
  const taken = enclosed.flatMap((outline): QPolygon[] => {
    const ring = ringOf(outline);
    return ring ? [ring] : [];
  });
  if (taken.length === 0) return null;
  let left: { ring: QPolygon; holes: readonly QPolygon[]; area: number } | null = null;
  // What is left in pieces (a sliver between two rooms inside) is the room in its largest.
  for (const part of shapeParts(subtractShapes(own, taken))) {
    const area = areaOfShape([part.outline, ...part.holes]);
    if (!left || area > left.area) left = { ring: part.outline, holes: part.holes, area };
  }
  if (!left || left.area === areaOfShape(own)) return null;
  const holes = [...left.holes].sort((a, b) => areaOfShape([b]) - areaOfShape([a])).slice(0, MOST_HOLES);
  const outline = onCornersOf(keyholed(pointsOf(left.ring), holes.map(pointsOf)), [outer, ...enclosed]);
  return { outline, area: left.area };
}
