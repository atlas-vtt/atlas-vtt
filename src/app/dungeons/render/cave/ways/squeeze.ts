import type { Hand } from '../../art/hand';
import type { Vec } from '../../geometry';
import { INNER, INTO_ROCK, neckFaces, pinchFrame } from './pinch';
import { clipped, clipToFloor, doorRng, doorsOfWay } from './wayDoors';

/** How far along the way the marks run either side of the door cell's middle. */
const REACH = 0.42;
/** The teeth along each face, and how far a tooth reaches in from it, in cells. */
const TEETH = 3;
const TOOTH = 0.2;

/**
 * A squeeze (a way passed on the belly): the rock's own walls close in round the door cell, and
 * along each face runs the zig-zag a cave survey marks a squeeze with, its teeth touching the face
 * and pointing in at the way, in the walls' ink, the middle of the way left clear.
 */
export function drawSqueezes(hand: Hand): void {
  for (const door of doorsOfWay(hand, 'squeeze')) {
    const rng = doorRng(hand, door, 'squeeze');
    const frame = pinchFrame(door);
    const face = neckFaces(hand, frame);
    const marks: Vec[][] = [-1, 1].map((side) =>
      Array.from({ length: TEETH * 2 + 1 }, (_, k) => {
        const v = -REACH + (2 * REACH * k) / (TEETH * 2);
        const wall = face(side, v);
        const u = k % 2 === 0 ? wall + INTO_ROCK : Math.max(INNER, wall - TOOTH * (0.85 + 0.3 * rng()));
        return frame.at(side * u, v);
      }),
    );
    clipped(hand, clipToFloor, () => hand.line(marks, 'outline'));
  }
}
