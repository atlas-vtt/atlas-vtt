/**
 * A statblock's values as its card shows them: every `@` reference that names a number of the
 * statblock (`statblockLookup`) written as that number, `2d6 + 12 + @int` reading `2d6 + 12 + 3`.
 * The note keeps what was written; only what is shown changes. A reference that names no number
 * stays as written, which the card flags and never rolls. Pure.
 */

import type { FieldRecord } from './fieldValues';
import { readField } from './fieldValues';
import { parseNumberText, roundForDisplay } from './numberText';
import { DICE_AFTER, namesReference, readReference, type FieldLookup } from './references';
import type { TemplateField } from '../model/templateTypes';

/** An `@` right after a letter or digit is part of a word (an address, `art@2x.png`), never a reference. */
const IN_WORD = /[\p{L}\p{N}]/u;
const SPACES = /^[ \t]*/;
/** An operator the number comes after, with the spaces after it: `+ ` in `1d8 + @str`, a typeset minus too. */
const OPERATOR_BEFORE = /([+\-−–*/×÷])([ \t]*)$/;
const MINUS = /[-−–]/;
/** A sign with the spaces after it, at the end of what was written so far. */
const SIGN_BEFORE = /[+\-−–][ \t]*$/;
/** A sum of numbers and nothing else, as a Number field's value comes out once its references are in. */
export const NUMBER_SUM = /^[+-]?\s*\d+(?:\.\d+)?(?:\s*[+-]\s*\d+(?:\.\d+)?)*$/;

/** The number a reference reads: a finite number, or text that writes one (`+2`, `1.5`). */
function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return typeof value === 'string' ? parseNumberText(value) : null;
}

/** A number as the card writes it. */
const numberText = (value: number): string => String(value);

/** Whether a number written after `before` is added or subtracted: it follows a sign, or no operator at all (it opens the formula). */
function addedAfter(before: string): boolean {
  const operator = OPERATOR_BEFORE.exec(before)?.[1];
  return operator === undefined || operator === '+' || MINUS.test(operator);
}

/** A negative number after a multiplication or division stands in parentheses, so the formula still reads: `3 * (-2)`. */
function signedAfter(before: string, value: number): string {
  return value < 0 && !addedAfter(before) ? `(${numberText(value)})` : numberText(value);
}

/** `+ -1` reads `- 1` and `- -1` reads `+ 1`: a negative number written after a sign takes it over. */
function mergedSigns(text: string): string {
  return text.replace(/([+\-−–])([ \t]*)-(\d+(?:\.\d+)?)$/, (_, sign: string, spaces: string, digits: string) => `${MINUS.test(sign) ? '+' : '-'}${spaces}${digits}`);
}

/**
 * Where a reference stood in the written text (`from`, `to`) and where its number stands in the
 * filled one (`at`, `end`). A negative number whose sign took over the one before it (`+ @x` reading
 * `- 1`) takes in that sign on both sides. `path` is the path read, as written; `added` says the
 * number is a term of a sum (after a sign, or opening the text), not a dice count or a factor.
 */
export interface FilledReference {
  readonly from: number;
  readonly to: number;
  readonly at: number;
  readonly end: number;
  readonly path: string;
  readonly added: boolean;
}

export interface Filled {
  readonly text: string;
  /** The paths of the references that name no number, as written. */
  readonly unresolved: string[];
  /** The references written as their numbers, in order. */
  readonly filled: FilledReference[];
}

