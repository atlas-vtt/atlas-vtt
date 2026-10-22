/**
 * Whether a value a note stores fits its field's declared type (§8.8). A
 * field's type may change after notes were written, and values are never
 * converted: one that does not fit shows as it is written, with a short
 * label ("Not a number") and a sentence saying why. Pure: no React, no Obsidian.
 */

import { formulaReferences, namedReferences } from './fillReferences';
import type { FieldType, FieldValue, TemplateField } from '../model/templateTypes';
import { picksChoice } from './choicePicks';
import { isEmptyValue } from './emptyValue';
import { isPlainRecord } from './fieldValueOf';
import { readCounterRows } from './counterValues';
import { coerce } from './valueCoercion';
import { quoted, valueText } from './valueText';

export interface ValueMisfit {
  /** What the chip says: "Not a number". */
  label: string;
  /** Why, in a sentence: "“fast” isn't a number." */
  problem: string;
}

type FitField = Pick<TemplateField, 'type' | 'options' | 'open' | 'several' | 'numbered' | 'unit'>;

/** What each type holds, for the label and the sentence. */
const TYPE_NOUNS: Readonly<Record<FieldType, { noun: string; label: string }>> = {
  text: { noun: 'plain text', label: 'Not text' },
  markdown: { noun: 'plain text', label: 'Not text' },
  number: { noun: 'a number', label: 'Not a number' },
  rating: { noun: 'a rating', label: 'Not a rating' },
  dice: { noun: 'dice', label: 'Not dice' },
  choice: { noun: 'one of the options', label: 'Not an option' },
  list: { noun: 'a list', label: 'Not a list' },
  scores: { noun: 'a list of table values', label: 'Not table values' },
  entries: { noun: 'a list of entries', label: 'Not entries' },
  pairs: { noun: 'names with numbers', label: 'Not pairs' },
  image: { noun: 'an image path', label: 'Not an image' },
  spells: { noun: 'a spell list', label: 'Not spells' },
  counters: { noun: 'rows of counters, each with a name, as many used as its maximum at most and a dice formula of what it regains', label: 'Not counters' },
};

/** Types whose text is checked by coercion; the others keep any text as it is written. */
const CHECKED_TEXT: ReadonlySet<FieldType> = new Set<FieldType>(['number', 'rating', 'dice', 'choice']);

/** A quoted value is cut here, so a long list never fills the tooltip. */
const MAX_QUOTED = 40;

const isScalar = (value: FieldValue): boolean => value === null || typeof value !== 'object';
const holdsRecords = (value: FieldValue): boolean => Array.isArray(value) && value.some((item) => isPlainRecord(item));
const isCount = (value: FieldValue): boolean => typeof value === 'number' || typeof value === 'boolean';
const never = (): boolean => false;

/**
 * Whether a value has the shape a field of the type shows. Numbers, ratings,
 * dice and choices read a single value as text first, so they see only lists
 * and records here.
 */
const SHAPE_FITS: Readonly<Record<FieldType, (value: FieldValue) => boolean>> = {
  text: (value) => !isPlainRecord(value) && !holdsRecords(value),
  markdown: (value) => !isPlainRecord(value) && !holdsRecords(value),
  number: never,
  rating: never,
  dice: never,
  choice: never,
  // Text is a list written on one line; a lone value is one item.
  list: (value) => !isPlainRecord(value) && !(Array.isArray(value) && value.some((item) => !isScalar(item))),
  scores: (value) => !isScalar(value),
  // Text is one entry, one pair or one line of spells.
  entries: (value) => !isCount(value),
  pairs: (value) => !isCount(value),
  image: (value) => typeof value === 'string',
  spells: (value) => !isCount(value),
  counters: (value) => readCounterRows(value) !== null,
};

function shortQuote(value: FieldValue): string {
  const text = valueText(value).replace(/\s+/g, ' ').trim();
  return quoted(text.length > MAX_QUOTED ? `${text.slice(0, MAX_QUOTED - 1).trimEnd()}…` : text);
}

/**
 * Why typed text does not fit a field of its type ("“1/4” isn't a number."),
 * or null where it does. Only numbers, ratings, dice and choices check text.
 */
export function textProblem(field: FitField, text: string): string | null {
  if (!CHECKED_TEXT.has(field.type) || isEmptyValue(text)) return null;
  const result = coerce(field.type, text, field);
  return result.ok ? null : result.problem;
}

/**
 * A shown value that still names references (`@int`): they name no number of the statblock, so it
 * shows them as written and rolls nothing. Every one counts in a Number or Dice field; in any other
 * only those that stand in a formula (`1d8 + @int`), never prose that names someone (`Ask @DM`).
 * Null where it names none.
 */
export function referenceMisfit(field: Pick<FitField, 'type'>, shown: FieldValue | undefined): ValueMisfit | null {
  const formula = field.type === 'number' || field.type === 'dice';
  const names = [...new Set(formula ? namedReferences(shown) : formulaReferences(shown))];
  if (names.length === 0) return null;
  const listed = names.map((name) => `@${name}`).join(', ');
  return { label: 'Unknown reference', problem: `${listed} ${names.length === 1 ? 'names' : 'name'} no number of this statblock.` };
}

/**
 * Why a stored value does not fit its field's type, or null where it fits or
 * is empty. A single value in a number, rating, dice or choice field is read
 * as the text a statblock writes for it; other values by their shape. Types of
 * a newer template are taken as they come.
 */
export function valueMisfit(field: FitField, value: FieldValue | undefined): ValueMisfit | null {
  if (value === undefined || isEmptyValue(value) || !Object.hasOwn(TYPE_NOUNS, field.type)) return null;
  const problem = misfitProblem(field, value);
  return problem === null ? null : { label: TYPE_NOUNS[field.type].label, problem };
}

function misfitProblem(field: FitField, value: FieldValue): string | null {
  if (CHECKED_TEXT.has(field.type) && isScalar(value)) return textProblem(field, valueText(value));
  // Several picks may be stored as a list, or as a record of options and numbers.
  if (picksChoice(field) && !holdsRecords(value)) return textProblem(field, valueText(value));
  return SHAPE_FITS[field.type](value) ? null : `${shortQuote(value)} isn't ${TYPE_NOUNS[field.type].noun}.`;
}
