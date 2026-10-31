/**
 * How long a way between two caves runs: the book counts it in turns of ten minutes, 1d4 that
 * explodes (a 4 rolls 1d6 more, a 6 then 1d8, an 8 then 1d10). A turn is drawn as two cells of
 * passage, so most ways run a few cells; a way longer than one passage holds is a gallery that
 * bends, laid as a chain of passages (`routeSegments`) of up to `SEGMENT_CELLS` each, up to
 * `MAX_ROUTE_CELLS` in all: past that the floor would not hold a way drawn to scale. A way up or
 * down is the same dice read as its depth: the book's turn is ten feet of descent, so most drop
 * 10 to 30 ft and a few far deeper.
 */

import { type Rng, int } from '../../../rng';

/** The dice in turn: each that shows its highest face rolls the next. */
const DICE: readonly number[] = [4, 6, 8, 10];
/** Cells of passage a turn is drawn as. */
const CELLS_PER_TURN = 2;
/** The walls at both ends, which the planner counts in a room's depth. */
export const ROUTE_WALLS = 2;
/** The longest one passage of a chain runs, in cells of floor. */
export const SEGMENT_CELLS = 10;
/** The longest a way is drawn, in cells of floor: 150 ft, fifteen turns; the dice's longest, 28 turns, is drawn as this. */
export const MAX_ROUTE_CELLS = 30;
/** The most a way at a slope drops or rises within one floor, in feet: deeper is a way to another floor. */
export const MAX_CLIMB_DEPTH = 20;

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

/**
 * The cells of floor each passage of a way is laid as, first to last: two cells a turn, as many
 * whole passages of `SEGMENT_CELLS` as the way holds and what is left as the last, `MAX_ROUTE_CELLS`
 * in all. A long passage swells and wanders where a short one runs nearly straight, so a way is
 * never cut into more passages than its length needs, nor into short ones of even length.
 */
export function routeSegments(turns: number): number[] {
  const cells = Math.min(MAX_ROUTE_CELLS, CELLS_PER_TURN * turns);
  const whole = Array.from({ length: Math.floor(cells / SEGMENT_CELLS) }, () => SEGMENT_CELLS);
  const left = cells % SEGMENT_CELLS;
  return left > 0 ? [...whole, left] : whole;
}

/** How far a climb within one floor rises or drops, in feet: the depth of a way up or down, held to `MAX_CLIMB_DEPTH`. */
export function climbDepth(rng: Rng): number {
  return Math.min(MAX_CLIMB_DEPTH, FEET_PER_TURN * routeTurns(rng));
}

/** How far a way up or down rises or drops, in feet: ten a turn, at most `MAX_VERTICAL_DEPTH`. */
export function verticalDepth(rng: Rng): number {
  return Math.min(MAX_VERTICAL_DEPTH, FEET_PER_TURN * routeTurns(rng));
}
