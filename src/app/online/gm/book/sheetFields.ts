import {
  bookLine, MAX_BOOK_TITLE, MAX_SHEET_OPTIONS, parseSheetField, parseSheetRaw, sheetBase, type SheetField, type SheetFieldType, type SheetRaw,
} from '../../protocol/index.ts';
import type { ResourceDefinition, ResourceValue } from '../../../resources/resourceTypes';
import type { SheetState } from '../../../statblocks/render/sheetState';
import type { FieldKey, StatblockTemplate, TemplateBlock, TemplateField } from '../../../statblocks/model/templateTypes';
import { readField, type FieldRecord } from '../../../statblocks/values/fieldValues';
import { clippedLine } from './bookTexts.ts';
import { blockAccess, playerAccess } from './playerAccess.ts';
import type { SheetBudget } from './sheetBudget.ts';
import { jsonBytes } from './sheetBudget.ts';
import type { SheetTexts } from './sheetTexts.ts';

/** What drawing one statblock for its player needs, shared by every part of the drawing. */
export interface SheetBuild {
  readonly template: StatblockTemplate;
  /** The note's values as stored: what conditions are decided by and bases are taken of. */
  readonly record: FieldRecord;
  /** The sheet with every value the player may not see taken out, as a reading view shows it: what texts are written from. */
  readonly shown: SheetState;
  /** The same sheet as the note's panel shows it while filled in: what an empty value's prompt is read from. */
  readonly editing: SheetState;
  /** Whether the player may change anything of it (a template read as it was written). */
  readonly editable: boolean;
  readonly definitions: readonly ResourceDefinition[];
  readonly resources: Readonly<Record<string, ResourceValue>>;
  readonly budget: SheetBudget;
  readonly texts: SheetTexts;
  /** Whether a block's condition holds for the note's values; a condition may read what the player never sees, and only its outcome shows. */
  readonly holds: (block: TemplateBlock) => boolean;
}

/** The types a value a player may change has on their page; lists of abilities, pictures and spells have none. */
const FIELD_TYPES: Readonly<Partial<Record<TemplateField['type'], SheetFieldType>>> = {
  text: 'text', markdown: 'markdown', number: 'number', rating: 'rating', dice: 'dice', choice: 'choice', list: 'list', scores: 'scores', pairs: 'pairs',
};

/** The most bytes a value may take for a player to change it: their edit sends it back whole, within one player frame. */
const MAX_EDITED_BYTES = 3 * 1024;

/** A choice's options as a page takes them, or null where one is longer than a line or they are more than it holds: the player would pick what the note does not offer. */
function sheetOptions(options: readonly string[] | undefined): string[] | null | undefined {
  if (options === undefined) return undefined;
  if (options.length > MAX_SHEET_OPTIONS) return null;
  const lines = options.map((option) => bookLine(option, MAX_BOOK_TITLE));
  return lines.every((line, index): line is string => line !== null && line === options[index]?.trim()) ? lines : null;
}

/**
 * What a player may change of a field, or null where they may not: the template lets them
 * (`playerAccess`), the statblock may be changed at all, the field has a type a page edits, and its
 * value is small enough to come back in one edit. `base` names the value the note holds now, as the
 * GM's Atlas names it (`sheetBase`), so an edit made against an older value is refused.
 */
export function sheetFieldOf(build: SheetBuild, key: FieldKey, block?: TemplateBlock): SheetField | null {
  if (!build.editable || playerAccess(build.template, key) !== 'edit' || (block && blockAccess(build.template, block) !== 'edit')) return null;
  const field = build.shown.fields.get(key);
  const type = field ? FIELD_TYPES[field.type] : undefined;
  if (!field || !type) return null;
  const stored = readField(build.record, field).value;
  const value: SheetRaw | undefined = stored === undefined ? null : parseSheetRaw(stored);
  const options = sheetOptions(field.options);
  if (value === undefined || options === null || jsonBytes(value) > MAX_EDITED_BYTES) return null;
  const unit = clippedLine(field.unit, MAX_BOOK_TITLE);
  // The parser is the page's: a field it would refuse is offered as a value to read.
  return parseSheetField({
    key: field.key, base: sheetBase(stored), type, value,
    ...(options !== undefined && { options }),
    ...(field.open === true && { open: true }),
    ...(field.several === true && { several: true }),
    ...(field.numbered === true && { numbered: true }),
    ...(unit !== null && { unit }),
  }) ?? null;
}
