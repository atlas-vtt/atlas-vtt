/**
 * What a statblock's `@` references read (`references.ts`): a field by its key or a key it had
 * before a rename (the note's value under either), a dotted index into it (`stats.0`, `saves.dex`), a Table's slot by its name or
 * key in any Table field (`@str`, `@strength`, `@stats.str`) with a worked-out row of the Table
 * after it (`@str.mod`, `@str.save`: the row's own entry for the slot, else its formula over the
 * score), else what the statblock's meanings and loose key matching find (`@hp`), else a field by its
 * label (`@str` for a field labelled "Str"; `fieldsByLabel`). Only a single value is read: a list or
 * a record is no number. Pure.
 */

import { matchingKey, normalizedKey, resolveField } from '../../resources/resourceFields';
import { evaluateFormula } from '../expressions/evaluate';
import { isExpressionError } from '../expressions/errors';
import { parseFormula } from '../expressions/parse';
import { meaningsOf, withFormerKeysAliased } from '../resolve/fieldMeanings';
import { headerParts } from '../model/templateHeader';
import type { FieldKey, FieldValue, ScoreColumn, StatblockTemplate, TemplateField } from '../model/templateTypes';
import { flattenReadingOrder } from '../model/treeQueries';
import { readerFor, scoreIn, slotKeyOf, type FieldRecord, type ValueReader } from './fieldValues';
import { pairValue } from './pairValues';
import { fillReferences, numberValue } from './fillReferences';
import { namesReference, type FieldLookup } from './references';

/** One slot of a Table field, and the worked-out rows of the Table that draws it. */
interface Slot {
  readonly field: TemplateField;
  readonly index: number;
  readonly columns: readonly ScoreColumn[];
}

/** How many references deep one value may name others. */
const MAX_CHAIN = 4;
/** How many values that name references one lookup works out at most. */
const MAX_EXPANSIONS = 256;
const NOTHING_READ: ReadonlySet<string> = new Set();
/** A trace's mark where a value naming references was left unread: too deep, in a circle, or over the lookup's budget. */
const CUT = '!';

const isSingle = (value: unknown): value is string | number | boolean => typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

/** A name as a label and a reference's part are compared by: lower case, letters and digits only. */
const plainName = (text: string): string => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * The fields a reference may also name by their label ("Str" for `strength`), keyed by the label in
 * lower case without spaces or punctuation: only a label one field alone holds, and that no field's
 * key, former key or Table slot is named by, so a label never stands for two fields nor for a name
 * the statblock reads already.
 */
export function fieldsByLabel(fields: readonly TemplateField[]): Map<string, TemplateField> {
  const claimed = new Set<string>();
  const labelled = new Map<string, TemplateField | null>();
  for (const field of fields) {
    for (const key of [field.key, ...(field.formerKeys ?? [])]) claimed.add(plainName(key));
    if (field.type === 'scores') {
      (field.slots ?? []).forEach((name, index) => {
        for (const each of [name, slotKeyOf(field, index)]) if (each !== undefined) claimed.add(plainName(each));
      });
    }
    const label = plainName(field.label);
    if (label !== '') labelled.set(label, labelled.has(label) ? null : field);
  }
  const fieldsOf = new Map<string, TemplateField>();
  for (const [label, field] of labelled) if (field !== null && !claimed.has(label)) fieldsOf.set(label, field);
  return fieldsOf;
}

/** The worked-out rows of the first Table block drawing each Table field. */
export function tableColumns(template: StatblockTemplate): Map<FieldKey, readonly ScoreColumn[]> {
  const columns = new Map<FieldKey, readonly ScoreColumn[]>();
  const blocks = [...headerParts(template).map((part) => part.block), ...flattenReadingOrder(template.layout.blocks)];
  for (const block of blocks) {
    if (block.type === 'scores' && !columns.has(block.field)) columns.set(block.field, block.columns ?? []);
  }
  return columns;
}

/** Every slot of every Table field by its name and key, without case or separators; the first Table to name one keeps it. */
function slotsByName(fields: readonly TemplateField[], columns: ReadonlyMap<FieldKey, readonly ScoreColumn[]>): Map<string, Slot> {
  const slots = new Map<string, Slot>();
  for (const field of fields) {
    if (field.type !== 'scores') continue;
    (field.slots ?? []).forEach((name, index) => {
      const slot = { field, index, columns: columns.get(field.key) ?? [] };
      for (const each of [name, slotKeyOf(field, index)]) {
        const key = each === undefined ? '' : normalizedKey(each);
        if (key !== '' && !slots.has(key)) slots.set(key, slot);
      }
    });
  }
  return slots;
}

