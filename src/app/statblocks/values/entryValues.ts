/**
 * Entries fields ("Traits", "Actions"): lists of `{ name, desc, ...extras }`,
 * read through the field's `EntryShape`. An entry written as plain text is
 * all text and no name; one written as a list (`[Bite, Melee 1d6]`) is its
 * name and then its text, as Fantasy Statblocks reads it.
 */

import type { EntryExtraShape, EntryShape, FieldValue } from '../model/templateTypes';
import { isEmptyValue } from './emptyValue';
import { splitListText } from './listText';
import { parseNumberText } from './numberText';
import { valueText } from './valueText';

export const DEFAULT_ENTRY_NAME_KEY = 'name';
/** Fantasy Statblocks' key; its Daggerheart notes use `text`, which their templates name in `textKey`. */
export const DEFAULT_ENTRY_TEXT_KEY = 'desc';

export interface EntryExtra extends EntryExtraShape {
  value: FieldValue;
}

type EntryRecord = { [key: string]: FieldValue };

export function entryNameKey(shape?: EntryShape): string {
  return shape?.nameKey || DEFAULT_ENTRY_NAME_KEY;
}

export function entryTextKey(shape?: EntryShape): string {
  return shape?.textKey || DEFAULT_ENTRY_TEXT_KEY;
}

function asRecord(entry: FieldValue | undefined): EntryRecord | null {
  return entry !== null && typeof entry === 'object' && !Array.isArray(entry) ? entry : null;
}

/** An entry written as a list, as the record it stands for: its first item the name, the rest the text. */
export function listedEntryRecord(entry: FieldValue[], shape?: EntryShape): EntryRecord {
  const [name, ...rest] = entry;
  const record: EntryRecord = {};
  const nameText = textOf(name);
  const text = textOf(rest.map((part) => valueText(part)).join(''));
  if (nameText !== undefined) record[entryNameKey(shape)] = nameText;
  if (text !== undefined) record[entryTextKey(shape)] = text;
  return record;
}

/** The record an entry stands for: itself, or a list entry read as one; null for an entry of plain text. */
function entryRecord(entry: FieldValue | undefined, shape?: EntryShape): EntryRecord | null {
  return Array.isArray(entry) ? listedEntryRecord(entry, shape) : asRecord(entry);
}

function textOf(value: FieldValue | undefined): string | undefined {
  const text = valueText(value);
  return text.trim() === '' ? undefined : text;
}

/** The entries of an entries value: a list's non-empty items, or a lone entry. */
export function entryItems(value: FieldValue | undefined): FieldValue[] {
  if (Array.isArray(value)) return value.filter((item) => !isEmptyValue(item));
  return isEmptyValue(value) || value === undefined ? [] : [value];
}

export function entryName(entry: FieldValue | undefined, shape?: EntryShape): string | undefined {
  return textOf(entryRecord(entry, shape)?.[entryNameKey(shape)]);
}

/**
 * The key this entry's text is read and written under: the shape's, else
 * `desc` where the entry holds nothing under the shape's key but has a `desc`.
 * Fantasy Statblocks draws an entry whose callback gives nothing
 * (`return property.text` on `{ name, desc }`) with its `desc`, and the notes
 * of one layout keep either.
 */
export function entryTextKeyOf(entry: FieldValue | undefined, shape?: EntryShape): string {
  const key = entryTextKey(shape);
  const record = entryRecord(entry, shape);
  if (!record || key === DEFAULT_ENTRY_TEXT_KEY || textOf(record[key]) !== undefined) return key;
  return textOf(record[DEFAULT_ENTRY_TEXT_KEY]) === undefined ? key : DEFAULT_ENTRY_TEXT_KEY;
}

export function entryText(entry: FieldValue | undefined, shape?: EntryShape): string | undefined {
  const record = entryRecord(entry, shape);
  return record ? textOf(record[entryTextKeyOf(record, shape)]) : textOf(entry);
}

/** The shape's extras the entry has a value for, in the shape's order. */
export function entryExtras(entry: FieldValue | undefined, shape?: EntryShape): EntryExtra[] {
  const record = entryRecord(entry, shape);
  if (!record) return [];
  return (shape?.extras ?? []).flatMap((extra) => {
    const value = record[extra.key];
    return value === undefined || isEmptyValue(value) ? [] : [{ ...extra, value }];
  });
}

/** Each of the shape's extras as text, by key, as an input shows it: '' where the entry has none. */
export function entryExtraTexts(entry: FieldValue | undefined, shape?: EntryShape): Record<string, string> {
  const record = entryRecord(entry, shape);
  return Object.fromEntries((shape?.extras ?? []).map((extra) => [extra.key, valueText(record?.[extra.key])]));
}

/** What text typed for an extra stores, by its type: a number where it reads as one, a list's items, else the text. Undefined where blank. */
export function extraValue(extra: Pick<EntryExtraShape, 'type'> | undefined, text: string): FieldValue | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return undefined;
  if (extra?.type === 'number') return parseNumberText(trimmed) ?? trimmed;
  if (extra?.type !== 'list') return trimmed;
  const items = splitListText(trimmed);
  return items.length > 0 ? items : undefined;
}
