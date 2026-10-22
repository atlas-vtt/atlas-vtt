/**
 * A recovery formula with the statblock's numbers put in (`1d4+@tier`, `@level d6`), checked as
 * Atlas's dice parser reads it, and worked out where it holds no dice. References are the
 * statblock's (`statblocks/values/references.ts`). It takes only a whole number: bare where it stands as a
 * dice count (`@level d6`, `@leveld6` become `3d6`), in parentheses everywhere else so a negative
 * number parses (`1d8+@con` becomes `1d8+(-1)`). Nothing inside a `[label]` is read. The limits of
 * a formula are checked again once the numbers are in. Pure.
 */

import { DICE_AFTER, readReference, wholeNumber, type FieldLookup } from '../statblocks/values/references';
import { evaluateFormula } from '../tools/evaluateFormula';
import { parseFormula, type FormulaErrorCode, type ParsedFormula } from '../tools/parseFormula';

/** Why a formula cannot be used; `field` names the `@field` at fault where there is one. */
export type FormulaProblem =
  | { readonly kind: 'missing'; readonly field: string }
  | { readonly kind: 'not-whole'; readonly field: string }
  | { readonly kind: 'limits'; readonly field: string | null }
  | { readonly kind: 'syntax' };

/** A formula ready to use: as rolled (`3d6+(2)`), parsed, and whether it holds dice. */
export interface FilledFormula {
  readonly ok: true;
  readonly formula: string;
  readonly parsed: ParsedFormula;
  readonly dice: boolean;
}

export type FormulaFill = FilledFormula | { readonly ok: false; readonly problem: FormulaProblem };

/** The largest constant and dice count the parser reads (`\d{1,4}` and `\d{0,3}`). */
export const MAX_CONSTANT = 9999;
const MAX_DICE_COUNT = 999;
const LIMIT_CODES: ReadonlySet<FormulaErrorCode> = new Set(['length', 'terms', 'dice', 'faces', 'depth', 'total', 'modifier']);

const SPACES = /^[ \t]*/;

type Substitution = { ok: true; text: string; fields: string[] } | { ok: false; problem: FormulaProblem };

/** The formula with every `@field` outside a label put in, or the field that cannot be. */
function substitute(formula: string, lookup: FieldLookup): Substitution {
  let text = '';
  const fields: string[] = [];
  let cursor = 0;
  while (cursor < formula.length) {
    const character = formula[cursor]!;
    if (character === '[') {
      const close = formula.indexOf(']', cursor);
      const end = close < 0 ? formula.length : close + 1;
      text += formula.slice(cursor, end);
      cursor = end;
      continue;
    }
    const reference = readReference(formula, cursor, lookup);
    if (reference === null) {
      text += character;
      cursor += 1;
      continue;
    }
    if ('missing' in reference) return { ok: false, problem: { kind: 'missing', field: reference.missing } };
    const value = wholeNumber(reference.value);
    if (value === undefined) return { ok: false, problem: { kind: 'not-whole', field: reference.field } };
    const rest = formula.slice(reference.end);
    const count = DICE_AFTER.test(rest);
    if (count ? value < 0 || value > MAX_DICE_COUNT : Math.abs(value) > MAX_CONSTANT) {
      return { ok: false, problem: { kind: 'limits', field: reference.field } };
    }
    fields.push(reference.field);
    text += count ? String(value) : `(${value})`;
    cursor = reference.end + (count ? SPACES.exec(rest)![0].length : 0);
  }
  return { ok: true, text, fields };
}

/** A formula parsed as it is used, or why it cannot be; `fields` names what was put in, for a limit it breaks. */
export function checkedFormula(text: string, fields: readonly string[] = []): FormulaFill {
  const parsed = parseFormula(text);
  if (!parsed.ok) {
    if (!LIMIT_CODES.has(parsed.code)) return { ok: false, problem: { kind: 'syntax' } };
    return { ok: false, problem: { kind: 'limits', field: fields[0] ?? null } };
  }
  return { ok: true, formula: text, parsed, dice: parsed.terms.some((term) => term.kind === 'dice') };
}

/** `formula` with the note's numbers put in (`lookup`), checked; never rolled here. */
export function fillFormula(formula: string, lookup: FieldLookup): FormulaFill {
  const substituted = substitute(formula.trim(), lookup);
  return substituted.ok ? checkedFormula(substituted.text, substituted.fields) : substituted;
}

/** What a formula without dice comes to, worked out exactly and cut towards zero, as a roll of it would. */
export function computeFormula(parsed: ParsedFormula): number {
  return evaluateFormula(parsed.expression, (term) => (term.kind === 'constant' ? term.value : 0));
}

/** A formula as people write it: the parentheses a number was put in dropped where its sign can stand alone (`1d8+(-1)` reads `1d8-1`). */
export function readableFormula(formula: string): string {
  return formula
    .replace(/([+-])\((-?)(\d+)\)/g, (_, sign: string, minus: string, digits: string) => `${(sign === '-') !== (minus === '-') ? '-' : '+'}${digits}`)
    .replace(/^\((-?\d+)\)/, '$1');
}
