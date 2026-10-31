/**
 * How a cave's floors are joined: a long stairwell is mostly a scree slope, a short one mostly a
 * pitch (a shaft on a rope, an aven seen from below). Where the chamber above rolled an exit in its
 * floor wide enough to stand in, the way down is that shaft, a pitch; a cave whose walls are never
 * sloped has pitches alone.
 */

import { type FloorStack, stairEnd } from '../../floors/floorStack';
import { contains, floorRect } from '../../geometry';
import type { DungeonRoom, DungeonStair, StairWay } from '../../model';
import { type Rng, chance } from '../../rng';

/** The share of long stairwells that are scree, and of short ones that are pitches. */
const LIKELY = 0.7;
/** The narrowest floor exit, in feet, that is a shaft a body goes down upright. */
const SHAFT_WIDTH = 5;

/** Whether the chamber holding this stairwell's upper end on `floor` rolled a floor exit a body can go down upright. */
function shaftAbove(stair: DungeonStair, floor: { rooms?: readonly DungeonRoom[] }): boolean {
  const spot = { x0: stair.x, y0: stair.y, x1: stair.x + stair.w - 1, y1: stair.y + stair.h - 1 };
  const room = floor.rooms?.find((r) => r.kind === 'room' && contains(floorRect(r), spot));
  return (room?.vertical?.down ?? []).some((width) => width >= SHAFT_WIDTH);
}

/**
 * Gives both ends of every stairwell its way; with `pitchesOnly` every one is a pitch. Which end
 * is the upper one the stack says: a floor's index tells nothing of whether it lies above.
 */
export function stairWays(rng: Rng, floors: readonly { stairs: DungeonStair[]; rooms?: readonly DungeonRoom[] }[], stack: FloorStack, pitchesOnly = false): void {
  const links = [...new Set(floors.flatMap((floor) => floor.stairs.map((s) => s.link)))].sort((a, b) => a - b);
  for (const link of links) {
    const ends = floors.flatMap((floor) => floor.stairs.filter((s) => s.link === link));
    const first = ends[0];
    if (!first) continue;
    const long = (first.down.x !== 0 ? first.w : first.h) >= 3;
    const likely = chance(rng, LIKELY);
    const upper = floors.map((floor, index) => ({ floor, end: floor.stairs.find((s) => s.link === link && stairEnd(stack, index, s.to) === 'upper') })).find(({ end }) => end !== undefined);
    const shaft = upper?.end !== undefined && shaftAbove(upper.end, upper.floor);
    const way: StairWay = pitchesOnly || shaft || long !== likely ? 'pitch' : 'scree';
    for (const end of ends) end.way = way;
  }
}
