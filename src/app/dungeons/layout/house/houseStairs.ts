/**
 * A house's stairs, fixed before any room (research §5.3): the main stair in the entrance hall,
 * against its side wall, from the ground floor to the first floor alone; and the back stair in the
 * stair hall, a dog-leg shaft of two flights side by side that joins every floor from the lowest to
 * the top, each flight one floor, the next beside it turning back, so every floor reaches both from
 * one side.
 */

import type { CellDir, DungeonStair } from '../../model';
import type { HouseFrame } from './houseFrame';

/** A stairwell between two floors of the plan, by their levels. */
export interface HouseStair {
  spot: Pick<DungeonStair, 'x' | 'y' | 'w' | 'h' | 'down'>;
  lower: number;
  upper: number;
}

const FRONT: CellDir = { x: 0, y: 1 };

export function houseStairs(frame: HouseFrame, levels: readonly number[]): HouseStair[] {
  const out: HouseStair[] = [];
  const { hall, stairHall } = frame;
  // Treads descending towards the front door: the foot before the hall's front row, the head arriving by the corridor upstairs.
  if (levels.includes(1)) out.push({ spot: { x: hall.x, y: hall.y + 1, w: 2, h: 3, down: FRONT }, lower: 0, upper: 1 });
  if (!stairHall) return out;
  const lowest = Math.min(...levels);
  const top = Math.max(...levels);
  for (let level = lowest; level < top; level++) {
    const even = ((level % 2) + 2) % 2 === 0;
    out.push({ spot: { x: stairHall.x + 1, y: even ? 1 : 2, w: 3, h: 1, down: { x: even ? -1 : 1, y: 0 } }, lower: level, upper: level + 1 });
  }
  return out;
}
