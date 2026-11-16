import type { Point } from '../../types/visionTypes';

/** An area the GM draws on the map corner by corner (a light zone, stairs): what its editor reads of it. */
export interface PolygonArea {
  id: string;
  polygon: readonly Point[];
}

/** Screen pixels. */
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
  return nearest(corners, point, CORNER_HIT / zoom);
}

/** The area whose handle is at the world `point`; `handleOf` says where each area's handle sits. */
export function areaHandleAt<Area extends PolygonArea>(areas: readonly Area[], point: Point, zoom: number, handleOf: (area: Area) => Point): string | null {
  return nearest([...areas].reverse().map((area): [string, Point] => [area.id, handleOf(area)]), point, HANDLE_HIT / zoom);
}

/** Whether a click at `point` lands on the first corner of the area being drawn, which closes it. */
export function closesDraft(draft: readonly Point[], point: Point, zoom: number): boolean {
  const first = draft[0];
  return draft.length >= 3 && !!first && Math.hypot(point.x - first.x, point.y - first.y) <= SNAP / zoom;
}
