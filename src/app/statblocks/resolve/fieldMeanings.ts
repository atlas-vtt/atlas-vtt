import type { FieldKey, FieldMeaning, TemplateField } from '../model/templateTypes';
import { readField, type FieldRecord } from '../values/fieldValues';

export type FieldMeanings = Readonly<Partial<Record<FieldMeaning, FieldKey>>>;

/** What Fantasy Statblocks' statblocks and the auto template mean: nothing beyond their keys. */
export const NO_MEANINGS: FieldMeanings = Object.freeze({});

/** The key of the first field that carries each meaning (the template editor allows one per meaning). */
export function meaningsOf(fields: readonly TemplateField[]): FieldMeanings {
  const meanings: Partial<Record<FieldMeaning, FieldKey>> = {};
  for (const field of fields) {
    if (field.meaning && meanings[field.meaning] === undefined) meanings[field.meaning] = field.key;
  }
  return Object.keys(meanings).length > 0 ? meanings : NO_MEANINGS;
}

/**
 * The record with each renamed field also under its current key: where a
 * field's key is absent and one of its former keys holds a value (the newest
 * first, as `readField` reads them), the current key gets that value. Former
 * keys stay, so readers of either name find it. Unchanged records come back as
 * the same object.
 */
export function withFormerKeysAliased(record: FieldRecord, fields: readonly TemplateField[]): FieldRecord {
  let aliased: Record<string, unknown> | null = null;
  for (const field of fields) {
    if (!field.formerKeys?.length) continue;
    const read = readField(record, field);
    if (!read.viaFormerKey) continue;
    aliased ??= { ...record };
    aliased[field.key] = record[read.key];
  }
  return aliased ?? record;
}

/**
 * The record without the former keys `withFormerKeysAliased` leaves beside a
 * renamed field's current key, so what lists a statblock's fields one by one
 * (the DM screen's quantities) names each field once. A former key that is
 * another field's current key stays.
 */
export function withoutFormerKeys(record: FieldRecord, fields: readonly TemplateField[]): FieldRecord {
  const current = new Set(fields.map((field) => field.key));
  const former = new Set<string>();
  for (const field of fields) {
    if (!Object.hasOwn(record, field.key) || record[field.key] === undefined) continue;
    for (const key of field.formerKeys ?? []) {
      if (!current.has(key) && Object.hasOwn(record, key)) former.add(key);
    }
  }
  return former.size === 0 ? record : Object.fromEntries(Object.entries(record).filter(([key]) => !former.has(key)));
}
