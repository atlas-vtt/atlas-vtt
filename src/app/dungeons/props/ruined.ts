/**
 * What a ruin keeps of a room's pieces: the defining piece always (or the room would no longer
 * read as what it was), of the rest a share of 40 to 70 percent drawn per room.
 */

import { type Rng, shuffled } from '../rng';
import type { Piece } from '../themes/themeTypes';

const KEEP: readonly [number, number] = [0.4, 0.7];

/** The share of a ruined room's pieces that is kept. */
export function ruinedKeep(rng: Rng): number {
  return KEEP[0] + rng() * (KEEP[1] - KEEP[0]);
}

/** The pieces a ruin keeps, in their recipe's order: `share` of them, rounded by chance. */
export function keptPieces(rng: Rng, pieces: readonly Piece[], share: number): Piece[] {
  const exact = pieces.length * share;
  const count = Math.floor(exact) + (rng() < exact % 1 ? 1 : 0);
  const kept = new Set(shuffled(rng, pieces).slice(0, count));
  return pieces.filter((piece) => kept.has(piece));
}
