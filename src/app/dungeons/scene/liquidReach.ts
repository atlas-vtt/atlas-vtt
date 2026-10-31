import { MAX_COURSE_POINTS } from '../../liquids/liquids';
import { pointInPolygon, pointsBounds, type Vec } from '../render/geometry';

/**
 * Where a scene's moving water reaches: how much of a river's course its surface keeps, and which
 * edges of each surface are no shore because the water goes on past them.
 */

/** How far past the map a river's course is kept, in cells: its frame stays even up to the map's edge. */
const COURSE_MARGIN = 3;

/** The part of a course that runs over the map (and `COURSE_MARGIN` past it), within `MAX_COURSE_POINTS`. */
export function courseOn(course: readonly Vec[], frame: readonly Vec[]): Vec[] | undefined {
  const minX = frame[0]!.x - COURSE_MARGIN;
  const minY = frame[0]!.y - COURSE_MARGIN;
  const maxX = frame[2]!.x + COURSE_MARGIN;
  const maxY = frame[2]!.y + COURSE_MARGIN;
  const on = (p: Vec): boolean => p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY;
  const first = course.findIndex(on);
  if (first < 0) return undefined;
  let last = course.length - 1;
  while (!on(course[last]!)) last--;
  const kept = course.slice(Math.max(0, first - 1), Math.min(course.length, last + 2));
  if (kept.length <= MAX_COURSE_POINTS) return kept;
  const step = (kept.length - 1) / (MAX_COURSE_POINTS - 1);
  return Array.from({ length: MAX_COURSE_POINTS }, (_, k) => kept[Math.round(k * step)]!);
}

/** How far past an edge the water beyond it is looked for, in cells. */
const OPEN_REACH = 0.05;

/**
 * The edges of each surface's outline that are no shore: where water lies just past them (a lake
 * the river runs into, the river a stream joins, a pool's stream) or the map's image ends. The
 * motion draws no shore there, so water that goes on is never framed.
 */
export function openEdgesOf(found: readonly { ring: Vec[]; holes?: Vec[][] }[], frame: readonly Vec[]): number[][] {
  const boxes = found.map(({ ring }) => pointsBounds(ring));
  const inWater = (p: Vec, except: number): boolean => found.some(({ ring, holes = [] }, index) => {
    const box = boxes[index]!;
    return index !== except && p.x >= box.minX && p.x <= box.maxX && p.y >= box.minY && p.y <= box.maxY && pointInPolygon(ring, p.x, p.y) && !holes.some(hole => pointInPolygon(hole, p.x, p.y));
  });
  return found.map(({ ring }, index) => ring.flatMap((a, k) => {
    const b = ring[(k + 1) % ring.length]!;
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    if (length === 0) return [];
    const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const side = { x: middle.x - ((b.y - a.y) / length) * OPEN_REACH, y: middle.y + ((b.x - a.x) / length) * OPEN_REACH };
    const past = pointInPolygon(ring, side.x, side.y) ? { x: 2 * middle.x - side.x, y: 2 * middle.y - side.y } : side;
    return !pointInPolygon(frame, past.x, past.y) || inWater(past, index) ? [k] : [];
  }));
}
