import { MAX_ABILITIES, type AbilityInput, type BookAbilityMessage, type SheetRaw } from '../../protocol/index.ts';
import { fieldPatches } from '../../../statblocks/editor/statblock-pane/valuePatches';
import { fieldByKey } from '../../../statblocks/model/fieldKeys';
import type { EntryExtraShape, EntryShape, FieldValue } from '../../../statblocks/model/templateTypes';
import { deepEqual, findItemIndex, isFieldMap } from '../../../statblocks/notes/listIdentity';
import type { NotePatch } from '../../../statblocks/notes/patchTypes';
import { keyedEntryItems } from '../../../statblocks/values/entryKeys';
import { entryNameKey, entryTextKey, entryTextKeyOf } from '../../../statblocks/values/entryValues';
import type { FieldRead } from '../../../statblocks/values/fieldValues';
import { playerAccess } from './playerAccess.ts';
import { amongOptions, clears, editableTemplate, inOptionOrder, isDice, isLine, isPlainList, writtenValue, type CheckedEdit, type EditInputs } from './statblockChecks.ts';

/** Whether a part's value fits the part as the template shapes it. */
function fitsPart(shape: EntryExtraShape, value: SheetRaw): boolean {
  switch (shape.type) {
    case 'text': return isLine(value);
    case 'number': return typeof value === 'number';
    case 'list': return isPlainList(value);
    case 'dice': return isDice(value);
    case 'choice': return shape.several === true ? inOptionOrder(value, shape.options ?? [], false) : amongOptions(value, shape.options, false);
  }
}

/** The parts of an ability as the note keeps them, in the template's order, empty ones left out; null where one is no part of the list or does not fit it. */
function abilityParts(shape: EntryShape | undefined, parts: AbilityInput['parts']): [string, FieldValue][] | null {
  const extras = shape?.extras ?? [];
  if (Object.keys(parts).some((key) => !extras.some((extra) => extra.key === key))) return null;
  const kept: [string, FieldValue][] = [];
  for (const extra of extras) {
    const value = Object.hasOwn(parts, extra.key) ? parts[extra.key] : undefined;
    if (value === undefined || clears(value)) continue;
    if (!fitsPart(extra, value)) return null;
    kept.push([extra.key, value as FieldValue]);
  }
  return kept;
}

/** A new ability exactly as the page predicts it: `{ [nameKey]: name, [textKey]: text, ...parts }`, empty values left out. */
function newAbility(shape: EntryShape | undefined, entry: AbilityInput, parts: readonly [string, FieldValue][]): FieldValue {
  return { [entryNameKey(shape)]: entry.name, ...Object.fromEntries(parts), ...(entry.text !== '' && { [entryTextKey(shape)]: entry.text }) };
}

/** An ability with its name, text and parts replaced in place; keys the template does not show are kept. One written as text alone becomes a new ability. */
function editedAbility(item: FieldValue, shape: EntryShape | undefined, entry: AbilityInput, parts: readonly [string, FieldValue][]): FieldValue {
  if (!isFieldMap(item)) return newAbility(shape, entry, parts);
  const nameKey = entryNameKey(shape);
  const textKey = entryTextKeyOf(item, shape);
  const wanted = new Map<string, FieldValue | undefined>([[nameKey, entry.name], [textKey, entry.text === '' ? undefined : entry.text]]);
  for (const extra of shape?.extras ?? []) wanted.set(extra.key, undefined);
  for (const [key, value] of parts) wanted.set(key, value);
  const edited: Record<string, FieldValue> = {};
  for (const [key, value] of Object.entries(item)) {
    const next = wanted.has(key) ? wanted.get(key) : value;
    if (next !== undefined) edited[key] = next;
  }
  for (const [key, value] of wanted) if (value !== undefined && !Object.hasOwn(edited, key)) edited[key] = value;
  return edited;
}

