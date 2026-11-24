/**
 * Exploding dice: a die that shows one of its highest faces is rolled again
 * and the new die adds to the roll (Savage Worlds' aces, the 10 of Cyberpunk
 * RED). In some systems a lowest face rolls again too, and that die subtracts.
 *
 * A chain has one direction, set by its first die: up when that die shows a
 * high face, down when it shows a low one. The dice rolled for it keep it
 * going on a high face only, so a chain downwards never turns around.
 */

import type { RolledDie } from './diceFormula';

/** The most dice one die may add. Rules that explode "again and again" stop here. */
export const MAX_EXPLOSIONS = 10;

/** How one die explodes. */
export interface Explosion {
  /** How many of the die's highest faces explode. */
  highFaces: number;
  /** How many of its lowest faces roll again and subtract. */
  lowFaces: number;
  /** How many dice the explosion may add at most. */
  limit: number;
}

/** The face a die of `sides` shows, 1 to `sides`. */
export function rollFace(sides: number, random: () => number): number {
  return Math.floor(random() * sides) + 1;
}

/**
 * How many faces of a die of `sides` really explode upwards and downwards.
 * At least one face never explodes: a d2 whose two highest faces explode
 * would roll for ever. The high faces go first.
 */
export function explodingFaces(sides: number, highFaces: number, lowFaces: number): { high: number; low: number } {
  const high = Math.max(0, Math.min(highFaces, sides - 1));
  return { high, low: Math.max(0, Math.min(lowFaces, sides - 1 - high)) };
}

/**
 * The dice rolled because `die` exploded, in the order they were rolled; none
 * when it did not.
 */
export function rollExplosions(die: RolledDie, explosion: Explosion, random: () => number): RolledDie[] {
  const { high, low } = explodingFaces(die.max, explosion.highFaces, explosion.lowFaces);
  const isHigh = (value: number): boolean => value > die.max - high;

  const up = isHigh(die.value);
  if (!up && die.value > low) return [];
  // Down a subtracted die, or up an added one, the extra dice add; otherwise they subtract.
  const negative = up === (die.negative === true);

  const extra: RolledDie[] = [];
  const limit = Math.min(explosion.limit, MAX_EXPLOSIONS);
  let value = die.value;
  while (extra.length < limit && (extra.length === 0 || isHigh(value))) {
    value = rollFace(die.max, random);
    extra.push({ die: die.die, value, max: die.max, exploded: true, ...(negative && { negative: true as const }) });
  }
  return extra;
}

/** Whether the die at `index` exploded: the die after it was rolled for it. */
export function explodes(rolls: readonly Pick<RolledDie, 'exploded'>[], index: number): boolean {
  return rolls[index + 1]?.exploded === true;
}
