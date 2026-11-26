import type { WallSegment } from '../types/wallTypes';
import type { RoomArea } from './rooms';
import { shapeContains } from './shapeContains';
import { distanceTo, sideOf, type Segment as Line } from './wallSides';

/**
 * How a space an opening's line helps close is told from rock (`floorOf`): the line is no wall, so
 * the space says nothing by itself, and is floor where, from deep inside it, most directions end at
 * the floor side of a wall.
 */

/** Whether the rooms mode made `wall` and so knows which side its floor lies on (`WallSegment.floor`). */
export const knowsFloor = (wall: WallSegment): boolean => wall.floor === 'left' || wall.floor === 'right';

/** The directions looked in from a point, and the points of a space tried for the one deepest inside it. */
const DIRECTIONS = 32;
const GRID = 9;

/** A point of `space` far from its outline: the best of a grid over it, or null for a space too thin to hold one. */
export function deepPoint(space: RoomArea, outline: readonly Line[]): { x: number; y: number } | null {
  let [left, top, right, bottom] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const { p1 } of outline) {
    left = Math.min(left, p1.x);
    right = Math.max(right, p1.x);
    top = Math.min(top, p1.y);
    bottom = Math.max(bottom, p1.y);
  }
  let best: { x: number; y: number } | null = null;
  let depth = 0;
  for (let column = 1; column < GRID; column++) {
    for (let row = 1; row < GRID; row++) {
      const point = { x: left + ((right - left) * column) / GRID, y: top + ((bottom - top) * row) / GRID };
      if (!shapeContains(space, point)) continue;
      const clear = outline.reduce((least, edge) => Math.min(least, distanceTo(edge, point)), Infinity);
      if (clear > depth) [best, depth] = [point, clear];
    }
  }
  return best;
}

/**
 * What stands round a point: of the directions looked in from it, how many end at the floor side
 * of a wall that knows it and how many at a rock side or at no wall at all. Inside a room, open
 * or not, most directions end at its walls' floor sides; out in the open or in rock between
 * rooms, most do not.
 */
export function seenFrom(point: { x: number; y: number }, walls: readonly WallSegment[]): { floor: number; rock: number } {
  const nearest = new Float64Array(DIRECTIONS).fill(Infinity);
  const hits = new Array<WallSegment | null>(DIRECTIONS).fill(null);
  // Each wall is asked only by the directions within the angle it spans from the point, and a
  // direction beside it each way; every direction still asks its walls in their order.
  const toIndex = (x: number, y: number): number => (Math.atan2(y, x) / (2 * Math.PI)) * DIRECTIONS - 0.37;
  for (const wall of walls) {
    const [ax, ay, bx, by] = [wall.p1.x - point.x, wall.p1.y - point.y, wall.p2.x - point.x, wall.p2.y - point.y];
    let from = toIndex(ax, ay);
    let to = toIndex(bx, by);
    if (to < from) [from, to] = [to, from];
    // The short way round, unless the wall passes so near the point that it spans about half a turn.
    if (to - from > DIRECTIONS / 2) [from, to] = [to, from + DIRECTIONS];
    const all = Math.abs(ax * by - ay * bx) < 1e-9 * (ax * ax + ay * ay + bx * bx + by * by) || to - from > DIRECTIONS / 2 - 1;
    const [first, last] = all ? [0, DIRECTIONS - 1] : [Math.floor(from) - 1, Math.ceil(to) + 1];
    for (let k = first; k <= last; k++) {
      const index = ((k % DIRECTIONS) + DIRECTIONS) % DIRECTIONS;
      // Off the axes, so a look never runs along a wall drawn on the grid.
      const angle = ((index + 0.37) / DIRECTIONS) * 2 * Math.PI;
      const [dx, dy] = [Math.cos(angle), Math.sin(angle)];
      const [ex, ey] = [wall.p2.x - wall.p1.x, wall.p2.y - wall.p1.y];
      const denominator = dx * ey - dy * ex;
      if (Math.abs(denominator) < 1e-12) continue;
      const t = ((wall.p1.x - point.x) * ey - (wall.p1.y - point.y) * ex) / denominator;
      const u = ((wall.p1.x - point.x) * dy - (wall.p1.y - point.y) * dx) / denominator;
      if (t > 0 && t < nearest[index]! && u >= 0 && u <= 1) {
        nearest[index] = t;
        hits[index] = wall;
      }
    }
  }
  let [floor, rock] = [0, 0];
  for (const hit of hits) {
    if (!hit) rock++;
    else if (knowsFloor(hit)) {
      if (sideOf(hit, point) === hit.floor) floor++;
      else rock++;
    }
  }
  return { floor, rock };
}
