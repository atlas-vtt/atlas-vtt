import { MAX_SHEET_KEYS, MAX_SHEET_LIST, type BookListMessage, type SheetPairItem } from '../../protocol/index.ts';
import { fieldPatches, listItems, removeItemPatches } from '../../../statblocks/editor/statblock-pane/valuePatches';
import { fieldByKey } from '../../../statblocks/model/fieldKeys';
import { withHeaderFields } from '../../../statblocks/model/templateHeader';
import type { FieldValue } from '../../../statblocks/model/templateTypes';
import { deepEqual, findItemIndex, isFieldMap } from '../../../statblocks/notes/listIdentity';
import type { NotePatch } from '../../../statblocks/notes/patchTypes';
import type { FieldRead } from '../../../statblocks/values/fieldValues';
import { formatSigned } from '../../../statblocks/values/numberText';
import { normalisePairs } from '../../../statblocks/values/pairValues';
import { playerAccess } from './playerAccess.ts';
import { editableTemplate, playerReferences, referencesSafeIn, sentFields, writtenValue, type CheckedEdit, type EditInputs } from './statblockChecks.ts';

/** A list edit worked out: the patches it is written with and what the field holds once they are in. */
interface ListChange {
  readonly patches: NotePatch[];
  readonly value: FieldValue | undefined;
}

/** Whether a stored word is the word a page names: the same text, or a number the page shows as that text. */
const sameWord = (stored: FieldValue, word: string): boolean => stored === word || (typeof stored === 'number' && String(stored) === word);

/** Whether `item` added after the list's last entry lands at its end: the writer finds that entry by content, the first equal one. */
function appendsInPlace(items: readonly FieldValue[]): boolean {
  const last = items[items.length - 1];
  return last === undefined || findItemIndex(items, last) === items.length - 1;
}

/**
 * An entry put at the end of a list value: inserted after the last entry where the writer finds that
 * entry there, else the whole list against the old one (a value that is no list yet, or a last entry
 * an equal one comes before).
 */
function appended(read: FieldRead, key: string, items: readonly FieldValue[], item: FieldValue): ListChange {
  const value = [...items, item];
  const inPlace = Array.isArray(read.value) && appendsInPlace(items);
  const last = items[items.length - 1];
  return { patches: inPlace ? [{ op: 'insert', list: read.key, after: last ?? null, item }] : fieldPatches(key, read, value), value };
}

/** A word added to or taken from a Words value, as the note pane's chips do. */
function wordChange(read: FieldRead, key: string, message: BookListMessage): ListChange | null {
  const word = message.item;
  if (typeof word !== 'string') return null;
  const items = listItems(read.value);
  if (message.op === 'add') return items.length >= MAX_SHEET_LIST ? null : appended(read, key, items, word);
  const at = items.findIndex((stored) => sameWord(stored, word));
  if (at < 0) return null;
  const rest = items.filter((_, index) => index !== at);
  return { patches: removeItemPatches(read, key, at), value: Array.isArray(read.value) || rest.length > 0 ? rest : undefined };
}

/** The pair a page names: its label as stored and its value as the page was sent it. */
const isPair = (held: { key: string; value: FieldValue }, pair: SheetPairItem): boolean => held.key === pair.label && deepEqual(held.value, pair.value);

const sameLabel = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * A new entry of a list of pairs in the shape its entries have: a name with a description where
 * they are such, a line ("Stealth +5") where every entry is one and the value a number, else a map
 * of the label to the value, as the note pane writes pairs. A line that would not read back as this
 * pair is the map; whether the map does is `pairAdded`'s to check.
 */
function newPairItem(items: readonly FieldValue[], pair: SheetPairItem): FieldValue {
  const plain: FieldValue = { [pair.label]: pair.value };
  if (items.some((item) => isFieldMap(item) && item.desc !== undefined)) return { name: pair.label, desc: pair.value };
  if (items.length === 0 || !items.every((item) => typeof item === 'string') || typeof pair.value !== 'number') return plain;
  const line = `${pair.label} ${formatSigned(pair.value)}`;
  return reads(normalisePairs([line]), [{ key: pair.label, value: pair.value }]) ? line : plain;
}

/** Whether pairs read as exactly these labels and values, in this order. */
const reads = (pairs: readonly { key: string; value: FieldValue }[], wanted: readonly { key: string; value: FieldValue }[]): boolean =>
  pairs.length === wanted.length && pairs.every((held, at) => held.key === wanted[at]?.key && deepEqual(held.value, wanted[at]?.value));

/**
 * A pair added to a Labels and values value: a key of a map, or an entry at the end of a list;
 * never a label the value holds already, and only where the value then reads as the pairs it held
 * and this one after them (a label such as `desc` would make a map or an entry read as another pair).
 */
