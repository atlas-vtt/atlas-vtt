/**
 * One formula for several units of a Spend rule, so they are one roll: three Hit Dice of `1d8+(2)`
 * roll as `3d8+6`. Every die of the unit is rolled once per unit and every constant counted once per
 * unit. A unit that keeps or drops dice (`4d6kh3`), multiplies or divides is written out once per
 * unit instead (`(4d6kh3)+(4d6kh3)`), which is the same roll. Pure.
 */

import { readTerm } from '../tools/formulaTerms';
import type { FormulaTerm } from '../tools/formulaTypes';
import { checkedFormula, MAX_CONSTANT, type FilledFormula, type FormulaFill } from './recoveryFormula';

/** Signs, parentheses and spaces between the terms of a formula that is a plain sum. */
const BETWEEN_TERMS = /[ \t+\-()]/;

/** The text of each term of a plain sum, in the order written: the order `parseFormula` lists its terms in. */
function termTexts(formula: string): string[] {
  const texts: string[] = [];
  let cursor = 0;
  while (cursor < formula.length) {
    if (BETWEEN_TERMS.test(formula[cursor]!)) {
      cursor += 1;
      continue;
    }
    const read = readTerm(formula, cursor);
    if (!read) return [];
    texts.push(formula.slice(cursor, read.end));
    cursor = read.end;
  }
  return texts;
}

/** A term counted `units` times: dice with that many times the dice, a constant that many times over. */
function scaledTerm(term: FormulaTerm, text: string, units: number): string {
  if (term.kind === 'dice') return `${term.count * units}${text.replace(/^\d*/, '')}`;
  const label = text.replace(/^\d+/, '');
  const value = term.value * units;
  return value <= MAX_CONSTANT ? `${value}${label}` : `${units}*${text}`;
}

/** The unit summed `units` times by its terms, or null where it is no plain sum whose dice can simply be multiplied. */
function scaledSum(unit: FilledFormula, units: number): string | null {
  const { terms, linear } = unit.parsed;
  if (!linear || terms.some((term) => term.kind === 'dice' && term.keep !== undefined)) return null;
  const texts = termTexts(unit.formula);
  if (texts.length !== terms.length) return null;
  return terms.map((term, index) => {
    const sign = term.negative ? '-' : index === 0 ? '' : '+';
    return `${sign}${scaledTerm(term, texts[index]!, units)}`;
  }).join('');
}

/**
 * The formula `units` units of `unit` come to, checked against the formula limits (a problem of
 * kind `limits` without a field where so many units do not fit one roll). `units` is at least 1.
 */
export function spendFormula(unit: FilledFormula, units: number): FormulaFill {
  if (units === 1) return unit;
  const scaled = unit.dice ? scaledSum(unit, units) : `${units}*(${unit.formula})`;
  const checked = checkedFormula(scaled ?? Array.from({ length: units }, () => `(${unit.formula})`).join('+'));
  // The unit reads, so a combined formula that does not is only too large to write (a count past three digits).
  return checked.ok || checked.problem.kind !== 'syntax' ? checked : { ok: false, problem: { kind: 'limits', field: null } };
}
