import type { Hand } from '../../art/hand';
import { drawPinch, pinchFrame, squeezeFace } from './pinch';
import { doorRng, doorsOfWay } from './wayDoors';

/** The gap a squeeze leaves between its faces at the middle, in cells: a third of the cell. */
const OPENING = 0.34;

/**
 * A squeeze (a way passed on the belly): both walls pinch in over the door cell to a sliver a third
 * of a cell wide, their faces broken into the zig-zag a cave survey marks a squeeze with.
 */
export function drawSqueezes(hand: Hand): void {
  for (const door of doorsOfWay(hand, 'squeeze')) {
    const rng = doorRng(hand, door, 'squeeze');
    const frame = pinchFrame(door);
    const faces = [squeezeFace(rng, OPENING, 3, 0.06), squeezeFace(rng, OPENING, 3, 0.06)] as const;
    drawPinch(hand, frame, faces, side => [[frame.at(side * 0.42, -0.3), frame.at(side * 0.33, -0.08), frame.at(side * 0.38, 0.06)]]);
  }
}