/** The list as it is once the edit is in, and where it changed; null where the edit names an ability the list does not hold. */
function editedList(items: readonly FieldValue[], read: FieldRead, shape: EntryShape | undefined, message: BookAbilityMessage, parts: readonly [string, FieldValue][]): { list: FieldValue[]; at: number } | null {
  const keyed = keyedEntryItems(read.value);
  const indexOf = (key: string): number | undefined => keyed.find((entry) => entry.key === key)?.index;
  if (message.op === 'add') {
    const after = message.after === null ? -1 : indexOf(message.after);
    if (after === undefined || items.length >= MAX_ABILITIES) return null;
    const at = after + 1;
    return { list: [...items.slice(0, at), newAbility(shape, message.entry, parts), ...items.slice(at)], at };
  }
  const at = indexOf(message.key);
  const item = at === undefined ? undefined : items[at];
  if (at === undefined || item === undefined) return null;
  if (message.op === 'remove') return { list: items.filter((_, index) => index !== at), at };
  return { list: items.map((held, index) => (index === at ? editedAbility(held, shape, message.entry, parts) : held)), at };
}

/**
 * The patches of one list edit: the writer's own operations on a stored list, which find the item
 * by its content and so compare and swap; the whole list against the old one where those would
 * find another item (an equal one before it), and where the note keeps the list as one entry or
 * under a key it had before a rename.
 */
function listPatches(key: string, read: FieldRead, items: readonly FieldValue[], message: BookAbilityMessage, next: { list: FieldValue[]; at: number }): NotePatch[] {
  const whole = (): NotePatch[] => fieldPatches(key, read, next.list);
  if (!Array.isArray(read.value) || read.viaFormerKey) return whole();
  const { at, list } = next;
  if (message.op === 'remove') {
    const item = items[at];
    return item === undefined ? whole() : [{ op: 'remove', list: read.key, item }];
  }
  const item = list[at];
  if (item === undefined) return whole();
  if (message.op === 'edit') {
    const base = items[at];
    return base === undefined || deepEqual(base, item) ? [] : [{ op: 'set', path: [read.key, at], base, next: item }];
  }
  const after = at === 0 ? null : items[at - 1] ?? null;
  const placed = after === null || findItemIndex(items, after) === at - 1;
  return placed && !deepEqual(items[at], item) ? [{ op: 'insert', list: read.key, after, item }] : whole();
}

/**
 * A player's change of an ability list of their own character's statblock, checked: the statblock
 * is a native one whose template reads as it was written, the sheet last sent to them offered the
 * list for editing and the template still lets players change it, an ability it names is one the
 * list holds now (with what this GM side wrote and has not seen read back), and the parts fit the
 * list's shape. The player owns the whole list: they add after any ability (first for none),
 * change one (its name, text and parts; keys the template does not show stay) or remove one.
 * Null where anything of it is refused.
 */
export function checkAbilityEdit(inputs: EditInputs, message: BookAbilityMessage): CheckedEdit | null {
  const template = editableTemplate(inputs);
  const offered = inputs.sent?.abilities.some((component) => component.access === 'edit' && component.spells !== true && component.tabs.some((tab) => tab.list === message.list));
  if (template === null || offered !== true || playerAccess(template, message.list) !== 'edit') return null;
  const field = fieldByKey(template.fields, message.list);
  const read = field === undefined ? undefined : inputs.read(field);
  if (field?.type !== 'entries' || read === undefined) return null;
  const parts = message.op === 'remove' ? [] : abilityParts(field.entry, message.entry.parts);
  if (parts === null) return null;
  const items = Array.isArray(read.value) ? read.value : keyedEntryItems(read.value).map((entry) => entry.item);
  const next = editedList(items, read, field.entry, message, parts);
  if (next === null) return null;
  return {
    patches: listPatches(field.key, read, items, message, next),
    written: [writtenValue(field.key, read, next.list)],
  };
}
