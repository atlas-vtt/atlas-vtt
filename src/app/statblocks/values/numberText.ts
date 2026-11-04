/**
 * Numbers as statblocks write them. Text counts as a number only when it is
 * nothing else ("14", "+3", "−1", "2.5"); "30 ft." and "1/4" are not numbers.
 * Signs are written with an ASCII hyphen-minus, as Fantasy Statblocks and
 * statblock text in notes write them ("+3", "-1").
 */

import { parseRating } from '../../creatures/creatureValues';
import type { FieldValue } from '../model/templateTypes';

/** A Unicode minus (U+2212) or an en dash typed for one. */
const MINUS_SIGNS = /[\u2212\u2013]/g;
const NUMBER_TEXT = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const WHOLE_NUMBER_TEXT = /^[+-]?\d+$/;
/** A rating and nothing else: "3", "-1", "1/4", "1 / 2", "0.5", "½". */
const RATING_TEXT = /^(?:[+-]?\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[½⅓⅔¼¾⅛⅜⅝⅞])$/;

function normalisedSigns(text: string): string {
  return text.trim().replace(MINUS_SIGNS, '-');
}

/** The number a text is, or null when it is anything more or less than a number. */
export function parseNumberText(text: string): number | null {
  const normalised = normalisedSigns(text);
  if (!NUMBER_TEXT.test(normalised)) return null;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : null;
}

/** Whether the text is a whole number and nothing else ("3", "+2", "−1"). */
export function isWholeNumberText(text: string): boolean {
  return WHOLE_NUMBER_TEXT.test(normalisedSigns(text));
}

/** A number, or text that is one; null for anything else. */
export function numericValue(value: FieldValue | undefined): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return parseNumberText(value);
  return null;
}

/** The number a rating stands for when the text is only a rating ("1/4", "½", "3"); null otherwise. */
export function parseRatingText(text: string): number | null {
  const normalised = normalisedSigns(text);
  return RATING_TEXT.test(normalised) ? parseRating(normalised) : null;
}

/** A number as written, without a sign on zero. */
export function formatNumber(value: number): string {
  return String(value === 0 ? 0 : value);
}

/** A computed number to two decimals at most, so 10 / 3 reads 3.33 and 0.1 + 0.2 reads 0.3. */
export function roundForDisplay(value: number): number {
  if (Number.isInteger(value)) return value === 0 ? 0 : value;
  const rounded = Math.round(value * 100) / 100;
  return rounded === 0 ? 0 : rounded;
}

/** A number with its sign always written: "+3", "+0", "-1". */
export function formatSigned(value: number): string {
  const magnitude = formatNumber(Math.abs(value));
  return value < 0 && magnitude !== '0' ? `-${magnitude}` : `+${magnitude}`;
}
