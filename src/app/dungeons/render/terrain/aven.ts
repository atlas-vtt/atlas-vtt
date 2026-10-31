import type { DungeonTerrain } from '../../model';
import { hash2 } from '../art/noise';
import type { Hand } from '../art/hand';
import { wayFrame } from '../cave/ways/narrows';
import { roundMouth } from '../cave/ways/shaftMouth';
import { drawAvenOpening } from '../cave/ways/shafts';

/** An aven's opening overhead, in cells across its middle: a little inside its cell, so it never meets a wall. */
const RADIUS = 0.4;

/**
 * An aven on a chamber's floor: a chimney in the roof over the cell, rising to the floor above or
 * into the dark. It is drawn as the lower end of a pitch is, smaller and round about the cell's
 * middle: the dashed rings of the opening overhead, the light it lets down and the rubble under it.
 */
export function drawAven(hand: Hand, piece: DungeonTerrain): void {
  const { seed } = hand.scene.env.dungeon.model;
  for (const cell of piece.cells) {
    const frame = wayFrame({ x: cell.x, y: cell.y, w: 1, h: 1 }, { x: 0, y: 1 });
    const mouth = roundMouth({ x: cell.x + 0.5, y: cell.y + 0.5 }, RADIUS, Math.floor(hash2(cell.x, cell.y, seed + piece.id) * 0x7fffffff));
    drawAvenOpening(hand, frame, mouth);
  }
}
