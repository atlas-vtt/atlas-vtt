/**
 * Reading a statblock's values the way its template names them. A field whose
 * key is absent reads its first present former key, so a renamed key keeps
 * every note readable (§8.8). Patterns, formulas and conditions read only
 * through a `ValueReader`.
 */

import type { FieldKey, FieldValue, TemplateField } from '../model/templateTypes';
import { toFieldValue } from './fieldValueOf';
import { pairValue } from './pairValues';

/** A value by reference: a key ("hp") or a key and an index ("stats.1", "saves.dex"). */
export type ValueReader = (ref: string) => FieldValue | undefined;

/** A statblock note's frontmatter, or any record of values by key. */
export type FieldRecord = Readonly<Record<string, unknown>>;

export type KeyedField = Pick<TemplateField, 'key' | 'formerKeys'>;

export interface FieldRead {
  value: FieldValue | undefined;
  /** The key the value was read from: the field's own, or the former key that held it. */
  key: FieldKey;
  viaFormerKey: boolean;
}

const POSITION = /^\d+$/;

/** A key is present when the record holds it with a value, null included. */
function holds(record: FieldRecord, key: FieldKey): boolean {
  return Object.hasOwn(record, key) && record[key] !== undefined;
}

export function readField(record: FieldRecord, field: KeyedField): FieldRead {
  if (holds(record, field.key)) return { value: toFieldValue(record[field.key]), key: field.key, viaFormerKey: false };
  for (const former of field.formerKeys ?? []) {
    if (holds(record, former)) return { value: toFieldValue(record[former]), key: former, viaFormerKey: true };
  }
  return { value: undefined, key: field.key, viaFormerKey: false };
}

/** "stats.1" is the key `stats` and the index "1"; a ref without a dot has no index. */
export function splitRef(ref: string): { key: string; index: string | null } {
  const dot = ref.indexOf('.');
  return dot < 0 ? { key: ref, index: null } : { key: ref.slice(0, dot), index: ref.slice(dot + 1) };
}

/**
 * The part of a value an index names: a position in a list, else a name, which
 * matches a record's key (exactly, then in any case) or a pair in a list of pairs.
 */
export function indexInto(value: FieldValue | undefined, index: string): FieldValue | undefined {
  if (Array.isArray(value)) return POSITION.test(index) ? value[Number(index)] : pairValue(value, index);
  if (value === null || typeof value !== 'object') return undefined;
  if (Object.hasOwn(value, index)) return value[index];
  const wanted = index.toLowerCase();
  const key = Object.keys(value).find((candidate) => candidate.toLowerCase() === wanted);
  return key === undefined ? undefined : value[key];
}

/**
 * A reader over a record for a template's fields: their keys read through
 * former keys, other keys as the record holds them. A key that itself holds a
 * dot is read whole before the ref is split. The reader answers each ref once,
 * so build a new one when the record changes.
 */
export function readerFor(record: FieldRecord, fields: readonly KeyedField[]): ValueReader {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  const readKey = (key: FieldKey): FieldValue | undefined => {
    const field = byKey.get(key);
    if (field) return readField(record, field).value;
    return Object.hasOwn(record, key) ? toFieldValue(record[key]) : undefined;
  };
  const readRef = (ref: string): FieldValue | undefined => {
    const { key, index } = splitRef(ref);
    if (index === null) return readKey(key);
    return readKey(ref) ?? indexInto(readKey(key), index);
  };
  const answers = new Map<string, FieldValue | undefined>();
  return (ref) => {
    if (answers.has(ref)) return answers.get(ref);
    const value = readRef(ref);
    answers.set(ref, value);
    return value;
  };
}

/**
 * Names references the way the template labels them, for messages: "Speed"
 * for `speed`, the slot label "Dex" for `stats.1`, "Saving Throws dex" for
 * `saves.dex`; undefined for keys the template does not know.
 */
export function fieldLabels(fields: readonly Pick<TemplateField, 'key' | 'label' | 'slots'>[]): (ref: string) => string | undefined {
  const byKey = new Map(fields.map((field) => [field.key, field]));
  return (ref) => {
    const whole = byKey.get(ref);
    if (whole) return whole.label;
    const { key, index } = splitRef(ref);
    const field = byKey.get(key);
    if (!field || index === null) return undefined;
    if (!POSITION.test(index)) return `${field.label} ${index}`;
    return field.slots?.[Number(index)] ?? `${field.label} ${Number(index) + 1}`;
  };
}

/** The key a scores slot has in a pairs field: its `slotKeys` entry, else its label in lower case. */
export function slotKeyOf(field: Pick<TemplateField, 'slots' | 'slotKeys'>, index: number): string | undefined {
  return field.slotKeys?.[index] ?? field.slots?.[index]?.toLowerCase();
}

/** A list of one-key records is a pairs list (`[{ dexterity: 12 }]`), not scores in slot order. */
export function isPairsList(value: FieldValue[]): boolean {
  return value.length > 0 && value.every((item) => item !== null && typeof item === 'object' && !Array.isArray(item));
}

/**
 * One slot of a scores value, as written ("14", or "—" where a creature has
 * none). Scores are a list in slot order; a record of scores, or a list of
 * such records, is read by the slot's key or label.
 */
export function scoreIn(value: FieldValue | undefined, field: Pick<TemplateField, 'slots' | 'slotKeys'>, index: number): FieldValue | undefined {
  if (Array.isArray(value) && !isPairsList(value)) return value[index];
  return pairValue(value, slotKeyOf(field, index), field.slots?.[index]);
}

/** A scores field's value in one slot, read from a note's values. */
export function scoreAt(
  record: FieldRecord,
  field: KeyedField & Pick<TemplateField, 'slots' | 'slotKeys'>,
  index: number,
): FieldValue | undefined {
  return scoreIn(readField(record, field).value, field, index);
}
