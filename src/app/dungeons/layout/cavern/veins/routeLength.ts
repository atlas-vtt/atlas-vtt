/**
 * How long a way between two caves runs: the book counts it in turns of ten minutes, 1d4 that
 * explodes (a 4 rolls 1d6 more, a 6 then 1d8, an 8 then 1d10). A turn is drawn as two cells of
 * passage, so most ways run a few cells and now and then one runs long.
 */

import { type Rng, int } from '../../../rng';

/** The dice in turn: each that shows its highest face rolls the next. */
const DICE: readonly number[] = [4, 6, 8, 10];
/** No way runs longer than this many turns. */
export const MOST_TURNS = 12;
/** Cells of passage a turn is drawn as. */
const CELLS_PER_TURN = 2;
/** The deepest a cave's corridor is drawn, walls included: a long way still has to fit the floor. */
export const MAX_ROUTE_DEPTH = 12;

/** The turns a way takes: 1d4, exploding up to 1d10, at most `MOST_TURNS`. */
export function routeTurns(rng: Rng): number {
  let turns = 0;
  for (const sides of DICE) {
    const face = int(rng, 1, sides);
    turns += face;
    if (face < sides) break;
  }
  return Math.min(MOST_TURNS, turns);
}

/** A cave corridor's depth, walls included as the planner sizes rooms: two cells a turn, at most `MAX_ROUTE_DEPTH`. */
export function routeDepth(rng: Rng): number {
  return Math.min(MAX_ROUTE_DEPTH, routeTurns(rng) * CELLS_PER_TURN + 2);
}
