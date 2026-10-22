import type { InitiativeEntry } from '../types/initiativeTypes';

/** Gives `entry` the number `total`, which ends its wait for one. */
export function setInitiative(entry: InitiativeEntry, total: number): void {
  entry.initiative = total;
  delete entry.awaitingInitiative;
}

/** Whether `entry` has a number of its own yet: one rolled or typed, or any an older version wrote. */
export function hasInitiative(entry: Pick<InitiativeEntry, 'initiative' | 'awaitingInitiative'>): boolean {
  return !entry.awaitingInitiative || entry.initiative !== 0;
}
