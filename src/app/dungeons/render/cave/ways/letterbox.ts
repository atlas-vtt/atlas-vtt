import type { Hand } from '../../art/hand';
import { INTO_ROCK, neckFaces, pinchFrame } from './pinch';
import { clipped, clipToFloor, doorsOfWay } from './wayDoors';

/** Where the slit's roof comes down, along the way from the door cell's middle: at the cell's mouth onto the open floor. */
const ROOF = 0.46;
/** The farthest out the bar reaches, in cells: the door cell's side, where a room opens out round the mouth. */
const CELL = 0.5;

/**
 * A letterbox squeeze (a flat slot passed with an arm forward): the rock's own walls close in round
 * it along its whole length (`narrowPinch.ts`), and the roof of the slit is one straight bar across
 * it from wall to wall at each mouth, where it comes down, in the walls' ink and never past the
 * cell: the survey's mark for a roof that drops. A door into a letterbox passage has its bar on the
 * side it is entered from, the passage's far door on the side it opens out to, so the slit itself
 * stays clear.
 */
export function drawLetterboxes(hand: Hand): void {
  const { rooms } = hand.scene.env.dungeon;
  const narrowRoom = (id: number | null): boolean => id !== null && rooms.some((room) => room.id === id && room.narrow !== undefined);
  for (const door of doorsOfWay(hand, 'letterbox')) {
    const frame = pinchFrame(door);
    const face = neckFaces(hand, frame);
    const roof = narrowRoom(door.from) ? ROOF : -ROOF;
    const end = (side: number): number => side * Math.min(CELL, face(side, roof) + INTO_ROCK);
    const bar = [frame.at(end(-1), roof), frame.at(end(1), roof)];
    clipped(hand, clipToFloor, () => hand.line([bar], 'outline'));
  }
}
