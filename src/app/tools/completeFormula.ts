/**
 * A formula as it is rolled: one without dice (`+3`) is added to the set's
 * dice, an empty one rolls them alone, and dice written out roll as written.
 */

import { setRoll } from '../gameSystems/diceSets';
import type { DiceRules } from '../types/diceRulesTypes';
import type { RollingDice } from '../types/diceSetTypes';
import { FORMULA_LIMITS, parseFormula, type FormulaError, type ParsedFormula } from './parseFormula';

export interface CompleteFormula {
  ok: true;
  /** The formula rolled, e.g. `1d20+3` for `+3`. */
  formula: string;
  parsed: ParsedFormula;
  /** The formula wrote its own dice; appearance needs a separate opt-in. */
  written: boolean;
}

/** `+3` with `1d20` gives `1d20+3`; a bare number counts as a bonus. Spaces in labels stay. */
function withDefaultRoll(modifier: string, defaultRoll: string): string {
  const bonus = modifier.replace(/\s+(?![^[]*\])/g, '');
  return bonus === '' || /^[+-]/.test(bonus) ? `${defaultRoll}${bonus}` : `${defaultRoll}+${bonus}`;
}

/**
 * The formula `formula` rolls by `rules`, or the error that refuses it. The
 * input is validated before it is completed, so completing a bonus can neither
 * strip illegal text nor evade a limit. The completed formula is held to every
 * limit again, its length to what was written plus the dice put before it
 * (`FORMULA_LIMITS.completed`): a bonus whose labels (`+4[Agility]`) fill the
 * written length still rolls once the set's dice are added.
 */
export function completeFormula(formula: string, rules: DiceRules | RollingDice): CompleteFormula | FormulaError {
  // Stored dice rules roll their default roll as written: one a hand edit broke is refused, not replaced.
  const defaultRoll = 'dice' in rules ? setRoll(rules.dice) : rules.defaultRoll;
  const input = parseFormula(formula === '' ? defaultRoll : formula);
  if (!input.ok) return input;
  const written = input.terms.some((term) => term.kind === 'dice') && formula !== '';
  const complete = written ? formula : withDefaultRoll(formula, defaultRoll);
  const parsed = parseFormula(complete, written ? FORMULA_LIMITS.characters : FORMULA_LIMITS.completed);
  return parsed.ok ? { ok: true, formula: complete, parsed, written } : parsed;
}
