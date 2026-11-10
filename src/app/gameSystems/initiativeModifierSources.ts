/** Reading, storing and comparing where initiative rules read a combatant's modifier. */

import type { InitiativeModifierSource, InitiativeRules } from '../types/initiativeRulesTypes';

/** A stored source: its field trimmed, the ability score switch only where it is on; none without a field. */
export function parseModifierSource(raw: unknown): InitiativeModifierSource | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { field, abilityScore } = raw as Record<string, unknown>;
  if (typeof field !== 'string' || field.trim() === '') return undefined;
  return { field: field.trim(), ...(abilityScore === true && { abilityScore: true }) };
}

export type ModifierSources = Pick<InitiativeRules, 'modifier' | 'modifierFallback'>;

/** The sources of `raw` as they are stored: each read with `parseModifierSource`, absent where it is none. */
export function modifierSources(raw: { modifier?: unknown; modifierFallback?: unknown }): ModifierSources {
  const modifier = parseModifierSource(raw.modifier);
  const fallback = parseModifierSource(raw.modifierFallback);
  return { ...(modifier && { modifier }), ...(fallback && { modifierFallback: fallback }) };
}

function sameSource(a: unknown, b: unknown): boolean {
  const left = parseModifierSource(a);
  const right = parseModifierSource(b);
  return left?.field === right?.field && left?.abilityScore === right?.abilityScore;
}

/** Whether two rules read the modifier from the same places; a blank field is none. */
export function sameModifierSources(a: ModifierSources, b: ModifierSources): boolean {
  return sameSource(a.modifier, b.modifier) && sameSource(a.modifierFallback, b.modifierFallback);
}

/** Whether two rules read the modifier from the same places, as typed: a space is a difference. */
export function sameTypedModifierSources(a: ModifierSources, b: ModifierSources): boolean {
  const same = (x?: InitiativeModifierSource, y?: InitiativeModifierSource): boolean =>
    (x?.field ?? '') === (y?.field ?? '') && Boolean(x?.abilityScore) === Boolean(y?.abilityScore);
  return same(a.modifier, b.modifier) && same(a.modifierFallback, b.modifierFallback);
}
