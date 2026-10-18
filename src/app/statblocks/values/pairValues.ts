/**
 * Pairs fields as notes hold them: a record (`{ dex: 5 }`), a list of
 * one-key records (`[{ dexterity: 5 }]`, Fantasy Statblocks' saves), entries
 * with a description (`[{ name: Dex, desc: +5 }]`, which Fantasy Statblocks'
 * saves read too), or text items ("Stealth +5"). Names match without regard
 * to case.
 */

import type { FieldValue } from '../model/templateTypes';
import { DEFAULT_ENTRY_TEXT_KEY, entryName } from './entryValues';
import { formatSigned, numericValue, parseNumberText } from './numberText';
import { valueText } from './valueText';

export interface Pair {
  key: string;
  value: FieldValue;
}

/** One pair as text: "Dex +5", "Perception: 4", "Str −1". */
const PAIR_TEXT = /^(.*?\S)\s*:?\s*([+\-\u2212]?\d+(?:\.\d+)?)$/;
const LETTER = /\p{L}/u;

/** A name and a number written as text, or null when the text is not one. */
export function parsePairText(text: string): { key: string; value: number } | null {
  const match = PAIR_TEXT.exec(text.trim());
  const key = match?.[1];
  const value = match?.[2] === undefined ? null : parseNumberText(match[2]);
  return key !== undefined && LETTER.test(key) && value !== null ? { key, value } : null;
}

function itemPairs(item: FieldValue | undefined): Pair[] {
  if (typeof item === 'string') {
    const text = item.trim();
    if (text === '') return [];
    return [parsePairText(text) ?? { key: text, value: null }];
  }
  if (item === null || typeof item !== 'object' || Array.isArray(item)) return [];
  if (item[DEFAULT_ENTRY_TEXT_KEY] !== undefined) return [describedPair(item)];
  return Object.entries(item).map(([key, value]) => ({ key, value }));
}

/**
 * An entry with a description is one pair, its name and its description, as Fantasy Statblocks
 * reads it. A name it leaves out (none, or one starting with `_`) is an empty key.
 */
function describedPair(item: { [key: string]: FieldValue }): Pair {
  const name = entryName(item)?.trim() ?? '';
  return { key: name.startsWith('_') ? '' : name, value: item[DEFAULT_ENTRY_TEXT_KEY] ?? null };
}

/** Every pair of a pairs value in written order; values that hold no pairs give none. */
export function normalisePairs(value: FieldValue | undefined): Pair[] {
  return Array.isArray(value) ? value.flatMap(itemPairs) : itemPairs(value);
}

function findPair(pairs: readonly Pair[], name: string | undefined): Pair | undefined {
  const wanted = name?.trim().toLowerCase();
  if (!wanted) return undefined;
  return pairs.find((pair) => pair.key.trim().toLowerCase() === wanted);
}

/**
 * The value a pairs field holds for a slot: by the slot's key ("dexterity"),
 * else by its label ("Dex"), either in any case.
 */
export function pairValue(pairs: FieldValue | undefined, slotKey: string | undefined, slotLabel?: string): FieldValue | undefined {
  const list = normalisePairs(pairs);
  return (findPair(list, slotKey) ?? findPair(list, slotLabel))?.value;
}

const FIRST_LETTER = /^\p{Ll}/u;

/** A pair's name as a statblock writes it: "dex" reads "Dex". */
export function pairName(key: string): string {
  return key.trim().replace(FIRST_LETTER, (letter) => letter.toUpperCase());
}

/** One pair as a statblock shows it: "Dex +5", the name alone where it has no value ("Stealth"), or the value alone where it has no name. */
export function pairText(pair: Pair, signed: boolean): string {
  const number = signed ? numericValue(pair.value) : null;
  const value = (number === null ? valueText(pair.value) : formatSigned(number)).trim();
  return [pairName(pair.key), value].filter((part) => part !== '').join(' ');
}
