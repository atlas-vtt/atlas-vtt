/**
 * Writes a template as its file. Deterministic: every object writes its known
 * keys in a fixed order (`formatKeys.ts`), then the keys this Atlas does not
 * know in the order they were read. Opaque blocks write back exactly the
 * object they were read from, and values the parser kept (`keptValues.ts`) are
 * written as the file had them until an edit replaces them. 2-space JSON with
 * a trailing newline; `serialize ∘ parse` is a fixed point after one pass.
 */

import type { StatblockTemplate } from '../model/templateTypes';
import {
  CONDITION_KEYS,
  DERIVED_FROM_KEYS,
  ENTRY_EXTRA_KEYS,
  ENTRY_SHAPE_KEYS,
  FIELD_KEYS,
  HEADER_KEYS,
  HEADER_TRACK_KEYS,
  IMPORTED_FROM_KEYS,
  LAYOUT_KEYS,
  SCORE_COLUMN_KEYS,
  SOURCE_KEYS,
  TEMPLATE_KEYS,
  blockKeys,
  type KeyOrder,
} from './formatKeys';
import { isRecord } from './jsonValues';
import { writtenValue } from './keptValues';

type Writer = (value: unknown) => unknown;
type NestedWriters = ReadonlyMap<string, Writer>;

const NONE: NestedWriters = new Map();

function writeObject(source: object, order: KeyOrder, nested: NestedWriters): Record<string, unknown> {
  const values = new Map<string, unknown>(Object.entries(source));
  const entries: [string, unknown][] = [];
  for (const key of order.keys) {
    const written = writtenValue(source, key, values.get(key));
    if (written.value === undefined) continue;
    const write = written.kept ? undefined : nested.get(key);
    entries.push([key, write ? write(written.value) : written.value]);
  }
  for (const [key, value] of values) {
    if (!order.has(key) && value !== undefined) entries.push([key, value]);
  }
  return Object.fromEntries(entries);
}

function objectWriter(order: KeyOrder, nested: NestedWriters = NONE): Writer {
  return (value: unknown): unknown => (isRecord(value) ? writeObject(value, order, nested) : value);
}

function listWriter(writeItem: Writer): Writer {
  return (value: unknown): unknown => (Array.isArray(value) ? value.map((item: unknown) => writeItem(item)) : value);
}

function writeBlock(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (value.type === 'opaque' && isRecord(value.raw)) return value.raw;
  return writeObject(value, blockKeys(typeof value.type === 'string' ? value.type : ''), BLOCK_NESTED);
}

const BLOCK_NESTED: NestedWriters = new Map([
  ['showWhen', objectWriter(CONDITION_KEYS)],
  ['columns', listWriter(objectWriter(SCORE_COLUMN_KEYS))],
  ['blocks', listWriter(writeBlock)],
]);

const writeEntryShape = objectWriter(ENTRY_SHAPE_KEYS, new Map([['extras', listWriter(objectWriter(ENTRY_EXTRA_KEYS))]]));

/** A record written with its keys in order, so the same settings always write the same file. */
function writeSortedRecord(value: unknown): unknown {
  return isRecord(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, value[key]])) : value;
}

const TEMPLATE_NESTED: NestedWriters = new Map([
  ['derivedFrom', objectWriter(DERIVED_FROM_KEYS)],
  ['source', objectWriter(SOURCE_KEYS)],
  ['importedFrom', objectWriter(IMPORTED_FROM_KEYS)],
  ['fields', listWriter(objectWriter(FIELD_KEYS, new Map([['entry', writeEntryShape]])))],
  ['header', objectWriter(HEADER_KEYS, new Map([['hitPoints', objectWriter(HEADER_TRACK_KEYS)]]))],
  ['layout', objectWriter(LAYOUT_KEYS, new Map([['blocks', listWriter(writeBlock)]]))],
  ['players', writeSortedRecord],
]);

/** The template as the plain JSON object its file holds. */
export function templateToJson(template: StatblockTemplate): Record<string, unknown> {
  return writeObject(template, TEMPLATE_KEYS, TEMPLATE_NESTED);
}

/** The template's file text. */
export function serializeTemplate(template: StatblockTemplate): string {
  return `${JSON.stringify(templateToJson(template), null, 2)}\n`;
}
