/**
 * Atlas's dice: the dice its tray offers, the formula a selection makes, rolling a formula, and
 * what players may see of a roll. It imports only pure dice maths (`parseFormula.ts`, `diceFormula.ts`,
 * `diceCrit.ts` and the dice rules they read, `gameSystems/diceRules`), so it needs no PIXI or UI code.
 */
import { getDiceCrit } from './diceCrit';
import { rollFormula as rollDiceFormula } from './diceFormula';
import { parseFormula, type FormulaErrorCode, type ParsedFormula } from './parseFormula';
import type { DiceRules } from '../types/diceRulesTypes';
import type { DiceRollResult } from '../types/diceTypes';
import { t } from '../i18n';

export type { DiceRollResult } from '../types/diceTypes';

/** The dice of Atlas's dice tray, in tray order. */
export const DICE_TYPES = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const;
export type DieType = typeof DICE_TYPES[number];

/** How many of each die are picked; a die left out counts 0. */
export type DiceSelection = Partial<Record<DieType, number>>;


export function isDieType(value: unknown): value is DieType {
  return typeof value === 'string' && (DICE_TYPES as readonly string[]).includes(value);
}

/** The picked dice in the order they were picked, e.g. `['2d6', 'd20']`; dice with no count are left out. */
export function diceTerms(selection: Readonly<Partial<Record<string, number>>>): string[] {
  return Object.entries(selection).flatMap(([die, count]) => (
    isDieType(die) && count !== undefined && count > 0 ? [count > 1 ? `${count}${die}` : die] : []
  ));
}

/** The formula Atlas rolls for a selection and a modifier, e.g. "2d6+d20-1"; empty without dice. */
export function diceFormula(selection: Readonly<Partial<Record<string, number>>>, modifier = 0): string {
  const dice = diceTerms(selection).join('+');
  if (!dice || modifier === 0) return dice;
  return `${dice}${modifier > 0 ? '+' : '-'}${Math.abs(modifier)}`;
}

/** A formula Atlas does not roll (`parseFormula`): `code` says why. Nothing was rolled. */
export class DiceFormulaError extends Error {
  constructor(readonly formula: string, readonly code: FormulaErrorCode) {
    super(`Atlas does not roll "${formula.slice(0, 80)}" (${code}): at most 64 characters, 10 terms, 100 dice and 1,000 faces.`);
    this.name = 'DiceFormulaError';
  }
}

/** `formula` checked whole before any die is rolled; throws `DiceFormulaError` when Atlas would not roll it. */
function parsedFormula(formula: string): ParsedFormula {
  const parsed = parseFormula(formula);
  if (!parsed.ok) throw new DiceFormulaError(formula, parsed.code);
  return parsed;
}

function rollParsed(formula: string, parsed: ParsedFormula, random: () => number, now: number, rules?: DiceRules): DiceRollResult {
  const { rolls, modifiers, total } = rollDiceFormula(parsed, random, rules);
  return {
    id: `roll_${now}_${Math.random().toString(36).slice(2, 11)}`,
    timestamp: now,
    formula,
    rolls,
    modifiers,
    total,
    ...(rules && { crit: getDiceCrit(rolls, rules) }),
    player: t('dice.player'),
  };
}

/**
 * Rolls `formula` with `random` for the dice (`diceFormula.ts`), by the collection's `rules` when
 * given: its exploding dice and, for the result, its critical rule. The id stays random however
 * the dice are rolled, so rolls made in the same millisecond never share one. Throws
 * `DiceFormulaError`, before any die is rolled, for a formula Atlas's dice tray would refuse.
 */
export function rollFormula(formula: string, random: () => number = Math.random, now: number = Date.now(), rules?: DiceRules): DiceRollResult {
  return rollParsed(formula, parsedFormula(formula), random, now, rules);
}

/** A roll for a token hidden from players keeps its ability and result, not the token's name or portrait. */
export function withoutHiddenToken(result: DiceRollResult, isTokenHidden: (tokenId: string) => boolean): DiceRollResult {
  const source = result.source;
  const tokenId = source?.tokenId;
  if (!source || !tokenId || !isTokenHidden(tokenId)) return result;
  const { type, abilityName } = source;
  return { ...result, source: abilityName ? { type, abilityName } : { type } };
}

/** The dice log as a map file keeps it: rolls by someone other than the GM stay in the live log only. */
export function persistableDiceLog(log: readonly DiceRollResult[]): DiceRollResult[] {
  return log.filter((entry) => !entry.rolledBy);
}

/** The name a roll shows: the person who rolled it, or a statblock roll's token; null for the GM's own. */
export function rollerName(result: DiceRollResult): string | null {
  if (result.rolledBy) return result.rolledBy;
  const source = result.source;
  return source?.type === 'statblock' && source.tokenName ? source.tokenName : null;
}

/** `+3` with `1d20` gives `1d20+3`; a bare number counts as a bonus. */
function withDefaultRoll(modifier: string, defaultRoll: string): string {
  const bonus = modifier.replace(/\s+/g, '');
  return bonus === '' || /^[+-]/.test(bonus) ? `${defaultRoll}${bonus}` : `${defaultRoll}+${bonus}`;
}

/**
 * Rolls `formula` by a collection's `rules`, as Atlas's dice tray does: one without dice (`+3`), or an empty one, is
 * added to the rules' default roll. The formula as given and the completed one are both checked before any die is
 * rolled, so completing a bonus cannot pass text or limits the tray refuses; throws `DiceFormulaError` then.
 */
export function rollByRules(formula: string, rules: DiceRules, random: () => number = Math.random, now: number = Date.now()): DiceRollResult {
  const input = parsedFormula(formula === '' ? rules.defaultRoll : formula);
  const complete = input.terms.some((term) => term.kind === 'dice') && formula !== '' ? formula : withDefaultRoll(formula, rules.defaultRoll);
  return rollParsed(complete, parsedFormula(complete), random, now, rules);
}
