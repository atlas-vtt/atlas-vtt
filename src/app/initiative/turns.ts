/**
 * Steps of a fight in the initiative tracker that do not depend on the store:
 * the turn of a side, and the roll of a combatant.
 */

import { parseDefaultRoll } from '../gameSystems/diceRules';
import type { InitiativeState } from '../types/initiativeTypes';
import { otherSide } from './sides';

/** Everyone may act again: a combatant sits out one round only. */
export function clearSittingOut(initiative: InitiativeState): void {
  for (const entry of initiative.entries) delete entry.sitsOut;
}

/** The other side's turn; after the second side a new round begins with the first. */
export function nextSideTurn(initiative: InitiativeState): void {
  const { sides } = initiative;
  if (!sides) return;
  if (sides.active === sides.first) {
    sides.active = otherSide(sides.first);
    return;
  }
  sides.active = sides.first;
  initiative.round++;
  clearSittingOut(initiative);
}

/** The turn before; nothing before the first side of round 1. */
export function previousSideTurn(initiative: InitiativeState): void {
  const { sides } = initiative;
  if (!sides) return;
  if (sides.active !== sides.first) {
    sides.active = sides.first;
  } else if (initiative.round > 1) {
    sides.active = otherSide(sides.first);
    initiative.round--;
  }
}

/** The total of a dice group such as `1d20` or `2d6`; a d20 when `roll` is none. */
export function rollInitiativeDice(roll: string, random: () => number): number {
  const { count, sides } = parseDefaultRoll(roll) ?? { count: 1, sides: 20 };
  let total = 0;
  for (let die = 0; die < count; die++) total += Math.floor(random() * sides) + 1;
  return total;
}
