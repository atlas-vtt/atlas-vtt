/**
 * What a GM types into a resource's value: a number that sets it (`12`), or a change that starts
 * with its sign and may be worked out (`-10-5`, `-9/2`, `-9*2`, `+2+3`). Every input that edits a
 * resource's number reads it here: the token's bar, the tracker's card, the change for a selection.
 */

import { evaluateFormula } from '../tools/evaluateFormula';
import { parseFormula } from '../tools/parseFormula';
import type { ResourceValue } from './resourceTypes';

/** A typed value: a number to set, or an amount to add (negative: to take away). */
export type ResourceInput = { readonly relative: false; readonly value: number } | { readonly relative: true; readonly amount: number };

/** The typographic signs people paste or type on other keyboards, as the formula grammar writes them. */
const SIGNS: Readonly<Record<string, string>> = { '−': '-', '–': '-', '×': '*', '÷': '/' };

const PLAIN_NUMBER = /^\d+$/;
/** A change of one number (`-12000`): read whole, as the formula grammar caps its constants at four digits. */
const PLAIN_CHANGE = /^[+-]\d+$/;

/**
 * Reads a typed value; null where it is none. A number alone sets the value; a change starts with
 * `+` or `-` and is worked out with the formula grammar's arithmetic (`+ - * /`, parentheses, exact
 * fractions), constants only: dice are refused, never rolled. Only the result is cut to a whole
 * number, towards zero, so halved damage rounds down (`-9/2` takes 4).
 */
export function parseResourceInput(raw: string): ResourceInput | null {
  const text = raw.trim().replace(/[−–×÷]/g, (sign) => SIGNS[sign] ?? sign);
  if (PLAIN_NUMBER.test(text)) {
    const value = Number(text);
    return Number.isSafeInteger(value) ? { relative: false, value } : null;
  }
  if (PLAIN_CHANGE.test(text)) {
    const amount = Number(text);
    return Number.isSafeInteger(amount) ? { relative: true, amount: amount === 0 ? 0 : amount } : null;
  }
  if (!text.startsWith('+') && !text.startsWith('-')) return null;
  const parsed = parseFormula(text);
  if (!parsed.ok || parsed.terms.some((term) => term.kind !== 'constant')) return null;
  const amount = evaluateFormula(parsed.expression, (term) => (term.kind === 'constant' ? term.value : 0));
  // `-0` is no change, and must not read as a negative zero
  return Number.isSafeInteger(amount) ? { relative: true, amount: amount === 0 ? 0 : amount } : null;
}

/**
 * The value after typing `raw` into its `field` (the current value or the maximum): set, or changed
 * by the typed amount, with the current value clamped into 0..max. Null where the input reads as
 * nothing, or the maximum would not be above 0.
 */
export function applyResourceInput(raw: string, value: ResourceValue, field: keyof ResourceValue = 'current'): ResourceValue | null {
  const input = parseResourceInput(raw);
  if (!input) return null;
  const next = input.relative ? value[field] + input.amount : input.value;
  if (!Number.isSafeInteger(next)) return null;
  const max = field === 'max' ? next : value.max;
  const current = field === 'current' ? next : value.current;
  if (max <= 0) return null;
  return { current: Math.max(0, Math.min(max, current)), max };
}
