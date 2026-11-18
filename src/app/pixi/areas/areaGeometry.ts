import type { Point } from '../../types/visionTypes';
import { fingerReaches, pointerReach } from '../utils/pointerReach';

/** An area the GM draws on the map corner by corner (a light zone, stairs): what its editor reads of it. */
export interface PolygonArea {
  id: string;
  polygon: readonly Point[];
}

/** Screen pixels; what takes a press is a mouse's reach, and a finger's is wider (`pointerReach`). */
export const AREA_CORNER_RADIUS = 4.5;
export const AREA_HANDLE_RADIUS = 11;
const CORNER_HIT = 9;
const HANDLE_HIT = 13;
/** How close to the first corner of the area being drawn a click lands on it. */
const SNAP = 10;

/** A corner of an area: which area, and which of its corners. */
export interface AreaCorner {
  areaId: string;
  index: number;
}

function nearest<T>(candidates: Iterable<[T, Point]>, point: Point, reach: number): T | null {
  let found: T | null = null;
  let best = reach;
  for (const [candidate, at] of candidates) {
    const distance = Math.hypot(point.x - at.x, point.y - at.y);
    if (distance <= best) {
      best = distance;
      found = candidate;
    }
  }
  return found;
}

/** The corner at the world `point` at viewport `zoom`: the nearest one within reach, of the later area where two share a place. */
export function areaCornerAt(areas: readonly PolygonArea[], point: Point, zoom: number): AreaCorner | null {
  const corners = [...areas].reverse().flatMap((area) => area.polygon.map((corner, index): [AreaCorner, Point] => [{ areaId: area.id, index }, corner]));
  return nearest(corners, point, pointerReach(CORNER_HIT) / zoom);
}

/** The area whose handle is at the world `point`; `handleOf` says where each area's handle sits. */
export function areaHandleAt<Area extends PolygonArea>(areas: readonly Area[], point: Point, zoom: number, handleOf: (area: Area) => Point): string | null {
  return nearest([...areas].reverse().map((area): [string, Point] => [area.id, handleOf(area)]), point, pointerReach(HANDLE_HIT) / zoom);
}

/**
 * Whether a click at `point` closes the area being drawn: one on its first corner. A finger's tap
 * on the corner it placed last closes it too: that is the second tap of a double tap, which a
 * touch screen need not report as the double click that closes an area for a mouse.
 */
export function closesDraft(draft: readonly Point[], point: Point, zoom: number): boolean {
  if (draft.length < 3) return false;
  const reach = pointerReach(SNAP) / zoom;
  const on = (corner: Point): boolean => Math.hypot(point.x - corner.x, point.y - corner.y) <= reach;
  return on(draft[0]!) || (fingerReaches() && on(draft[draft.length - 1]!));
}
