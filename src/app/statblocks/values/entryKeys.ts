/**
 * Identities for the items of a list (spec §7.2): a hash of the item's
 * content plus its occurrence among equal items, so the n-th "Bite" stays
 * the n-th "Bite" however the list is reordered. Keys come from the stored
 * values, never from positions: a key keeps naming the same ability after a
 * move, and an ability whose text is being typed keeps its key until the
 * text is written. Pure.
 */

import type { FieldValue } from '../model/templateTypes';
import { isEmptyValue } from './emptyValue';

/** A value written with its map keys in order, so equal values read the same whatever order YAML gave their keys. */
function canonical(value: FieldValue | undefined): string {
  if (value === undefined) return 'u';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}

/** FNV-1a over the text, in base 36. */
function hash(text: string): string {
  let h = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** One key per item, in the list's order: equal items are told apart by how many came before them. */
export function entryItemKeys(list: readonly FieldValue[]): string[] {
  const seen = new Map<string, number>();
  return list.map((item) => {
    const content = hash(canonical(item));
    const occurrence = seen.get(content) ?? 0;
    seen.set(content, occurrence + 1);
    return `${content}~${occurrence}`;
  });
}

export interface KeyedEntry {
  item: FieldValue;
  key: string;
  /** Where the item stands in the stored list. */
  index: number;
}

/**
 * The entries an entries value shows (`entryItems`: a list's non-empty items,
 * or a lone entry), each with its key and its place in the stored list.
 */
export function keyedEntryItems(value: FieldValue | undefined): KeyedEntry[] {
  if (value === undefined || isEmptyValue(value)) return [];
  const list = Array.isArray(value) ? value : [value];
  const keys = entryItemKeys(list);
  return list.flatMap((item, index) => (isEmptyValue(item) ? [] : [{ item, key: keys[index] ?? String(index), index }]));
}