function pairAdded(read: FieldRead, key: string, pair: SheetPairItem): ListChange | null {
  const stored = read.value;
  const pairs = normalisePairs(stored);
  if (pairs.length >= MAX_SHEET_LIST || pairs.some((held) => sameLabel(held.key, pair.label))) return null;
  let change: ListChange;
  if (isFieldMap(stored)) {
    if (Object.keys(stored).length >= MAX_SHEET_KEYS) return null;
    change = { patches: [{ op: 'set', path: [read.key, pair.label], base: undefined, next: pair.value }], value: { ...stored, [pair.label]: pair.value } };
  } else {
    const items = stored === undefined || stored === null ? [] : Array.isArray(stored) ? stored : [stored];
    change = appended(read, key, items, newPairItem(items, pair));
  }
  return reads(normalisePairs(change.value), [...pairs, { key: pair.label, value: pair.value }]) ? change : null;
}

/** A pair taken out of a Labels and values value: its key of a map, its entry of a list, or its key of an entry that holds others. */
function pairRemoved(read: FieldRead, key: string, pair: SheetPairItem): ListChange | null {
  const stored = read.value;
  if (isFieldMap(stored)) {
    if (!Object.hasOwn(stored, pair.label) || !deepEqual(stored[pair.label], pair.value)) return null;
    const value = Object.fromEntries(Object.entries(stored).filter(([label]) => label !== pair.label));
    return { patches: [{ op: 'delete', path: [read.key, pair.label], base: pair.value }], value };
  }
  if (!Array.isArray(stored)) return stored !== undefined && normalisePairs(stored).some((held) => isPair(held, pair)) ? { patches: fieldPatches(key, read, undefined), value: undefined } : null;
  const at = stored.findIndex((item) => normalisePairs([item]).some((held) => isPair(held, pair)));
  const item = stored[at];
  if (item === undefined) return null;
  const value = stored.filter((_, index) => index !== at);
  if (normalisePairs([item]).length === 1 || !isFieldMap(item)) return { patches: [{ op: 'remove', list: read.key, item }], value };
  const kept = Object.fromEntries(Object.entries(item).filter(([label]) => label !== pair.label));
  return { patches: [{ op: 'set', path: [read.key, at], base: item, next: kept }], value: stored.map((held, index) => (index === at ? kept : held)) };
}

/** A pair added to or taken from a Labels and values value. */
function pairChange(read: FieldRead, key: string, message: BookListMessage): ListChange | null {
  const pair = message.item;
  if (typeof pair === 'string') return null;
  return message.op === 'add' ? pairAdded(read, key, pair) : pairRemoved(read, key, pair);
}

/**
 * A player's entry added to or taken from a list value of their own character's statblock (Words,
 * Labels and values), checked: the statblock is a native one whose template reads as it was
 * written, the sheet last sent to them offered the value for editing and the template still lets
 * players change it, an entry taken out is one the value holds now (with what this GM side wrote
 * and has not seen read back), and one added fits within what a sheet holds (a label not already
 * there). It is written as the note writer's insert or removal of that entry alone, which finds it
 * by its content, so a change the GM made to the list meanwhile stays; the whole value against the
 * old one only where the note keeps it in another shape or under a former key. Null where anything
 * of it is refused.
 */
export function checkListEdit(inputs: EditInputs, message: BookListMessage): CheckedEdit | null {
  const template = editableTemplate(inputs);
  if (template === null || inputs.sent === null || inputs.sent === undefined) return null;
  const sent = sentFields(inputs.sent).find((field) => field.key === message.key);
  if ((sent?.type !== 'list' && sent?.type !== 'pairs') || playerAccess(template, message.key) !== 'edit') return null;
  const field = fieldByKey(withHeaderFields(template).fields, message.key);
  const read = field === undefined ? undefined : inputs.read(field);
  if (field === undefined || read === undefined || field.type !== sent.type) return null;
  const { item } = message;
  // An entry added may name the note's values only as the player was shown them
  if (message.op === 'add' && !referencesSafeIn(item, playerReferences(inputs, template))) return null;
  const change = field.type === 'list' ? wordChange(read, field.key, message) : pairChange(read, field.key, message);
  if (change === null) return null;
  // The note holds the write once it holds the entry as often as the write left it, whatever else the GM changed in the list.
  const tally = (value: FieldValue | undefined): number => (typeof item === 'string' ? listItems(value).filter((stored) => sameWord(stored, item)) : normalisePairs(value).filter((held) => isPair(held, item))).length;
  const left = tally(change.value);
  const readsBack = (stored: FieldValue | undefined): boolean => (message.op === 'add' ? tally(stored) >= left : tally(stored) <= left);
  // A value kept under a key the field had before a rename moves to its key now, as any edit moves it.
  const patches = read.viaFormerKey ? fieldPatches(field.key, read, change.value) : change.patches;
  return { patches, written: [{ ...writtenValue(field.key, read, change.value), readsBack }] };
}