/** A worked-out row's value for a slot: the row's entry in its pairs field, else its formula over the score. */
function columnValue(column: ScoreColumn, slot: Slot, score: FieldValue | undefined, reader: ValueReader): FieldValue | undefined {
  if (column.field) {
    const entry = pairValue(reader(column.field), slotKeyOf(slot.field, slot.index), slot.field.slots?.[slot.index]);
    if (entry !== undefined && entry !== null && entry !== '') return entry;
  }
  if (!column.formula?.trim() || score === undefined) return undefined;
  const node = parseFormula(column.formula);
  if (isExpressionError(node)) return undefined;
  const result = evaluateFormula(node, reader, { value: score });
  return result.ok ? result.value : undefined;
}

/**
 * What a lookup read to answer a path, in order: every path it asked the note for, with whether the
 * note held it (`str=`, `hidden?`), the key loose matching took (`~Max Stress`) and a mark where a
 * value naming references was left unread, the reads of the values the answer names included. Two
 * lookups that read the same answer the same field.
 */
export type LookupTrace = readonly string[];

/** What a traced lookup answers a path with: the value, what it read, and whether it left a value naming references unread. */
export interface TracedAnswer {
  readonly value: unknown;
  readonly trace: LookupTrace;
  /** A value the answer names was left unread (too deep, in a circle, over the budget): the answer may be cut short. */
  readonly exhausted: boolean;
}

/** A lookup that also says what it read (`LookupTrace`). */
export type TracedLookup = (path: string) => TracedAnswer;

/** The keys a trace read a value under, in order: each path the note held (`str=`) and each key loose matching took. */
export function keysRead(trace: LookupTrace): string[] {
  return trace.flatMap((read) => {
    if (read.startsWith('~')) return read.length > 1 ? [read.slice(1)] : [];
    return read.endsWith('=') ? [read.slice(0, -1)] : [];
  });
}

interface LookupOptions {
  /** Reads the references a value names, in place of the lookup itself. */
  readonly inner?: FieldLookup;
  /** Whether the lookup keeps its reads (`LookupTrace`). */
  readonly traced?: boolean;
}

interface BuiltLookup {
  readonly lookup: FieldLookup;
  /** The reads of the last path `lookup` was asked; empty unless traced. */
  readonly lastTrace: () => LookupTrace;
}

/** The statblock's value at a reference's path, as `references.ts` asks for it. */
export function statblockLookup(template: StatblockTemplate, record: FieldRecord, fields: readonly TemplateField[] = template.fields): FieldLookup {
  return buildLookup(template, record, fields, {}).lookup;
}

/**
 * The statblock's value at a reference's path, where the references a value names are read by
 * `inner` instead: a rest's formula names the note's fields as the GM wrote them, while what a
 * player wrote into a value reads only what `inner` (the values they may see) holds.
 */
export function statblockLookupWith(template: StatblockTemplate, record: FieldRecord, fields: readonly TemplateField[], inner: FieldLookup): FieldLookup {
  return buildLookup(template, record, fields, { inner }).lookup;
}

/**
 * `statblockLookup` with what each answer read (`LookupTrace`), to tell whether two lookups answer a
 * path from the same field. Its budget is shared by every path it is asked: build one per text checked.
 */
export function tracedStatblockLookup(template: StatblockTemplate, record: FieldRecord, fields: readonly TemplateField[] = template.fields): TracedLookup {
  const built = buildLookup(template, record, fields, { traced: true });
  return (path) => {
    const value = built.lookup(path);
    const trace = built.lastTrace();
    return { value, trace, exhausted: trace.includes(CUT) };
  };
}

