import { MAX_FIELD_TEXT, sheetBase, type BookFieldMessage, type SheetRaw } from '../../protocol/index.ts';
import { fieldPatches } from '../../../statblocks/editor/statblock-pane/valuePatches';
import { fieldByKey } from '../../../statblocks/model/fieldKeys';
import { withHeaderFields } from '../../../statblocks/model/templateHeader';
import type { FieldValue, TemplateField } from '../../../statblocks/model/templateTypes';
import { picksChoice } from '../../../statblocks/values/choicePicks';
import { textProblem, valueMisfit } from '../../../statblocks/values/valueFit';
import { playerAccess } from './playerAccess.ts';
import {
  amongOptions, clears, editableTemplate, inOptionOrder, isDice, isLine, isPlainList, isScalar, sentFields, writtenValue, type CheckedEdit, type EditInputs,
} from './statblockChecks.ts';

/** The types of value a page changes; any other field is never changed from a page. */
const EDITED = new Set<TemplateField['type']>(['text', 'markdown', 'number', 'rating', 'dice', 'choice', 'list', 'scores', 'pairs']);

/** The types whose stored value a Table may show as rows of cells, and so the only ones a cell edit changes. */
const TABLED = new Set<TemplateField['type']>(['scores', 'pairs', 'list']);

const isNumber = (value: SheetRaw): value is number => typeof value === 'number';

/** A choice as a player picks it: one option (or their own words where it is open), several in the options' order, or picks with numbers as one line the field reads. */
function fitsChoice(field: TemplateField, value: SheetRaw): boolean {
  if (field.numbered === true) return isLine(value) && textProblem(field, value) === null;
  if (picksChoice(field)) return inOptionOrder(value, field.options ?? [], field.open === true);
  return amongOptions(value, field.options, field.open === true);
}

/** Whether a whole new value fits its field as a page writes it: of the field's kind, and within what a sheet holds. */
function fitsField(field: TemplateField, value: SheetRaw): boolean {
  switch (field.type) {
    case 'text': return isLine(value);
    case 'markdown': return typeof value === 'string' && [...value].length <= MAX_FIELD_TEXT;
    case 'number': return isNumber(value);
    case 'rating': return isNumber(value) || (isLine(value) && textProblem(field, value) === null);
    case 'dice': return isDice(value);
    case 'choice': return fitsChoice(field, value);
    case 'list': return isPlainList(value);
    case 'scores': case 'pairs': return typeof value === 'object' && value !== null && valueMisfit(field, value as FieldValue) === null;
    default: return false;
  }
}

/** A table with one cell set: a stored list of lists is its rows, a flat list one row; undefined for any other shape or a cell it does not have. */
function withCell(stored: FieldValue | undefined, [row, column]: readonly [number, number], value: SheetRaw): FieldValue[] | undefined {
  if (!Array.isArray(stored) || !(value === null || isNumber(value) || isLine(value))) return undefined;
  const set = (cells: readonly FieldValue[]): FieldValue[] | undefined => (column < cells.length && cells.every(isScalar) ? cells.map((cell, at) => (at === column ? value : cell)) : undefined);
  if (stored.every((cells) => Array.isArray(cells))) {
    const cells = stored[row];
    const next = Array.isArray(cells) ? set(cells) : undefined;
    return next === undefined ? undefined : stored.map((cells, at) => (at === row ? next : cells));
  }
  return row === 0 ? set(stored) : undefined;
}

/** The value a field holds once the edit is in (undefined: its key is deleted), or null where the edit does not fit it. */
function newValue(field: TemplateField, stored: FieldValue | undefined, message: BookFieldMessage): { readonly value: FieldValue | undefined } | null {
  if (message.cell !== undefined) {
    if (!TABLED.has(field.type)) return null;
    const value = withCell(stored, message.cell, message.value);
    // The whole new value is checked as any other: a cell may not make it something the field does not hold.
    return value === undefined || !fitsField(field, value) ? null : { value };
  }
  if (clears(message.value)) return { value: undefined };
  return fitsField(field, message.value) ? { value: message.value as FieldValue } : null;
}

/**
 * A player's new value of one field of their own character's statblock, checked: the statblock is
 * a native one whose template reads as it was written, the sheet last sent to them offered the
 * field for editing and the template still lets players change it, the base they name is the value
 * the note holds now (with what this GM side wrote and has not seen read back), and the value fits
 * the field. A value of null, '' or [] deletes the key; a cell changes one value of a table, whose
 * whole new value is written against the old. Null where anything of it is refused.
 */
export function checkFieldEdit(inputs: EditInputs, message: BookFieldMessage): CheckedEdit | null {
  const template = editableTemplate(inputs);
  if (template === null || inputs.sent === null || inputs.sent === undefined) return null;
  if (!sentFields(inputs.sent).some((field) => field.key === message.key) || playerAccess(template, message.key) !== 'edit') return null;
  const field = fieldByKey(withHeaderFields(template).fields, message.key);
  const read = field === undefined ? undefined : inputs.read(field);
  if (field === undefined || read === undefined || !EDITED.has(field.type)) return null;
  if (sheetBase(read.value) !== message.base) return null;
  const next = newValue(field, read.value, message);
  if (next === null) return null;
  return {
    patches: fieldPatches(field.key, read, next.value),
    written: [writtenValue(field.key, read, next.value)],
  };
}
