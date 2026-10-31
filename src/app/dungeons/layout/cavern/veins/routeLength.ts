/**
 * How long a way between two caves runs: the book counts it in turns of ten minutes, 1d4 that
 * explodes (a 4 rolls 1d6 more, a 6 then 1d8, an 8 then 1d10). A turn is drawn as two cells of
 * passage up to four turns, so most ways run a few cells; past that the floor would not hold a
 * way drawn to scale, so each further turn adds less, and a way that exploded twice or three
 * times still runs longer than one that exploded once. A way up or down is the same dice read as
 * its depth: the book's turn is ten feet of descent, so most drop 10 to 30 ft and a few far deeper.
 */

import { type Rng, int } from '../../../rng';

/** The dice in turn: each that shows its highest face rolls the next. */
const DICE: readonly number[] = [4, 6, 8, 10];
/** Cells of passage a turn is drawn as, up to `TO_SCALE` turns. */
const CELLS_PER_TURN = 2;
/** The turns a way is drawn to scale for. */
const TO_SCALE = 4;
/** The walls at both ends, which the planner counts in a room's depth. */
const WALLS = 2;
/** The deepest a cave's corridor is drawn, walls included: the longest way the dice give, 28 turns. */
export const MAX_ROUTE_DEPTH = WALLS + CELLS_PER_TURN * TO_SCALE + Math.ceil(Math.sqrt(DICE.reduce((sum, sides) => sum + sides, 0) - TO_SCALE));

/** Feet of descent a turn is. */
export const FEET_PER_TURN = 10;
/** The deepest a way up or down is told as, in feet: past it the dice tell nothing a party can see. */
export const MAX_VERTICAL_DEPTH = 150;

/** The turns a way takes: 1d4, exploding up to 1d10. */
export function routeTurns(rng: Rng): number {
  let turns = 0;
  for (const sides of DICE) {
    const face = int(rng, 1, sides);
    turns += face;
    if (face < sides) break;
  }
  return turns;
}

/** A cave corridor's depth, walls included as the planner sizes rooms: two cells a turn up to four, then the square root of the turns past them. */
export function routeDepth(rng: Rng): number {
  const turns = routeTurns(rng);
  const beyond = Math.max(0, turns - TO_SCALE);
  return WALLS + CELLS_PER_TURN * Math.min(turns, TO_SCALE) + Math.ceil(Math.sqrt(beyond));
}

/** How far a way up or down rises or drops, in feet: ten a turn, at most `MAX_VERTICAL_DEPTH`. */
export function verticalDepth(rng: Rng): number {
  return Math.min(MAX_VERTICAL_DEPTH, FEET_PER_TURN * routeTurns(rng));
}
