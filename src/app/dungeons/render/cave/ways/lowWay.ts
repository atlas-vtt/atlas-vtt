import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import { INTO_ROCK, OUTER, neckFaces, pinchFrame } from './pinch';
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
/** The roof edge's dashes and the gaps between them, in cells. */
const DASH = { on: 0.07, off: 0.05 };

/**
 * A crawl (a way passed on all fours): the rock's own walls close in round the door cell, and the
 * roof coming down over it is marked as a survey marks a low roof: the roof's edge as a dashed line
 * along each wall, a little in from it, with ticks from the wall to it, four a side, in the walls'
 * ink, leaving the middle of the way clear. Ticks alone read as the rock's own hatching on a whole
 * map; the dashed edge is the survey's sign for what lies overhead. Both follow the wall's face
 * where it stands, since a cave's outline wanders round its door cells.
 */
export function drawLowWays(hand: Hand): void {
  for (const door of doorsOfWay(hand, 'crawl')) {
    const rng = doorRng(hand, door, 'crawl');
    const frame = pinchFrame(door);
    const { at } = frame;
    const face = neckFaces(hand, frame);
    const marks: Vec[][] = [];
    for (const side of [-1, 1]) {
      const wall = (v: number): number => face(side, v);
      const edge = (v: number): Vec => at(side * Math.max(INNER, wall(v) - LENGTH), v);
      const steps = 8;
      marks.push(...dashes(Array.from({ length: steps + 1 }, (_, k) => edge(-EDGE_REACH + (2 * EDGE_REACH * k) / steps)), DASH.on, DASH.off, false));
      for (const v of TICKS) {
        const w = v + (rng() - 0.5) * 0.05;
        const reach = wall(w);
        // Where the floor opens wider than a crawl's, no wall stands near enough to hang a tick from.
        if (reach < OUTER) marks.push([at(side * (reach + INTO_ROCK), w - 0.04), edge(w)]);
      }
    }
    clipped(hand, clipToFloor, () => hand.line(marks, 'outline'));
  }
}
