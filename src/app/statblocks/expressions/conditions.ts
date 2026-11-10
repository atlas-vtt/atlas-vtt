/**
 * `showWhen` conditions and `whenEmpty`: whether a block shows, hides, or
 * shows its fallback pattern.
 */

import { parseRating } from '../../creatures/creatureValues';
import type { BlockBase, Condition, FieldKey, FieldValue } from '../model/templateTypes';
import { isEmptyValue } from '../values/emptyValue';
import type { ValueReader } from '../values/fieldValues';
import { numericValue, parseNumberText, parseRatingText } from '../values/numberText';
import { valueText } from '../values/valueText';

export type BlockVisibility = 'show' | 'hide' | 'fallback';

function sameBoolean(value: FieldValue, expected: boolean): boolean {
  if (typeof value === 'boolean') return value === expected;
  const text = valueText(value).trim().toLowerCase();
  return text === String(expected) || text === (expected ? 'yes' : 'no');
}

function sameNumber(value: FieldValue, expected: number): boolean {
  const number = numericValue(value) ?? (typeof value === 'string' ? parseRatingText(value) : null);
  return number === expected;
}

function sameText(value: FieldValue, expected: string): boolean {
  const wanted = expected.trim().toLowerCase();
  if (typeof value === 'boolean') return wanted === String(value) || wanted === (value ? 'yes' : 'no');
  if (valueText(value).trim().toLowerCase() === wanted) return true;
  const number = parseNumberText(expected);
  return number !== null && numericValue(value) === number;
}

/**
 * Whether a value equals what a condition names: text in any case, numbers by
 * value ("14" is 14, "1/4" is 0.25), yes/no by either spelling, and a list
 * when any of its items does.
 */
function matches(value: FieldValue | undefined, expected: string | number | boolean): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.some((item) => matches(item, expected));
  if (typeof expected === 'boolean') return sameBoolean(value, expected);
  if (typeof expected === 'number') return sameNumber(value, expected);
  return sameText(value, expected);
}

/** A value as the creature filters read ratings: the first number it holds ("30 ft." is 30). */
function ratingOf(value: FieldValue | undefined): number | null {
  return value === undefined || isEmptyValue(value) ? null : parseRating(value);
}

/** Whether the condition holds for the statblock. A condition of a kind this Atlas does not know holds. */
export function evaluateCondition(condition: Condition, reader: ValueReader): boolean {
  const value = reader(condition.field);
  switch (condition.is) {
    case 'present': return !isEmptyValue(value);
    case 'absent': return isEmptyValue(value);
    case 'equal': return matches(value, condition.value);
    case 'not-equal': return !matches(value, condition.value);
    case 'above': {
      const number = ratingOf(value);
      return number !== null && number > condition.value;
    }
    case 'below': {
      const number = ratingOf(value);
      return number !== null && number < condition.value;
    }
    default: return true;
  }
}

/**
 * Whether a block shows. A false `showWhen` hides it. Then, while every field
 * it shows is empty, it hides, unless it has `whenEmpty: 'fallback'` and a
 * fallback pattern, which the caller renders instead (and hides if that is
 * empty too). A block that shows no fields (a heading, a divider) shows.
 * `whenEmpty: 'fold'` hides like 'hide'; where a statblock is filled in, the
 * card folds such a block into a chip first (`render/foldRule.ts`).
 */
export function blockVisibility(
  block: Pick<BlockBase, 'showWhen' | 'whenEmpty' | 'fallback'>,
  reader: ValueReader,
  fieldsShown: readonly FieldKey[],
): BlockVisibility {
  if (block.showWhen && !evaluateCondition(block.showWhen, reader)) return 'hide';
  if (fieldsShown.length === 0 || fieldsShown.some((key) => !isEmptyValue(reader(key)))) return 'show';
  return block.whenEmpty === 'fallback' && block.fallback?.trim() ? 'fallback' : 'hide';
}
