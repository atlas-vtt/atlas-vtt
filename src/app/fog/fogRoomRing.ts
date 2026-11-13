/**
 * The ring of corners a room's outline is made from (`fogRoomOutline.ts`), put in order: without
 * the corners that add nothing, without what lies beyond the walls that stand inside the room,
 * and with the fewest corners that still follow its walls.
 */

import { simplifyStroke } from '../pixi/lighting/wallEdits';
import type { Point } from '../types/visionTypes';
import type { WallSegment } from '../types/wallTypes';

/** How far, in map pixels, a corner may lie off the line between its neighbours and still be left out as lying on it. */
export const ON_LINE = 0.05;
/** How far, in map pixels, the simplified outline may stray from the walls: curved walls of many short pieces keep fewer corners. */
const SIMPLIFY_TOLERANCE = 0.5;
/** Two places nearer than this, in map pixels, are one. */
export const SAME_PLACE = 1e-6;
/** Two corners of a ring nearer than this, in map pixels, are one place the ring comes back to. */
const SAME_CORNER = 1e-3;

/** A corner that is a place on the wall a stretch of the room's edge faces. */
export interface FacedCorner extends Point {
  /** The wall's number; -1 where no wall is near. */
  readonly wall: number;
  /** The ground that faces the wall lies to its left, looking from its `p1` to its `p2`. */
  readonly left: boolean;
}

export const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

/** Twice what the ring encloses, in square map pixels. */
export function twiceArea(ring: readonly Point[]): number {
  let twice = 0;
  ring.forEach((corner, index) => {
    const next = ring[(index + 1) % ring.length]!;
    twice += corner.x * next.y - next.x * corner.y;
  });
  return Math.abs(twice);
}

/** Whether the corner `at` adds nothing between its neighbours: it is one of them, lies on the line through them, or is the tip of a spike that goes out and comes back. */
function needless(before: Point, at: Point, after: Point): boolean {
  if (distance(before, at) < SAME_PLACE) return true;
  const [dx, dy] = [after.x - before.x, after.y - before.y];
  const length = Math.hypot(dx, dy);
  if (length < SAME_PLACE) return true;
  return Math.abs((at.x - before.x) * dy - (at.y - before.y) * dx) / length <= ON_LINE;
}

/** The ring without the corners that add nothing to it. */
export function tidied(ring: readonly Point[]): Point[] {
  const kept: Point[] = [];
  for (const corner of ring) {
    kept.push(corner);
    // The corner before the newest may add nothing now; with it gone, the one before that.
    while (kept.length >= 3 && needless(kept[kept.length - 3]!, kept[kept.length - 2]!, kept[kept.length - 1]!)) kept.splice(-2, 1);
  }
  // Where the ring closes, the same: its last corner between its neighbours, then its first.
  for (let changed = true; changed && kept.length >= 3;) {
    const [first, second, last, beforeLast] = [kept[0]!, kept[1]!, kept[kept.length - 1]!, kept[kept.length - 2]!];
    if (needless(beforeLast, last, first)) kept.pop();
    else if (needless(last, first, second)) kept.shift();
    else changed = false;
  }
  return kept;
}

/** One number for a stretch of a wall faced from one side: walls are fewer than 2²¹, and a wall has fewer stretches than 2²⁰. */
const facedKey = (wall: number, stretch: number, left: boolean): number => (wall * 2 ** 20 + stretch + 1) * 2 + (left ? 1 : 0);

/** The corners of the ring from `from` up to `to`, without `to`; the ring goes on from its last corner to its first. */
function arc<Corner>(ring: readonly Corner[], from: number, to: number): Corner[] {
  return from <= to ? ring.slice(from, to) : [...ring.slice(from), ...ring.slice(0, to)];
}

