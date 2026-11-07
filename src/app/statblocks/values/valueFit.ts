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
import { t } from '../../i18n';

export interface ValueMisfit {
  /** What the chip says: "Not a number". */
  label: string;
  /** Why, in a sentence: "“fast” isn't a number." */
  problem: string;
}

type FitField = Pick<TemplateField, 'type' | 'options' | 'open' | 'several' | 'numbered' | 'unit'>;

/** What each type holds, for the label and the sentence. */
const TYPE_NOUNS: Readonly<Record<FieldType, { noun: string; label: string }>> = {
  text: { noun: t('statblockEditor.fit.noun.text'), label: t('statblockEditor.fit.not.text') },
  markdown: { noun: t('statblockEditor.fit.noun.text'), label: t('statblockEditor.fit.not.text') },
  number: { noun: t('statblockEditor.fit.noun.number'), label: t('statblockEditor.fit.not.number') },
  rating: { noun: t('statblockEditor.fit.noun.rating'), label: t('statblockEditor.fit.not.rating') },
  dice: { noun: t('statblockEditor.fit.noun.dice'), label: t('statblockEditor.fit.not.dice') },
  choice: { noun: t('statblockEditor.fit.noun.choice'), label: t('statblockEditor.fit.not.choice') },
  list: { noun: t('statblockEditor.fit.noun.list'), label: t('statblockEditor.fit.not.list') },
  scores: { noun: t('statblockEditor.fit.noun.scores'), label: t('statblockEditor.fit.not.scores') },
  entries: { noun: t('statblockEditor.fit.noun.entries'), label: t('statblockEditor.fit.not.entries') },
  pairs: { noun: t('statblockEditor.fit.noun.pairs'), label: t('statblockEditor.fit.not.pairs') },
  image: { noun: t('statblockEditor.fit.noun.image'), label: t('statblockEditor.fit.not.image') },
  spells: { noun: t('statblockEditor.fit.noun.spells'), label: t('statblockEditor.fit.not.spells') },
  counters: { noun: t('statblockEditor.fit.noun.counters'), label: t('statblockEditor.fit.not.counters') },
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
  return { label: t('statblockEditor.fit.unknownRef'), problem: t('statblockEditor.fit.unknownRefWhy', { list: listed, count: names.length }) };
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
  return SHAPE_FITS[field.type](value) ? null : t('statblockEditor.fit.isnt', { value: shortQuote(value), noun: TYPE_NOUNS[field.type].noun });
}
