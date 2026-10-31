import type { Hand } from '../../art/hand';
import { drawPinch, pinchFrame, slotFace } from './pinch';
import { doorsOfWay } from './wayDoors';

/** The slit a letterbox leaves, in cells: the tightest of the ways. */
const OPENING = 0.2;
/** Half the slot's length along the way. */
const SLOT = 0.28;

/**
 * A letterbox squeeze (a flat slot passed with an arm forward): both walls close in as two flat
 * slabs with straight faces and a thin slit between them, each slab marked with one straight bar,
 * its bedding plane, where the squeeze's faces are jagged.
 */
export function drawLetterboxes(hand: Hand): void {
  for (const door of doorsOfWay(hand, 'letterbox')) {
    const frame = pinchFrame(door);
    const face = slotFace(OPENING, SLOT);
    const bar = OPENING / 2 + 0.08;
    drawPinch(hand, frame, [face, face], side => [[frame.at(side * bar, -SLOT + 0.04), frame.at(side * bar, SLOT - 0.04)]]);
  }
}