/**
 * The ring without what lies beyond a wall the room has on both of its sides in one place: there
 * the wall stands inside the room, and the edge runs out along one side of it, round whatever it
 * leads to (its own end, or the walls of a room inside the room that it joins to the room's own)
 * and back along the other. Of the two rings such a place parts the ring into, the larger is the
 * room's. `step` is how far apart along a wall two places still are one: a stretch of the edge.
 */
export function withoutInnerWalls(ring: ReadonlyArray<Point | FacedCorner>, walls: readonly WallSegment[], step: number): Array<Point | FacedCorner> {
  let corners = [...ring];
  // Each pass takes one such way out and back away, whole.
  for (let pass = 0; pass < ring.length; pass++) {
    /** Where each stretch of each wall was last faced, by the wall, the stretch and the side (`facedKey`). */
    const faced = new Map<number, number>();
    let cut: [number, number] | null = null;
    let least = 0;
    corners.forEach((corner, index) => {
      const wall = 'wall' in corner ? walls[corner.wall] : undefined;
      if (!wall || !('wall' in corner)) return;
      const along = Math.floor(distance(wall.p1, corner) / step);
      // The same stretch from the other side, or the one before or after it.
      for (const stretch of [along, along - 1, along + 1]) {
        const other = faced.get(facedKey(corner.wall, stretch, !corner.left));
        if (other === undefined || distance(corners[other]!, corner) > step) continue;
        // Of the places a wall is faced from both sides, the one nearest where it leaves the room's own walls parts the ring most evenly.
        const part = Math.min(index - other, corners.length - (index - other));
        if (part > least) [cut, least] = [[other, index], part];
      }
      faced.set(facedKey(corner.wall, along, corner.left), index);
    });
    if (!cut) break;
    // Each of the two keeps one of the stretches that face each other, so they part no ring again.
    const [out, rest] = [arc(corners, cut[0], cut[1]), arc(corners, cut[1], cut[0])];
    corners = twiceArea(out) > twiceArea(rest) ? out : rest;
  }
  return corners;
}

/**
 * The ring without the loops that leave it at a place and come back to it: the walls of a room
 * inside the room that touch the room's own in one place, which the edge runs round. Of the two
 * rings such a place parts the ring into, the larger is the room's.
 */
export function outerLoop(ring: readonly Point[]): Point[] {
  let corners = [...ring];
  // Each pass takes one loop away.
  for (let pass = 0; pass < ring.length; pass++) {
    const seen = new Map<string, number>();
    let cut: [number, number] | null = null;
    for (let index = 0; index < corners.length && !cut; index++) {
      const { x, y } = corners[index]!;
      // Two grids half a step apart: places a hair apart share a square of one of them.
      const keys = [`${Math.round(x * 64)},${Math.round(y * 64)}`, `h${Math.floor(x * 64)},${Math.floor(y * 64)}`];
      const before = keys.map((key) => seen.get(key)).find((earlier) => earlier !== undefined && distance(corners[earlier]!, corners[index]!) < SAME_CORNER);
      if (before !== undefined) cut = [before, index];
      else keys.forEach((key) => seen.set(key, index));
    }
    if (!cut) break;
    const inner = corners.slice(cut[0], cut[1]);
    const outer = [...corners.slice(0, cut[0]), ...corners.slice(cut[1])];
    corners = twiceArea(inner) > twiceArea(outer) ? inner : outer;
  }
  return corners;
}

/** The ring with the fewest corners that stay within the tolerance of it, begun at a corner that is surely one: the leftmost, and of those the topmost. */
export function simplified(ring: readonly Point[]): Point[] {
  if (ring.length <= 3) return [...ring];
  let start = 0;
  ring.forEach((corner, index) => {
    const first = ring[start]!;
    if (corner.x < first.x || (corner.x === first.x && corner.y < first.y)) start = index;
  });
  const turned = [...ring.slice(start), ...ring.slice(0, start)];
  return simplifyStroke([...turned, turned[0]!], SIMPLIFY_TOLERANCE).slice(0, -1);
}
