import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import { pinchFrame } from './pinch';
import { dashes } from './shaftMouth';
import { clipped, clipToFloor, doorRng, doorsOfWay } from './wayDoors';

/** Where the roof's ticks stand along the way, in cells from the door cell's middle: four a side, evenly over the cell. */
const TICKS = [-0.39, -0.13, 0.13, 0.39];
/** How far the roof's edge runs along the way either side of the door cell's middle. */
const EDGE_REACH = 0.47;
/** How far in from the wall the roof reaches, in cells: long enough to read on a whole map. */
const LENGTH = 0.3;
/** The nearest the roof comes to the way's middle, which stays clear. */
const INNER = 0.2;
/** The farthest out a wall is looked for: past it the roof's edge is drawn from there and no tick hangs, as a crawl's floor is never that wide. */
const OUTER = 0.95;
/** How far into the rock a tick starts, so the floor clip cuts it at the wall's face. */
const INTO_ROCK = 0.06;
/** The roof edge's dashes and the gaps between them, in cells. */
const DASH = { on: 0.07, off: 0.05 };

/** How far out from the way's middle the floor ends along a line across the way, `at(u)` its points, found to a hundredth of a cell. */
function wallAt(at: (u: number) => Vec, inFloor: (p: Vec) => boolean): number {
  if (inFloor(at(OUTER))) return OUTER;
  let lo = INNER;
  let hi = OUTER;
  while (hi - lo > 0.01) {
    const mid = (lo + hi) / 2;
    if (inFloor(at(mid))) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * A crawl (a way passed on all fours): the narrows' shoulders as a walk has them, and the roof
 * coming down over the door cell, marked as a survey marks a low roof: the roof's edge as a dashed
 * line along each wall, a little in from it, with ticks from the wall to it, four a side, in the
 * walls' ink, leaving the middle of the way clear. Ticks alone read as the rock's own hatching on a
 * whole map; the dashed edge is the survey's sign for what lies overhead. Both follow the wall's
 * face where it stands, since a cave's outline wanders round its door cells, and a mark standing
 * off it in the open floor read as nothing.
 */
export function drawLowWays(hand: Hand): void {
  const { field } = hand.scene.env.dungeon;
  const inFloor = (p: Vec): boolean => field.distance(p.x, p.y) < 0;
  for (const door of doorsOfWay(hand, 'crawl')) {
    const rng = doorRng(hand, door, 'crawl');
    const { at } = pinchFrame(door);
    const marks: Vec[][] = [];
    for (const side of [-1, 1]) {
      const wall = (v: number): number => wallAt((u) => at(side * u, v), inFloor);
      const edge = (v: number): Vec => at(side * Math.max(INNER, wall(v) - LENGTH), v);
      const steps = 8;
      marks.push(...dashes(Array.from({ length: steps + 1 }, (_, k) => edge(-EDGE_REACH + (2 * EDGE_REACH * k) / steps)), DASH.on, DASH.off, false));
      for (const v of TICKS) {
        const w = v + (rng() - 0.5) * 0.05;
        const face = wall(w);
        // Where the floor opens wider than a crawl's, no wall stands near enough to hang a tick from.
        if (face < OUTER) marks.push([at(side * (face + INTO_ROCK), w - 0.04), edge(w)]);
      }
    }
    clipped(hand, clipToFloor, () => hand.line(marks, 'outline'));
  }
}
