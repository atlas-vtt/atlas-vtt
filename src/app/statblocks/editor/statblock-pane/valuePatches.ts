/**
 * What a commit in the pane writes: per-key patches whose `base` is the value
 * the edit started from (§8.1, §8.3). Typed text becomes a value by the
 * field's declared type; text that does not fit is kept as typed, and the
 * field shows a warning dot for it. Pure: no React, no Obsidian.
 */

import type { FieldKey, FieldValue, TemplateField } from '../../model/templateTypes';
import { deepEqual } from '../../notes/listIdentity';
import type { NotePatch } from '../../notes/patchTypes';
import { coerce } from '../../values/valueCoercion';
import type { FieldRead } from '../../values/fieldValues';
import { splitEscapedList, typedListText } from '../../values/listText';
import { textProblem } from '../../values/valueFit';
import { valueText } from '../../values/valueText';

/** The value typed text stores in a field: coerced by its type, else the text as typed. Blank clears the key. */
export function valueForText(field: TemplateField, text: string): FieldValue | undefined {
  const result = coerce(field.type, text, field);
  return result.ok ? result.value : result.raw;
}

/** What an empty value's input asks for: the field's prompt, else its label. */
export function valuePlaceholder(field: TemplateField): string {
  return field.prompt?.trim() || field.label;
}

/** Why typed text does not fit its field's type ("“1/4” isn't a number."); null where it fits. */
export function valueProblem(field: TemplateField, value: FieldValue | undefined): string | null {
  return typeof value === 'string' ? textProblem(field, value) : null;
}

/** A value as the pane's text input starts with it; in a field whose text parts at commas, those of an item escaped. */
export function textOfValue(field: Pick<TemplateField, 'type'>, value: FieldValue | undefined): string {
  return field.type === 'pairs' || field.type === 'list' ? typedListText(value) : valueText(value);
}

/**
 * The patches that change a field from what `read` found to `next`. A value
 * kept under a former key moves to the current key as it changes (§8.3).
 */
export function fieldPatches(key: FieldKey, read: FieldRead, next: FieldValue | undefined): NotePatch[] {
  const base = read.value;
  if (next === undefined ? base === undefined : base !== undefined && deepEqual(base, next)) return [];
  if (next === undefined) return base === undefined ? [] : [{ op: 'delete', path: [read.key], base }];
  if (read.viaFormerKey) return [{ op: 'renameKey', from: read.key, to: key }, { op: 'set', path: [key], base, next }];
  return [{ op: 'set', path: [key], base, next }];
}

/** The items a list field shows as chips: a list's items, or a comma list written as one line. */
export function listItems(value: FieldValue | undefined): FieldValue[] {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return splitEscapedList(valueText(value));
}

/** Adds a chip: inserted after the last item of a stored list; a value that is no list is written as one. */
export function addItemPatches(read: FieldRead, key: FieldKey, item: string): NotePatch[] {
  if (Array.isArray(read.value)) {
    const last = read.value[read.value.length - 1];
    return [{ op: 'insert', list: read.key, after: last === undefined ? null : last, item }];
  }
  return fieldPatches(key, read, [...listItems(read.value), item]);
}

/** Removes a chip: the item itself from a stored list, by value; a value that is no list is written as one. */
export function removeItemPatches(read: FieldRead, key: FieldKey, index: number): NotePatch[] {
  const items = listItems(read.value);
  const item = items[index];
  if (item === undefined) return [];
  if (Array.isArray(read.value)) return [{ op: 'remove', list: read.key, item }];
  const rest = items.filter((_, at) => at !== index);
  return fieldPatches(key, read, rest.length ? rest : undefined);
}
