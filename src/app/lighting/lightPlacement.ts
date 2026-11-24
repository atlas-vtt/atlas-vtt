import { fieldMargin, wallRadius } from './lightingConstants';
import { crosses, distToSeg, type Seg } from './segments';

/** Where a light shines from, and the radius its flame may have there, in world pixels. */
export interface Placement {
  x: number;
  y: number;
  flame: number;
}

/**
 * The walls that may come within `margin` of the segment from (x0, y0) to (x1, y1): every one
 * that does, and perhaps others (`lightSegmentsNear`). A wall may be named more than once.
 */
export type SegmentsNear = (x0: number, y0: number, x1: number, y1: number, margin: number) => readonly Seg[];

/** Farthest a light standing in a wall is moved to find free space. */
const SEARCH = 64;

/**
 * A light standing in a wall moves to the nearest spot with room for it that a straight
 * path reaches without crossing any wall's centre line, so it always stays on its own side;
 * none within `SEARCH` px means no light. Its flame shrinks until it fits the free space.
 * `near` names the walls worth asking about each question (by default all of `walls`): only a
 * wall nearer than a question's margin can change its answer, so the answers are the same.
 */
export function placeLight(x: number, y: number, flame: number, walls: readonly Seg[], texel: number, near: SegmentsNear = () => walls): Placement | null {
  const blocked = wallRadius(texel) + fieldMargin(texel);
  const need = blocked + 1.5;
  const spot = nearestFreeSpot(x, y, near, need);
  if (!spot) return null;
  // A wall this far off leaves more than the flame free, a pixel to spare for rounding: only nearer ones shrink it.
  const reach = flame + blocked + 2;
  const free = nearest(spot[0], spot[1], near(spot[0], spot[1], spot[0], spot[1], reach)) - blocked - 1;
  return { x: spot[0], y: spot[1], flame: Math.max(0.5, Math.min(flame, free)) };
}

function nearestFreeSpot(x: number, y: number, near: SegmentsNear, need: number): [number, number] | null {
  if (nearest(x, y, near(x, y, x, y, need)) >= need) return [x, y];
  for (let r = 1; r <= SEARCH; r++) {
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * Math.PI * 2;
      const cx = x + Math.cos(a) * r, cy = y + Math.sin(a) * r;
      if (nearest(cx, cy, near(cx, cy, cx, cy, need)) >= need && !near(x, y, cx, cy, 1).some((w) => crosses(x, y, cx, cy, w))) return [cx, cy];
    }
  }
  return null;
}

function nearest(x: number, y: number, walls: readonly Seg[]): number {
  let best = Infinity;
  for (const w of walls) best = Math.min(best, distToSeg(x, y, w));
  return best;
}