function buildLookup(template: StatblockTemplate, record: FieldRecord, fields: readonly TemplateField[], options: LookupOptions): BuiltLookup {
  // What the path being worked out read so far; null while nothing is traced
  let trail: string[] | null = null;
  const plainReader = readerFor(record, fields);
  const reader: ValueReader = (ref) => {
    const value = plainReader(ref);
    trail?.push(`${ref}${value === undefined ? '?' : '='}`);
    return value;
  };
  const scoreFields = new Set(fields.filter((field) => field.type === 'scores').map((field) => field.key));
  let slots: Map<string, Slot> | null = null;
  let loose: { record: FieldRecord; meanings: ReturnType<typeof meaningsOf> } | null = null;

  const slotValue = (path: string): FieldValue | undefined => {
    const parts = path.split('.');
    // `stats.str.mod` names the field first
    const named = parts.length > 1 && scoreFields.has(parts[0]!) ? parts.slice(1) : parts;
    const [name, row, ...rest] = named;
    if (name === undefined || rest.length > 0) return undefined;
    slots ??= slotsByName(fields, tableColumns(template));
    const slot = slots.get(normalizedKey(name));
    if (!slot) return undefined;
    const score = scoreIn(reader(slot.field.key), slot.field, slot.index);
    if (row === undefined) return score;
    const column = slot.columns.find((each) => each.label !== undefined && normalizedKey(each.label) === normalizedKey(row));
    return column ? columnValue(column, slot, score, reader) : undefined;
  };

  // A reference written before its field was renamed reads the field under its new key
  const renamed = new Map(fields.flatMap((field) => (field.formerKeys ?? []).map((former): [string, FieldKey] => [former, field.key])));
  const current = (path: string): string => {
    const [first, ...rest] = path.split('.');
    const key = first === undefined ? undefined : renamed.get(first);
    return key === undefined ? path : [key, ...rest].join('.');
  };

  const readAt = (path: string): string | number | boolean | undefined => {
    const direct = reader(path);
    if (isSingle(direct)) return direct;
    const slot = slotValue(path);
    if (isSingle(slot)) return slot;
    loose ??= { record: withFormerKeysAliased(record, fields), meanings: meaningsOf(fields) };
    trail?.push(`~${matchingKey(loose.record, path.split('.')[0] ?? '', loose.meanings) ?? ''}`);
    const found = resolveField(loose.record, path, loose.meanings);
    return isSingle(found) ? found : undefined;
  };

  // A path whose first part is a field's label (`@str` for "Str") reads that field, once nothing else answers
  let labels: Map<string, TemplateField> | null = null;
  const read = (written: string): string | number | boolean | undefined => {
    const path = current(written);
    const found = readAt(path);
    if (found !== undefined) return found;
    const [first, ...rest] = path.split('.');
    labels ??= fieldsByLabel(fields);
    const field = first === undefined ? undefined : labels.get(plainName(first));
    return field === undefined ? undefined : readAt([field.key, ...rest].join('.'));
  };

  // A value that names references itself (`ac: 10 + @dex.mod`) reads as what it comes to, a few steps
  // deep and never in a circle. Each path is worked out once per lookup and the work is capped, so
  // a note whose values name each other many times over (one a player wrote online) costs little.
  const worked = new Map<string, unknown>();
  const workedTraces = new Map<string, LookupTrace>();
  let budget = MAX_EXPANSIONS;
  const expanded = (path: string, reading: ReadonlySet<string>): unknown => {
    const value = read(path);
    if (typeof value !== 'string' || !namesReference(value)) return value;
    if (reading.size >= MAX_CHAIN || reading.has(path) || budget <= 0) {
      trail?.push(CUT);
      return value;
    }
    budget -= 1;
    const inner = new Set(reading).add(path);
    const result = numberValue(fillReferences(value, options.inner ?? ((next) => chained(next, inner))).text);
    worked.set(path, result);
    return result;
  };
  const chained = (path: string, reading: ReadonlySet<string>): unknown => {
    const outer = trail;
    if (worked.has(path)) {
      outer?.push(...(workedTraces.get(path) ?? []));
      return worked.get(path);
    }
    if (outer === null) return expanded(path, reading);
    const own: string[] = [];
    trail = own;
    const result = expanded(path, reading);
    trail = outer;
    if (worked.has(path)) workedTraces.set(path, own);
    outer.push(...own);
    return result;
  };
  let last: LookupTrace = [];
  return {
    lookup: (path) => {
      if (options.traced !== true) return chained(path, NOTHING_READ);
      trail = [];
      const value = chained(path, NOTHING_READ);
      last = trail;
      trail = null;
      return value;
    },
    lastTrace: () => last,
  };
}
