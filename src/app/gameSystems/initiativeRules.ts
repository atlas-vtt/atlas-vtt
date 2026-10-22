/**
 * A collection's initiative rules: reading them from the settings, checking and
 * comparing them.
 */

import type { InitiativeMode, InitiativeRules, InitiativeSide } from '../types/initiativeRulesTypes';
import type { SystemPreset } from '../types/systemPresetTypes';
import { isValidDefaultRoll } from './diceRules';
import { modifierSources, sameModifierSources } from './initiativeModifierSources';
import { BUILT_IN_SIDES, areSidesValid, parseSideRoll, sameSideParts, savedSideParts, sideParts } from './initiativeSideRules';
import { cardParts, isCardPartValid, sameCardParts } from './initiativeCardRules';

/** Initiative of a collection without a game system: a d20 each, highest first. */
export const DEFAULT_INITIATIVE_RULES: Readonly<InitiativeRules> = { mode: 'turn-order', roll: '1d20', firstSide: 'players' };

export const INITIATIVE_MODES: readonly InitiativeMode[] = ['turn-order', 'sides', 'cards'];

export const INITIATIVE_SIDES: readonly InitiativeSide[] = BUILT_IN_SIDES;

/**
 * Stored initiative rules, or undefined when they are none. Older versions read rules whose mode
 * they do not know as none, and play by the preset's or the default.
 */
export function parseInitiativeRules(raw: unknown): InitiativeRules | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const fields = raw as Record<string, unknown>;
  const { mode, roll, firstSide } = fields;
  if (!INITIATIVE_MODES.includes(mode as InitiativeMode) || !INITIATIVE_SIDES.includes(firstSide as InitiativeSide)) return undefined;
  if (typeof roll !== 'string' || !isValidDefaultRoll(roll)) return undefined;
  const sideRoll = parseSideRoll(fields.sideRoll);
  return {
    mode: mode as InitiativeMode,
    roll: roll.trim(),
    ...sideParts(fields.sides, firstSide as InitiativeSide),
    ...modifierSources(fields),
    ...(sideRoll && { sideRoll }),
    ...cardParts(fields),
    ...hitPointRolls(fields.rollHitPoints),
  };
}

/**
 * Whether the rules can be saved as they stand; while they are edited the roll may be half
 * typed. By sides nothing is rolled, so the roll does not matter there.
 */
export function isValidInitiativeRules(rules: InitiativeRules): boolean {
  if (rules.mode === 'turn-order') return isValidDefaultRoll(rules.roll);
  if (rules.mode === 'cards') return isCardPartValid(rules);
  return areSidesValid(rules.sides) && (rules.sideRoll === undefined || isValidDefaultRoll(rules.sideRoll));
}

/**
 * The rules as they are stored: the roll trimmed, and a d20 where it was left half typed behind
 * another mode. Sides and cards are stored only in their own mode: what was set in another and
 * left behind there is no rule of the collection's.
 */
export function savedInitiativeRules(rules: InitiativeRules): InitiativeRules {
  const roll = isValidDefaultRoll(rules.roll) ? rules.roll.trim() : DEFAULT_INITIATIVE_RULES.roll;
  return {
    mode: rules.mode,
    roll,
    ...modifierSources(rules),
    ...(rules.mode === 'sides' ? savedSideParts(rules) : { firstSide: rules.firstSide }),
    ...(rules.mode === 'cards' ? cardParts(rules) : {}),
    ...hitPointRolls(rules.rollHitPoints),
  };
}

/** The hit point switch as it is stored: present only where it is on. */
function hitPointRolls(raw: unknown): Pick<InitiativeRules, 'rollHitPoints'> {
  return raw === true ? { rollHitPoints: true } : {};
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
  // Sides and cards count only in their own mode, so parts left behind in another make no edit
  return left.mode === right.mode
    && (left.mode !== 'sides' || sameSideParts(left, right))
    && (left.mode !== 'cards' || sameCardParts(left, right))
    && sameModifierSources(left, right)
    && Boolean(left.rollHitPoints) === Boolean(right.rollHitPoints)
    && left.roll.trim().toLowerCase() === right.roll.trim().toLowerCase();
}
