/**
 * The boundaries between the rounds of a fight: a combatant sits out one round only, so a new
 * round clears every mark, and stepping back over its start puts those marks back.
 */

import type { InitiativeEntry, InitiativeState } from '../types/initiativeTypes';

/** Everyone may act again, and no earlier round's marks are kept: a fight starts, ends or is cleared. */
export function clearSittingOut(initiative: InitiativeState): void {
  for (const entry of initiative.entries) delete entry.sitsOut;
  delete initiative.satOut;
}

/** The next round begins: every mark is cleared, and remembered under the round it cleared for. */
export function beginRound(initiative: InitiativeState): void {
  initiative.round++;
  const cleared = initiative.entries.filter((entry) => entry.sitsOut).map((entry) => entry.id);
  for (const entry of initiative.entries) delete entry.sitsOut;
  if (cleared.length === 0) return;
  initiative.satOut = { ...initiative.satOut, [initiative.round]: cleared };
}

/**
 * Back into the round before: the marks its end cleared come back, and the marks of the round
 * left belonged to that round alone. Nothing before round 1.
 */
export function backToRoundBefore(initiative: InitiativeState): void {
  if (initiative.round <= 1) return;
  const restored = new Set(initiative.satOut?.[initiative.round] ?? []);
  for (const entry of initiative.entries) {
    if (restored.has(entry.id)) entry.sitsOut = true;
    else delete entry.sitsOut;
  }
  if (initiative.satOut) {
    delete initiative.satOut[initiative.round];
    if (Object.keys(initiative.satOut).length === 0) delete initiative.satOut;
  }
  initiative.round--;
}

/**
 * Whether a combatant takes a turn when the turn comes to it: not defeated (`defeated` holds the
 * entry ids whose card shows the skull), not sitting the round out, not waiting after a delay.
 */
export function actsInTurn(entry: InitiativeEntry, defeated: ReadonlySet<string>): boolean {
  return !defeated.has(entry.id) && !entry.sitsOut && !entry.delayed;
}

/** Whether a combatant can act in some round: marks clear when a round begins, a defeat and a delay do not. */
export function canStillAct(entry: InitiativeEntry, defeated: ReadonlySet<string>): boolean {
  return !defeated.has(entry.id) && !entry.delayed;
}

/**
 * What else a fight does where a round begins or is stepped back into, after the round's number
 * and marks changed (a fight by cards deals or takes its kept cards up again).
 */
export interface RoundChanges {
  began(initiative: InitiativeState): void;
  steppedBack(initiative: InitiativeState): void;
}
