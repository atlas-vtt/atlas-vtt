/**
 * Changes to an entries field ("Actions", "Traits"), entry by entry: a name,
 * a text or an extra by its path in the list, inserts, moves and removals by the item
 * itself, so a list that was reordered meanwhile still finds the right entry
 * (§8.3) and never writes into another one. Pure.
 */

import type { EntryShape, FieldKey, FieldValue } from '../../model/templateTypes';
import { deepEqual, isFieldMap } from '../../notes/listIdentity';
import type { NotePatch } from '../../notes/patchTypes';
import { isEmptyValue } from '../../values/emptyValue';
import { entryName, entryNameKey, entryText, entryTextKey, entryTextKeyOf, extraValue, listedEntryRecord } from '../../values/entryValues';

export type EntryPart = 'name' | 'text';

/** A part of an entry: its name, its text, or one of its shape's extras by key ("Type", "Range"). */
export type EntryPartKey = EntryPart | { extra: string };

/** The list a value holds as entries: a list as it is, one entry, or none. */
export function entryList(value: FieldValue | undefined): FieldValue[] {
  if (Array.isArray(value)) return value;
  return value === undefined || value === null ? [] : [value];
}

/** The indexes of the entries the card shows, in order: empty items and entries without a name or text are left out. */
export function shownEntryIndexes(list: readonly FieldValue[], shape: EntryShape | undefined): number[] {
  return list.flatMap((item, index) => {
    if (isEmptyValue(item)) return [];
    return entryName(item, shape) !== undefined || entryText(item, shape) !== undefined ? [index] : [];
  });
}

/** A new entry with these parts, its extras in the shape's order between name and text; parts left blank are left out. */
export function newEntry(shape: EntryShape | undefined, name: string, text: string, extras: Readonly<Record<string, string>> = {}): FieldValue {
  const parts: Array<[EntryPartKey, string]> = [
    ['name', name],
    ...(shape?.extras ?? []).map((extra): [EntryPartKey, string] => [{ extra: extra.key }, extras[extra.key] ?? '']),
    ['text', text],
  ];
  const entry: Record<string, FieldValue> = {};
  for (const [part, typed] of parts) {
    const value = partValue(shape, part, typed);
    if (value !== undefined) entry[partKey(shape, part)] = value;
  }
  return entry;
}

/** The key a part is stored under: in `item`, its text under the key it already holds it (`entryTextKeyOf`). */
function partKey(shape: EntryShape | undefined, part: EntryPartKey, item?: FieldValue): string {
  if (part === 'name') return entryNameKey(shape);
  if (part === 'text') return item === undefined ? entryTextKey(shape) : entryTextKeyOf(item, shape);
  return part.extra;
}

/** What typed text stores in a part: the name trimmed, the text trimmed at its end, an extra by its type. Undefined where blank. */
function partValue(shape: EntryShape | undefined, part: EntryPartKey, text: string): FieldValue | undefined {
  if (typeof part === 'object') return extraValue(shape?.extras?.find((extra) => extra.key === part.extra), text);
  const next = part === 'text' ? text.trimEnd() : text.trim();
  return next === '' ? undefined : next;
}

/**
 * Sets one part of an entry: its name, its text or an extra. A record
 * changes the one key; an entry written as plain text is all text, and gets
 * a name or an extra by becoming a record; an entry written as a list
 * becomes the record it reads as. A part made blank is removed.
 */
export function entryPartPatches(list: FieldKey, index: number, item: FieldValue, shape: EntryShape | undefined, part: EntryPartKey, text: string): NotePatch[] {
  const next = partValue(shape, part, text);
  if (isFieldMap(item)) {
    const key = partKey(shape, part, item);
    const base = item[key];
    if (next === undefined) return base === undefined ? [] : [{ op: 'delete', path: [list, index, key], base }];
    return base !== undefined && deepEqual(base, next) ? [] : [{ op: 'set', path: [list, index, key], base, next }];
  }
  if (Array.isArray(item)) {
    const whole = entryWithPart(item, shape, part, text);
    return deepEqual(listedEntryRecord(item, shape), whole) ? [] : [{ op: 'set', path: [list, index], base: item, next: whole }];
  }
  if (next === undefined) return part === 'text' ? [removeEntryPatch(list, item)] : [];
  const whole = entryWithPart(item, shape, part, text);
  return deepEqual(item, whole) ? [] : [{ op: 'set', path: [list, index], base: item, next: whole }];
}

/** The entry as it is once one of its parts reads `text`: what list operations in the same write must find. */
export function entryWithPart(item: FieldValue, shape: EntryShape | undefined, part: EntryPartKey, text: string): FieldValue {
  if (Array.isArray(item)) return entryWithPart(listedEntryRecord(item, shape), shape, part, text);
  const next = partValue(shape, part, text);
  const key = partKey(shape, part, item);
  if (isFieldMap(item)) {
    if (next !== undefined) return { ...item, [key]: next };
    return Object.fromEntries(Object.entries(item).filter(([name]) => name !== key));
  }
  if (part === 'text') return next ?? '';
  if (next === undefined) return item;
  return part === 'name' ? { [key]: next, [entryTextKey(shape)]: item } : { [entryTextKey(shape)]: item, [key]: next };
}

/** Inserts an entry after the item at `afterIndex`, or first. An absent list is made with it. */
export function insertEntryPatch(list: FieldKey, items: readonly FieldValue[], afterIndex: number | null, entry: FieldValue): NotePatch {
  const after = afterIndex === null ? null : items[afterIndex] ?? null;
  return { op: 'insert', list, after, item: entry };
}

/** Moves the entry at `index` one place up (-1) or down (1); null at either end. */
export function moveEntryPatch(list: FieldKey, items: readonly FieldValue[], index: number, step: 1 | -1): NotePatch | null {
  return moveEntryToPatch(list, items, index, index + step);
}

/** Moves the entry at `from` so that it stands at `to` (a drag's drop); null where it stays. */
export function moveEntryToPatch(list: FieldKey, items: readonly FieldValue[], from: number, to: number): NotePatch | null {
  const item = items[from];
  if (item === undefined || to === from || to < 0 || to >= items.length) return null;
  // Placed after the item that will precede it: the one at `to` when moving down, the one before `to` when moving up.
  const afterIndex = to > from ? to : to - 1;
  const after = afterIndex < 0 ? null : items[afterIndex] ?? null;
  return { op: 'move', list, item, after };
}

export function removeEntryPatch(list: FieldKey, item: FieldValue): NotePatch {
  return { op: 'remove', list, item };
}
