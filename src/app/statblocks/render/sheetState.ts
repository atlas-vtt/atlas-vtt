import type { PatternContext } from '../expressions/pattern';
import type { Lookups } from '../expressions/filters';
import { scriptReads, type ScriptRead } from '../model/scriptReads';
import { withHeaderFields } from '../model/templateHeader';
import type { FieldKey, FieldValue, StatblockTemplate, TemplateField } from '../model/templateTypes';
import { startCountersValue } from '../values/counterValues';
import { fieldLabels, readField, readerFor, type FieldRecord, type ValueReader } from '../values/fieldValues';
import { startTableValue } from '../values/tableValues';
import { withReferencesFilled } from '../values/fillReferences';
import { namedReferenceRolls } from '../values/referenceRolls';
import { statblockLookup } from '../values/statblockLookup';
import type { SheetMode, StatblockTokenContext } from './sheetTypes';
import type { ResourceDefinition } from '../../resources/resourceTypes';
import { trackedResources } from '../../resources/trackedResources';
import { trackedNumbers, type TrackedNumber } from '../values/trackedNumbers';

/** What deciding and writing a block's text needs; no React, no Obsidian. */
export interface SheetState {
  /** The note's fields as they are stored, a Table without a value holding its template's starting table. */
  record: FieldRecord;
  /** Reads the values as the card shows them: `@` references filled in (`withReferencesFilled`). */
  reader: ValueReader;
  fields: ReadonlyMap<FieldKey, TemplateField>;
  /** Lookup tables and field labels for patterns and formulas. */
  context: PatternContext;
  mode: SheetMode;
  /** The token the statblock is shown for: its art and resource values show in Image and Track blocks and tracked numbers. */
  token: StatblockTokenContext | undefined;
  /** The numbers the template tracks, by field key: they show the token's current value over the note's maximum. */
  tracked: ReadonlyMap<FieldKey, TrackedNumber>;
  /** Blocks folded into chips under the card (`foldRule.ts`): not drawn, and no value of theirs is edited. */
  folded: ReadonlySet<string>;
  /** The field a tile not named yet is drawn with, named after its kind (`provisionalSheet.ts`); never stored. */
  provisional?: TemplateField | undefined;
  /** For each script block, by id, the values it reads, each in its block, with the blocks that show it too (`scriptReads`). */
  scriptReads: ReadonlyMap<string, readonly ScriptRead[]>;
  /** What a roll link on a value rolls, to the same roll naming the `@` references it was filled in from (`namedReferenceRolls`). */
  namedRolls: ReadonlyMap<string, string>;
}

export interface SheetStateInput {
  template: StatblockTemplate;
  record: FieldRecord;
  /** Tables beside the template's own; one of the same name replaces the template's. */
  lookups?: Lookups | undefined;
  mode: SheetMode;
  token?: StatblockTokenContext | undefined;
  folded?: ReadonlySet<string> | undefined;
  /** The collection's resources, where known (else the token's): a number one of them reads is not tracked by the template. */
  resources?: readonly ResourceDefinition[] | undefined;
}

const NONE_FOLDED: ReadonlySet<string> = new Set();

/** What a field of a statblock that holds no value of it starts with: a Table's starting table, a Counters field's preset rows. */
function startValue(field: TemplateField): FieldValue | undefined {
  if (field.type === 'scores') return startTableValue(field);
  return field.type === 'counters' ? startCountersValue(field) : undefined;
}

/**
 * The record with every Table and Counters field that holds no value holding what its template starts it with, as
 * a new statblock shows it until its first edit writes its own. The same record where none is filled.
 */
function withStartingValues(record: FieldRecord, fields: readonly TemplateField[]): FieldRecord {
  const filled: [string, unknown][] = [];
  for (const field of fields) {
    const value = readField(record, field).value;
    if (value !== undefined && value !== null) continue;
    const start = startValue(field);
    if (start !== undefined) filled.push([field.key, start]);
  }
  return filled.length > 0 ? { ...record, ...Object.fromEntries(filled) } : record;
}

/** The numbers the template tracks, by field, without those a resource of `resources` is. */
function trackedByField(template: StatblockTemplate, resources: readonly ResourceDefinition[] | undefined): ReadonlyMap<FieldKey, TrackedNumber> {
  const numbers = resources ? trackedResources(template, resources).map((each) => each.tracked) : trackedNumbers(template);
  return new Map(numbers.map((number) => [number.field.key, number]));
}

export function sheetState({ template, record: stored, lookups, mode, token, folded, resources }: SheetStateInput): SheetState {
  // A template not read from a file (one being made, a test's) may lack a header part's field: the part still has its name and prompt.
  const { fields } = withHeaderFields(template);
  const record = withStartingValues(stored, fields);
  // What the card shows reads `@` references as the numbers they name; the record keeps what was written
  const lookup = statblockLookup(template, record, fields);
  const shown = withReferencesFilled(record, fields, lookup);
  return {
    record,
    reader: readerFor(shown, fields),
    fields: new Map(fields.map((field) => [field.key, field])),
    context: {
      lookups: { ...template.lookups, ...lookups },
      labelOf: fieldLabels(fields),
    },
    mode,
    token,
    tracked: trackedByField({ ...template, fields }, resources ?? token?.definitions),
    folded: folded ?? NONE_FOLDED,
    scriptReads: scriptReads(template),
    namedRolls: namedReferenceRolls(fields.map((field) => readField(record, field).value), lookup),
  };
}
