/**
 * The order of a fight in turn order: the higher total first, of equal totals the higher
 * tie-break, and of equal tie-breaks the order the combatants had, which the GM settles by dragging.
 */

import type { InitiativeEntry } from '../types/initiativeTypes';
import { ownModifier } from './initiativeModifier';

/**
 * What breaks a tie: where Act Now placed the combatant, the tie-break of the one it acted before
 * (`tieBreak`, so the stable sort keeps it right before that one); else the GM's own modifier,
 * else what the last roll added, else nothing.
 */
export function tieBreakModifier(entry: InitiativeEntry): number {
  return entry.tieBreak ?? ownModifier(entry) ?? entry.rolledModifier ?? 0;
}

/** Compares two combatants by total, then tie-break; 0 keeps their order (the sort is stable). */
export function byInitiative(a: InitiativeEntry, b: InitiativeEntry): number {
  return b.initiative - a.initiative || tieBreakModifier(b) - tieBreakModifier(a);
}
