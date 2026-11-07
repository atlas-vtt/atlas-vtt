import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import { INNER, INTO_ROCK, OUTER, neckFaces } from './pinch';
import { narrowSteps } from './narrowSteps';
import { clipped, clipToFloor } from './wayDoors';

/** How far a tick reaches in from the wall's face, in cells: short, as the narrowed walls already say most. */
const TICK = 0.1;
/** How far a tick leans along the way, in cells, as a survey's roof ticks are drawn. */
const LEAN = 0.04;
/** Ticks stand on every other cell of a crawl, starting at its door. */
const EVERY = 2;

/**
 * A crawl (a way passed on all fours): the rock's own walls close in round it along its whole
 * length (`narrowPinch.ts`), and the roof coming down over it is marked as a survey marks a low
 * roof: a short tick from each wall's face towards the middle, one pair every other cell, in the
 * walls' ink, the middle of the way left clear. Each tick hangs from the wall where it stands,
 * since a cave's outline wanders round its cells.
 */
export function drawLowWays(hand: Hand): void {
  const marks: Vec[][] = [];
  for (const { frame, step } of narrowSteps(hand, 'crawl')) {
    if (step % EVERY !== 0) continue;
    const face = neckFaces(hand, frame);
    const rng = hand.scene.env.rng(`way:crawl:${frame.bounds.minX},${frame.bounds.minY}`);
    for (const side of [-1, 1]) {
      const v = (rng() - 0.5) * 0.1;
      const wall = face(side, v);
      // Where the floor opens wider than a crawl's, no wall stands near enough to hang a tick from.
      if (wall < OUTER) marks.push([frame.at(side * (wall + INTO_ROCK), v - LEAN), frame.at(side * Math.max(INNER, wall - TICK), v)]);
    }
  }
  if (marks.length) clipped(hand, clipToFloor, () => hand.line(marks, 'outline'));
}