/** `text` with every reference that names a number written as it; `unresolved` lists those that name none. */
export function fillReferences(text: string, lookup: FieldLookup): Filled {
  if (!namesReference(text)) return { text, unresolved: [], filled: [] };
  let out = '';
  const unresolved: string[] = [];
  const filled: FilledReference[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const at = text.indexOf('@', cursor);
    if (at < 0) break;
    const reference = at > 0 && IN_WORD.test(text[at - 1]!) ? null : readReference(text, at, lookup);
    if (reference === null) {
      out += text.slice(cursor, at + 1);
      cursor = at + 1;
      continue;
    }
    out += text.slice(cursor, at);
    const value = 'missing' in reference ? null : numberOf(reference.value);
    if (value === null || 'missing' in reference) {
      unresolved.push('missing' in reference ? reference.missing : reference.field);
      out += text.slice(at, reference.end);
      cursor = reference.end;
      continue;
    }
    const start = out.length;
    const path = reference.field;
    const rest = text.slice(reference.end);
    if (DICE_AFTER.test(rest)) {
      // A dice count stands against its die: `@level d6` reads `3d6`
      out += numberText(value);
      cursor = reference.end + SPACES.exec(rest)![0].length;
      filled.push({ from: at, to: cursor, at: start, end: out.length, path, added: false });
      continue;
    }
    const added = addedAfter(out);
    out += signedAfter(out, value);
    cursor = reference.end;
    // The sign before a negative number takes over its minus: that sign is then part of what the reference filled in
    const merged = value < 0 ? mergedSigns(out) : out;
    const sign = merged === out ? 0 : SIGN_BEFORE.exec(out.slice(0, start))![0].length;
    out = merged;
    filled.push({ from: at - sign, to: cursor, at: start - sign, end: out.length, path, added });
  }
  return { text: out + text.slice(cursor), unresolved, filled };
}

/** A value with its references filled in, strings at any depth; the same value where nothing changes. */
function filledValue(value: unknown, lookup: FieldLookup): unknown {
  if (typeof value === 'string') return fillReferences(value, lookup).text;
  if (Array.isArray(value)) {
    const items = value.map((item) => filledValue(item, lookup));
    return items.some((item, index) => item !== value[index]) ? items : value;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).map(([key, item]): [string, unknown] => [key, filledValue(item, lookup)]);
    return entries.some(([key, item]) => item !== (value as Record<string, unknown>)[key]) ? Object.fromEntries(entries) : value;
  }
  return value;
}

/** What a Number field's filled value comes to: a sum of numbers is its total, anything else stays. */
export function numberValue(value: unknown): unknown {
  if (typeof value !== 'string' || !NUMBER_SUM.test(value.trim())) return value;
  const terms = value.replace(/\s+/g, '').match(/[+-]?\d+(?:\.\d+)?/g) ?? [];
  const total = terms.reduce((sum, term) => sum + Number(term), 0);
  return Number.isFinite(total) ? roundForDisplay(total) : value;
}

/** Every string inside a value, at any depth, in order. */
export function stringsIn(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  return value !== null && typeof value === 'object' ? Object.values(value).flatMap(stringsIn) : [];
}

/** The references a value's text names, strings at any depth: in a filled value, those that name no number. */
export function namedReferences(value: unknown): string[] {
  return stringsIn(value).flatMap((text) => fillReferences(text, () => undefined).unresolved);
}

/** A reference written as part of a formula: next to an operator or a dice term, `+ @str`, `@level d6`. */
const IN_FORMULA = /(?:[+\-−–*/×(]\s*@[\w.-]+|@[\w.-]+\s*(?:[+\-−–*/×)]|[dD]\d))/;

/** The unresolved references of a shown value that stand in a formula, strings at any depth: where prose names someone (`Ask @DM`) is none. */
export function formulaReferences(value: unknown): string[] {
  return namedReferences(stringsIn(value).filter((text) => IN_FORMULA.test(text)));
}

/** Typed text with every reference read as 1, to check what it would be once filled in (`2d6 + @str` reads `2d6 + 1`). */
export function withReferencesAsOne(text: string): string {
  return fillReferences(text, () => 1).text;
}

/** Whether any string inside a value names a reference. */
function holdsReference(value: unknown): boolean {
  return stringsIn(value).some(namesReference);
}

/**
 * The record as the card shows it: each template field's value with its references filled in,
 * under the key it is stored by, and a Number field that names references as its total. The same
 * record where no value names one.
 */
export function withReferencesFilled(record: FieldRecord, fields: readonly TemplateField[], lookup: FieldLookup): FieldRecord {
  let filled: Record<string, unknown> | null = null;
  for (const field of fields) {
    const read = readField(record, field);
    if (!holdsReference(read.value)) continue;
    const value = filledValue(read.value, lookup);
    filled ??= { ...record };
    filled[read.key] = field.type === 'number' ? numberValue(value) : value;
  }
  return filled ?? record;
}
