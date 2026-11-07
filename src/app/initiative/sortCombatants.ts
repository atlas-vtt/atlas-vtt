import type { InitiativeState } from '../types/initiativeTypes';
import { byInitiative } from './tieBreak';
import { renumber } from './turnOrder';
import { sortByCards } from './cardDeal';

/**
 * Sorts the combatants into turn order (`byInitiative`), or by their cards in a fight by cards;
 * the turn stays with the combatant that has it.
 */
export function sortCombatants(initiative: InitiativeState): void {
  if (initiative.cards) return sortByCards(initiative);
  initiative.entries.sort(byInitiative);
  renumber(initiative.entries);
  const active = initiative.entries.findIndex((entry) => entry.isActive);
  if (active !== -1) initiative.currentIndex = active;
}
