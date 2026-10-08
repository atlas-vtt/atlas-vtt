/**
 * A collection's initiative rules: reading them from the settings, checking and
 * comparing them.
 */

import type { InitiativeMode, InitiativeRules, InitiativeSide } from '../types/initiativeRulesTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { isValidDefaultRoll } from './diceRules';

/** Initiative of a collection without a game system: a d20 each, highest first. */
export const DEFAULT_INITIATIVE_RULES: Readonly<InitiativeRules> = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };

export const INITIATIVE_MODES: readonly InitiativeMode[] = ['turn-order', 'sides'];

export const INITIATIVE_SIDES: readonly InitiativeSide[] = ['players', 'opponents'];

/** Stored initiative rules, or undefined when they are none. */
export function parseInitiativeRules(raw: unknown): InitiativeRules | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const { mode, roll, firstSide, modifierField } = raw as Record<string, unknown>;
  if (!INITIATIVE_MODES.includes(mode as InitiativeMode) || !INITIATIVE_SIDES.includes(firstSide as InitiativeSide)) return undefined;
  if (typeof roll !== 'string' || !isValidDefaultRoll(roll)) return undefined;
  return {
    mode: mode as InitiativeMode, roll: roll.trim(), firstSide: firstSide as InitiativeSide,
    ...(typeof modifierField === 'string' && modifierField.trim() ? { modifierField: modifierField.trim() } : {}),
  };
}

/**
 * Whether the rules can be saved as they stand; while they are edited the roll may be half
 * typed. By sides nothing is rolled, so the roll does not matter there.
 */
export function isValidInitiativeRules(rules: InitiativeRules): boolean {
  return rules.mode !== 'turn-order' || isValidDefaultRoll(rules.roll);
}

/** The rules as they are stored: the roll trimmed, and a d20 where it was left half typed behind another mode. */
export function savedInitiativeRules(rules: InitiativeRules): InitiativeRules {
  const { modifierField, ...rest } = rules;
  return {
    ...rest, roll: isValidDefaultRoll(rules.roll) ? rules.roll.trim() : DEFAULT_INITIATIVE_RULES.roll,
    ...(modifierField?.trim() ? { modifierField: modifierField.trim() } : {}),
  };
}

/**
 * The collection's initiative rules: its own, else those of the preset it was
 * set from, else the default. A collection stores rules of its own only once
 * the GM edits them, so a corrected built-in system reaches it.
 */
export function collectionInitiativeRules(
  settings: { initiative?: unknown; systemPresetId?: string | undefined },
  presets: readonly SystemPreset[],
): InitiativeRules {
  return parseInitiativeRules(settings.initiative)
    ?? presets.find((preset) => preset.id === settings.systemPresetId)?.rules.initiative
    ?? { ...DEFAULT_INITIATIVE_RULES };
}

export function sameInitiativeRules(a: InitiativeRules | undefined, b: InitiativeRules | undefined): boolean {
  const left = a ?? DEFAULT_INITIATIVE_RULES;
  const right = b ?? DEFAULT_INITIATIVE_RULES;
  return left.mode === right.mode
    && left.firstSide === right.firstSide
    && (left.modifierField?.trim() ?? '') === (right.modifierField?.trim() ?? '')
    && left.roll.trim().toLowerCase() === right.roll.trim().toLowerCase();
}
