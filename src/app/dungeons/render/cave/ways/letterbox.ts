import type { Hand } from '../../art/hand';
import { INTO_ROCK, neckFaces, pinchFrame } from './pinch';
import { clipped, clipToFloor, doorsOfWay } from './wayDoors';

/** Where the slit's roof comes down, along the way from the door cell's middle: at the cell's mouth towards the room it is entered from. */
const ROOF = -0.46;
/** The farthest out the bar reaches, in cells: the door cell's side, where a room opens out round the mouth. */
const CELL = 0.5;

/**
 * A letterbox squeeze (a flat slot passed with an arm forward): the rock's own walls close in round
 * the door cell, and the roof of the slit is one straight bar across it from wall to wall where it
 * comes down, in the walls' ink and never past the cell: the survey's mark for a roof that drops,
 * at the cell's mouth, so the slit itself stays clear.
 */
export function drawLetterboxes(hand: Hand): void {
  for (const door of doorsOfWay(hand, 'letterbox')) {
    const frame = pinchFrame(door);
    const face = neckFaces(hand, frame);
    const end = (side: number): number => side * Math.min(CELL, face(side, ROOF) + INTO_ROCK);
    const bar = [frame.at(end(-1), ROOF), frame.at(end(1), ROOF)];
    clipped(hand, clipToFloor, () => hand.line([bar], 'outline'));
  }
}
