/**
 * The modifier a combatant adds to its initiative roll: the GM's own on the
 * entry, else the number its statblock holds where the map's rules read it.
 */

import type { ModifierSources } from '../gameSystems/initiativeModifierSources';
import { findModifierField, type ModifierStatblock } from './modifierFields';
import { statblockModifierValue } from './modifierValue';
import type { InitiativeModifierSource } from '../types/initiativeRulesTypes';
import type { InitiativeEntry } from '../types/initiativeTypes';

export { abilityScoreModifier } from './modifierValue';

/** A whole number with an optional sign; the typographic minus counts as one. */
const SIGNED_WHOLE = /^[+\-−]?\d{1,9}$/;

/** A modifier the GM types (the edit popup): a whole number, signed or not; anything else is none. */
export function parseInitiativeModifier(value: unknown): number | null {
  if (typeof value === 'number') return Number.isSafeInteger(value) ? value : null;
  if (typeof value !== 'string') return null;
  const text = value.trim().replace('−', '-');
  return SIGNED_WHOLE.test(text) ? Number(text) : null;
}

/**
 * The key under which Fantasy Statblocks keeps a creature's initiative modifier, as Initiative
 * Tracker reads it and its Pathfinder import writes it (from Perception).
 */
const FANTASY_MODIFIER = 'modifier';

function readSource(statblock: ModifierStatblock, source: InitiativeModifierSource | undefined): number | null {
  if (!source) return null;
  const found = findModifierField(statblock, source.field);
  return found ? statblockModifierValue(found.value, source.abilityScore === true || found.score) : null;
}

/**
 * The modifier a statblock holds where `sources` read it: the rules' field, else the field the
 * statblock's template means as initiative, else a Fantasy Statblocks statblock's own initiative
 * modifier (`modifier`), else the rules' fallback (5e: DEX as a score); null where none of them
 * holds a number. A field is found by key in any spelling or by its template's label
 * (`findModifierField`), and its value read whatever its type (`statblockModifierValue`).
 */
export function statblockInitiativeModifier(statblock: ModifierStatblock, sources: ModifierSources): number | null {
  const meant = statblock.meanings?.initiative;
  return readSource(statblock, sources.modifier)
    ?? (meant ? readSource(statblock, { field: meant }) : null)
    ?? (statblock.fantasy ? readSource(statblock, { field: FANTASY_MODIFIER }) : null)
    ?? readSource(statblock, sources.modifierFallback);
}

/**
 * The GM's own modifier on an entry, set in its edit popup (`modifierByHand`), 0 included. Every
 * entry was written with a modifier of 0, which is none; any other number an older file holds
 * was the GM's and stays so.
 */
export function ownModifier(entry: Pick<InitiativeEntry, 'initiativeModifier' | 'modifierByHand'>): number | undefined {
  return entry.modifierByHand || entry.initiativeModifier !== 0 ? entry.initiativeModifier : undefined;
}

/** What a combatant adds to its roll: its own modifier, else its statblock's, else nothing. */
export function combatantModifier(own: number | undefined, fromStatblock: number | null | undefined): number {
  return own ?? fromStatblock ?? 0;
}
