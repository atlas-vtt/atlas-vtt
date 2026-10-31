import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import { pinchFrame } from './pinch';
import { clipped, clipToFloor, doorRng, doorsOfWay } from './wayDoors';

/** Where the roof's ticks stand along the way, in cells from the door cell's middle. */
const TICKS = [-0.3, 0, 0.3];
/** How far a tick reaches in from the wall: it stops well short of the middle, which stays clear. */
const INNER = 0.24;

/**
 * A crawl (a way passed on all fours): the narrows' shoulders as a walk has them, and the roof
 * coming down over the door cell, marked as a survey marks a low roof: short ticks hanging in
 * from both walls, three a side, in the walls' ink, leaving the middle of the way clear.
 */
export function drawLowWays(hand: Hand): void {
  for (const door of doorsOfWay(hand, 'crawl')) {
    const rng = doorRng(hand, door, 'crawl');
    const { at } = pinchFrame(door);
    const ticks: Vec[][] = [];
    for (const side of [-1, 1]) {
      for (const v of TICKS) {
        const w = v + (rng() - 0.5) * 0.06;
        ticks.push([at(side * 0.56, w - 0.05), at(side * INNER, w + 0.04)]);
      }
    }
    clipped(hand, clipToFloor, () => hand.line(ticks, 'outline'));
  }
}
