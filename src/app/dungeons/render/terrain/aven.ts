import type { DungeonTerrain } from '../../model';
import { hash2 } from '../art/noise';
import type { Hand } from '../art/hand';
import { OPENING_RADIUS, roundMouth } from '../cave/ways/shaftMouth';
import { drawAvenOpening } from '../cave/ways/shafts';

/** A shaft's opening overhead, in cells across its middle: a little inside its cell, so it never meets a wall. */
const RADIUS = 0.4;

/** An aven's opening: a shaft's, and a chimney or vertical squeeze as much narrower as its hole in a floor is than a shaft's; an aven of no known way opens as a shaft. */
function radiusOf(piece: DungeonTerrain): number {
  const kind = piece.traits.drop?.kind ?? 'shaft';
  return RADIUS * (OPENING_RADIUS[kind] / OPENING_RADIUS.shaft);
}

/**
 * An aven on a chamber's floor: a chimney in the roof over the cell, rising to the floor above or
 * into the dark. It is drawn as the lower end of a pitch is, smaller and round about the cell's
 * middle: the dashed outline of the opening overhead (a second ring inside where it rises thirty
 * feet or more and narrows), never shaded; under a shaft what fell down it, under a chimney or a
 * squeeze only drips. Narrower for a chimney and narrower still for a vertical squeeze.
 */
export function drawAven(hand: Hand, piece: DungeonTerrain): void {
  const { seed } = hand.scene.env.dungeon.model;
  for (const cell of piece.cells) {
    const mouthSeed = Math.floor(hash2(cell.x, cell.y, seed + piece.id) * 0x7fffffff);
    const mouth = roundMouth({ x: cell.x + 0.5, y: cell.y + 0.5 }, radiusOf(piece), mouthSeed);
    const drop = piece.traits.drop;
    drawAvenOpening(hand, mouth.rings[0]!, drop?.depth ?? 30, mouthSeed + 3, (drop?.kind ?? 'shaft') === 'shaft' ? 'rubble' : 'drips');
  }
}
