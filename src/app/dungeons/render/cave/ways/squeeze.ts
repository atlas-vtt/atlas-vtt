import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import { INNER, INTO_ROCK, OUTER, neckFaces } from './pinch';
import { narrowSteps } from './narrowSteps';
import { clipped, clipToFloor } from './wayDoors';

/** How far along the way the marks run either side of a cell's middle: to its edges, so a squeeze's cells join into one run. */
const REACH = 0.5;
/** The teeth along each face in a cell, and how far a tooth reaches in from it, in cells. */
const TEETH = 2;
const TOOTH = 0.12;

/**
 * A squeeze (a way passed on the belly): the rock's own walls close in round it along its whole
 * length (`narrowPinch.ts`), and along each face runs the zig-zag a cave survey marks a squeeze
 * with, its teeth touching the face and pointing in at the way, in the walls' ink, the middle of the
 * way left clear. Where the floor opens wider than a squeeze's, the face is no squeeze's and the
 * run stops.
 */
export function drawSqueezes(hand: Hand): void {
  const marks: Vec[][] = [];
  for (const { frame } of narrowSteps(hand, 'squeeze')) {
    const rng = hand.scene.env.rng(`way:squeeze:${frame.bounds.minX},${frame.bounds.minY}`);
    const face = neckFaces(hand, frame);
    for (const side of [-1, 1]) {
      const run: Vec[] = [];
      for (let k = 0; k <= TEETH * 2; k++) {
        const v = -REACH + (2 * REACH * k) / (TEETH * 2);
        const wall = face(side, v);
        if (wall >= OUTER) {
          if (run.length > 1) marks.push(run.splice(0));
          run.length = 0;
          continue;
        }
        const u = k % 2 === 0 ? wall + INTO_ROCK : Math.max(INNER, wall - TOOTH * (0.85 + 0.3 * rng()));
        run.push(frame.at(side * u, v));
      }
      if (run.length > 1) marks.push(run);
    }
  }
  if (marks.length) clipped(hand, clipToFloor, () => hand.line(marks, 'outline'));
}
