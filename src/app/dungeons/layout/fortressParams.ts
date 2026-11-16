/**
 * What a Fortress changes in the layout: its passages grow three cells across and are fitted once a
 * floor is laid (`passageWidths.ts`), and its round rooms are towers, on the plan's outer edge and few per floor.
 */

import type { DungeonParams } from '../params';

/**
 * The most towers a floor has, and the share of its rooms they may be: over 400 Fortresses a floor
 * had up to 14 round rooms (11 % of all rooms, three or fewer on nine floors in ten), most of them
 * where the `round` tag multiplies their chance by five.
 */
const TOWERS = { most: 3, share: 0.2 };

/** How many cells across a passage grows: the main way's width; others give up a side where they can. */
const PASSAGE_FLOOR = 3;

export function fortressParams(params: DungeonParams): DungeonParams {
  return { ...params, passageFloor: PASSAGE_FLOOR, roundRooms: TOWERS };
}
