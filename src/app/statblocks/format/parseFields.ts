/**
 * Reads the field schema. A field whose key is missing, reserved or taken by
 * an earlier field cannot be used and is left out; a field type this Atlas
 * does not know reads as text while the file keeps its own type.
 */

import { isReservedKey } from '../model/reservedKeys';
import {
  FIELD_MEANINGS, FIELD_TYPES, TABLE_ALIGNS, type CounterPreset, type EntryShape, type FieldTracking, type TableAlign, type TableCell,
  type TemplateField,
} from '../model/templateTypes';
import { COUNTER_PRESET_KEYS, ENTRY_EXTRA_KEYS, ENTRY_SHAPE_KEYS, FIELD_KEYS, FIELD_TRACKING_KEYS } from './formatKeys';
import { describeValue, isRecord, own } from './jsonValues';
import { ObjectReader } from './objectReader';
import { asBoolean, asKey, asNonNegativeInteger, asOneOf, asString, choices } from './valueReads';

type EntryExtra = NonNullable<EntryShape['extras']>[number];

const TEXT = 'text';
const EXTRA_TYPES = ['text', 'number', 'list', 'dice', 'choice'] as const satisfies readonly EntryExtra['type'][];

export interface FieldContext {
  readonly problems: string[];
  /** Keys of the fields read so far. */
  readonly keys: Set<string>;
}

/** The field's key, or why it cannot name a field. */
function readFieldKey(key: unknown, keys: ReadonlySet<string>): { key: string } | { problem: string } {
  if (key === undefined) return { problem: 'has no key' };
  if (typeof key !== 'string' || key.length === 0) return { problem: `has no usable key (${describeValue(key)})` };
  const quoted = describeValue(key);
  if (isReservedKey(key)) return { problem: `uses the key ${quoted}, which is reserved for statblock markers and Fantasy Statblocks` };
  if (keys.has(key)) return { problem: `uses the key ${quoted}, which an earlier field already uses` };
  return { key };
}

export function parseField(raw: unknown, index: number, ctx: FieldContext): TemplateField | undefined {
  const where = `Field ${index + 1}`;
  if (!isRecord(raw)) {
    ctx.problems.push(`${where} is ${describeValue(raw)}, not a field; it is ignored.`);
    return undefined;
  }
  const read = readFieldKey(own(raw, 'key'), ctx.keys);
  if ('problem' in read) {
    ctx.problems.push(`${where} ${read.problem}; it is ignored.`);
    return undefined;
  }
  const { key } = read;
  ctx.keys.add(key);
  const r = new ObjectReader(raw, `Field ${describeValue(key)}`, ctx.problems, FIELD_KEYS);
  return r.finish({
    key,
    label: r.withDefault('label', asString, key, TEXT),
    type: r.withDefault('type', asOneOf(FIELD_TYPES), 'text', 'a field type this version of Atlas knows'),
    ...r.opt('meaning', asOneOf(FIELD_MEANINGS), 'a meaning this version of Atlas knows'),
    ...r.optList('formerKeys', asKey, 'field keys'),
    ...r.opt('unit', asString, TEXT),
    ...r.optList('options', asString, TEXT),
    ...r.opt('open', asBoolean, 'true or false'),
    ...r.opt('several', asBoolean, 'true or false'),
    ...r.opt('numbered', asBoolean, 'true or false'),
    ...r.optList('slots', asString, TEXT),
    ...r.optList('slotKeys', asString, TEXT),
    ...r.opt('header', asFalse, 'false'),
    ...r.optList('rows', asTableRow, 'lists of numbers, text or null'),
    ...r.optList('align', asAlign, `${choices(TABLE_ALIGNS)} or null`),
    ...r.opt('addRows', asFalse, 'false'),
    ...r.opt('addColumns', asFalse, 'false'),
    ...r.opt('entry', (value) => readEntryShape(value, r.where, ctx.problems), 'an object'),
    ...r.optList('counterRows', (item, at) => readCounterPreset(item, at, r.where, ctx.problems), 'rows with a name'),
    ...r.opt('prompt', asString, TEXT),
    ...r.opt('tracks', (value) => readTracking(value, r.where, ctx.problems), 'an object'),
  });
}

/** How a number is tracked; a direction this version does not know reads as counting down. */
function readTracking(raw: unknown, where: string, problems: string[]): FieldTracking | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, `${where} › tracks`, problems, FIELD_TRACKING_KEYS);
  return r.finish({
    counts: r.withDefault('counts', asOneOf(['down', 'up'] as const), 'down', 'down or up'),
    ...r.opt('max', asKey, 'a field key'),
  });
}

/** `header: false` hides a Table's header row; `true` is what unset means and is not kept. */
function asFalse(value: unknown): false | undefined {
  return value === false ? false : undefined;
}

function isTableCell(value: unknown): value is TableCell {
  return value === null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
}

/** A row of a Table's starting cells: a list of numbers, text and nulls, or none at all. */
function asTableRow(value: unknown): TableCell[] | undefined {
  return Array.isArray(value) && value.every(isTableCell) ? [...value] : undefined;
}

function asAlign(value: unknown): TableAlign | null | undefined {
  return value === null ? null : TABLE_ALIGNS.find((align) => align === value);
}

/** A row a Counters field starts with; one without a name is left out, a maximum that is no whole number reads as 0. */
function readCounterPreset(raw: unknown, index: number, where: string, problems: string[]): CounterPreset | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, `${where} › counter ${index + 1}`, problems, COUNTER_PRESET_KEYS);
  const name = r.get('name', asString);
  if (name === undefined) return undefined;
  return r.finish({
    name,
    max: r.withDefault('max', asNonNegativeInteger, 0, 'a whole number of 0 or more'),
    ...r.opt('regain', asString, TEXT),
  });
}

function readEntryShape(raw: unknown, where: string, problems: string[]): EntryShape | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, `${where} › entry`, problems, ENTRY_SHAPE_KEYS);
  return r.finish({
    ...r.opt('nameKey', asKey, 'a key'),
    ...r.opt('textKey', asKey, 'a key'),
    ...r.optList('extras', (item, index) => readEntryExtra(item, index, r.where, problems), 'entry parts with a key'),
  });
}

function readEntryExtra(raw: unknown, index: number, where: string, problems: string[]): EntryExtra | undefined {
  if (!isRecord(raw)) return undefined;
  const r = new ObjectReader(raw, `${where} › part ${index + 1}`, problems, ENTRY_EXTRA_KEYS);
  const key = r.get('key', asKey);
  if (key === undefined) return undefined;
  return r.finish({
    key,
    label: r.withDefault('label', asString, key, TEXT),
    type: r.withDefault('type', asOneOf(EXTRA_TYPES), 'text', choices(EXTRA_TYPES)),
    ...r.optList('options', asString, TEXT),
    ...r.opt('several', asBoolean, 'true or false'),
  });
}
