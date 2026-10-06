import type { DiceRules } from '../../types/diceRulesTypes';
import { rollFormula, type RolledFormula } from '../diceFormula';
import { parseFormula } from '../parseFormula';

/** Keep formula fixtures readable while exercising the parser and roller together. */
export function rollTestFormula(
  formula: string,
  random: () => number = Math.random,
  rules?: Pick<DiceRules, 'defaultRoll' | 'explode'>,
): RolledFormula {
  const parsed = parseFormula(formula);
  if (!parsed.ok) throw new Error(`Invalid test formula: ${formula}`);
  return rollFormula(parsed, random, rules);
}
