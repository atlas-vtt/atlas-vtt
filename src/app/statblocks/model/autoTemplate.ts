import { createBlock } from './blockCatalogue';
import { labelFromKey } from './fieldKeys';
import { isReservedKey } from './reservedKeys';
import type { BlockIdSource } from './templateIds';
import {
  TEMPLATE_FORMAT, TEMPLATE_VERSION,
  type FieldKey, type FieldMeaning, type HeaderPartId, type StatblockTemplate, type TemplateBlock, type TemplateField,
} from './templateTypes';

export const AUTO_TEMPLATE_ID = 'auto';

const MAX_DEPTH = 32;
const NUMBER_TEXT = /^[+\-\u2212]?\d+(?:\.\d+)?$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

/** Missing, blank, or a list or record holding only such values; 0 and false are values. */
function isEmpty(value: unknown, depth = 0): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return Number.isNaN(value);
  if (depth >= MAX_DEPTH) return false;
  if (Array.isArray(value)) return value.every((item) => isEmpty(item, depth + 1));
  if (isRecord(value)) return Object.values(value).every((item) => isEmpty(item, depth + 1));
  return false;
}

const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isNumberLike = (value: unknown): boolean => isNumber(value) || (typeof value === 'string' && NUMBER_TEXT.test(value.trim()));

/** The one value of a record with exactly one key, else undefined. */
function soleValue(value: unknown): unknown {
  if (!isRecord(value)) return undefined;
  const values = Object.values(value);
  return values.length === 1 ? values[0] : undefined;
}

function isEntry(value: unknown): boolean {
  return isRecord(value) && 'name' in value && ('desc' in value || 'text' in value);
}

function isPairs(value: unknown): boolean {
  if (isRecord(value)) return Object.values(value).every(isNumberLike);
  return Array.isArray(value) && value.every((item) => isNumberLike(soleValue(item)));
}

/** FS's spell shape: lines of text and `{ level: spells }` records, at least one of the latter. */
function isSpells(items: readonly unknown[]): boolean {
  return items.some(isRecord)
    && items.every((item) => typeof item === 'string' || typeof soleValue(item) === 'string');
}

type Shown = Pick<TemplateField, 'type' | 'entry'>;

/** The field type a value's shape suggests, or null for a shape no block shows. */
function shapeOf(value: unknown): Shown | null {
  if (typeof value === 'string') return { type: value.includes('\n') ? 'markdown' : 'text' };
  if (isNumber(value)) return { type: 'number' };
  if (isRecord(value)) return isPairs(value) ? { type: 'pairs' } : null;
  if (!Array.isArray(value)) return null;
  if (value.every(isNumber)) return { type: 'scores' };
  if (value.every((item) => typeof item === 'string')) return { type: 'list' };
  if (value.every(isEntry)) {
    const usesText = value.some((item) => isRecord(item) && 'text' in item && !('desc' in item));
    return usesText ? { type: 'entries', entry: { textKey: 'text' } } : { type: 'entries' };
  }
  if (isPairs(value)) return { type: 'pairs' };
  return isSpells(value) ? { type: 'spells' } : null;
}

function fieldFor(key: FieldKey, value: unknown, shown: Shown): TemplateField {
  const field: TemplateField = { key, label: labelFromKey(key), type: shown.type };
  if (shown.entry) field.entry = shown.entry;
  if (shown.type === 'scores' && Array.isArray(value)) field.slots = value.map((_, index) => String(index + 1));
  return field;
}

/** The block the auto template shows a field with: a heading over entries and spells, labelled lines for the rest. */
export function blockFor(field: TemplateField, nextId: BlockIdSource): TemplateBlock {
  switch (field.type) {
    case 'markdown': return createBlock('text', nextId, field.key);
    case 'scores': return createBlock('scores', nextId, field.key);
    case 'entries': return { ...createBlock('entries', nextId, field.key), heading: field.label };
    case 'pairs': return createBlock('pairs', nextId, field.key);
    case 'list': return createBlock('tags', nextId, field.key);
    case 'spells': return { ...createBlock('spells', nextId, field.key), heading: field.label };
    default: return createBlock('stat', nextId, field.key);
  }
}

/** Ids the same for the same record, so a re-render keeps selection and keys: "auto0000", "auto0001", … */
function sequentialIds(): BlockIdSource {
  let next = 0;
  return () => `auto${(next++).toString(36).padStart(4, '0')}`;
}

function isShownText(record: Readonly<Record<string, unknown>>, key: FieldKey, ignored: ReadonlySet<string>): boolean {
  const value = record[key];
  return !ignored.has(key) && typeof value === 'string' && value.trim() !== '';
}

/** The header's parts besides the name and the art, each with the keys a record keeps it under, first found first. */
const HEADER_VALUES: ReadonlyArray<{ part: HeaderPartId; keys: readonly FieldKey[]; meaning: FieldMeaning }> = [
  { part: 'level', keys: ['level', 'cr'], meaning: 'rating' },
  { part: 'type', keys: ['type'], meaning: 'creature-type' },
  { part: 'hp', keys: ['hp'], meaning: 'hit-points' },
  { part: 'description', keys: ['description'], meaning: 'description' },
];

/** A header part's field: the first of its keys the record holds a value of, carrying the part's meaning. */
function headerField(record: Readonly<Record<string, unknown>>, keys: readonly FieldKey[], meaning: FieldMeaning, ignored: ReadonlySet<string>): TemplateField | null {
  for (const key of keys) {
    const value = record[key];
    const shown = ignored.has(key) || isEmpty(value) ? null : shapeOf(value);
    if (shown && !Array.isArray(value) && shown.type !== 'pairs') return { ...fieldFor(key, value, shown), meaning };
  }
  return null;
}

/**
 * A template for a record no template describes (§6.7): the header shows the
 * `name`, the `image`, the level (`level`, else `cr`), the `type`, the `hp`
 * and the `description` the record holds, and hides the parts it holds none
 * of; then one block per other field by the shape of its value, in the
 * record's order. Reserved keys, `ignored` keys, empty values and shapes no
 * block shows (true/false, nested records) are left out. It is never shaped
 * like a game system.
 */
export function autoTemplate(record: Readonly<Record<string, unknown>>, ignored: ReadonlySet<string> = new Set()): StatblockTemplate {
  const nextId = sequentialIds();
  const fields: TemplateField[] = [];
  if (isShownText(record, 'name', ignored)) fields.push({ key: 'name', label: labelFromKey('name'), type: 'text' });
  if (isShownText(record, 'image', ignored)) fields.push({ key: 'image', label: labelFromKey('image'), type: 'image' });
  const hidden: HeaderPartId[] = [];
  for (const { part, keys, meaning } of HEADER_VALUES) {
    const field = headerField(record, keys, meaning, ignored);
    if (field) fields.push(field);
    else hidden.push(part);
  }
  const inHeader = new Set(fields.map((field) => field.key));
  const blocks: TemplateBlock[] = [];
  for (const [key, value] of Object.entries(record)) {
    if (inHeader.has(key) || key === 'name' || key === 'image' || isReservedKey(key) || ignored.has(key) || isEmpty(value)) continue;
    const shown = shapeOf(value);
    if (!shown) continue;
    const field = fieldFor(key, value, shown);
    fields.push(field);
    blocks.push(blockFor(field, nextId));
  }
  return {
    format: TEMPLATE_FORMAT,
    version: TEMPLATE_VERSION,
    id: AUTO_TEMPLATE_ID,
    fields,
    ...(hidden.length > 0 && { header: { hidden } }),
    layout: { maxColumns: 2, blocks },
  };
}
