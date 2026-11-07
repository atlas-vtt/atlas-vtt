import { isReferenceKey, isReferenceNumber, MAX_SHEET_LIST, MAX_SHEET_REFERENCES, referenceKey, type SheetReferences } from '../../protocol/index.ts';
import { HIT_POINT_KEYS } from '../../../resources/resourceFields';
import type { StatblockTemplate, TemplateField } from '../../../statblocks/model/templateTypes';
import { readerFor, slotKeyOf, type FieldRecord } from '../../../statblocks/values/fieldValues';
import { parseNumberText } from '../../../statblocks/values/numberText';
import { fieldsByLabel, statblockLookup, tableColumns } from '../../../statblocks/values/statblockLookup';

/** The number a reference reads, as the card fills it in: a number, or text that writes one. */
function numberOf(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  return typeof value === 'string' ? parseNumberText(value) : null;
}

/** The paths of a field's own value and of what it holds one step in (`stats.0`, `saves.dex`), under each of `names`. */
function fieldPaths(names: readonly string[], value: unknown): string[] {
  const inside = Array.isArray(value) ? value.slice(0, MAX_SHEET_LIST).map((_, index) => String(index))
    : value !== null && typeof value === 'object' ? Object.keys(value).slice(0, MAX_SHEET_LIST) : [];
  return names.flatMap((name) => [name, ...inside.map((part) => `${name}.${part}`)]);
}

/** The paths of every slot of a Table field, by name and key, alone and after each of `names`, each with every worked-out row. */
function slotPaths(field: TemplateField, names: readonly string[], rows: readonly string[]): string[] {
  return (field.slots ?? []).flatMap((name, index) => [name, slotKeyOf(field, index)].flatMap((slot) => {
    if (slot === undefined || slot === '') return [];
    return [slot, ...names.map((each) => `${each}.${slot}`)].flatMap((path) => [path, ...rows.map((row) => `${path}.${row}`)]);
  }));
}

/**
 * The numbers a player's `@` references read on their character's sheet (`BookStatblock.references`),
 * worked out by the card's own lookup (`statblockLookup`) over `shown`, the values the player may see
 * (`shownRecord`): each field by its key and the keys it had, what it holds one step in, every Table
 * slot by name and key with each worked-out row, hit points by their usual names, and each field again
 * by its label (`fieldsByLabel`), last, so the cap cuts those first. A reference to
 * a hidden field reads nothing here, as it reads nothing on the card the player is sent. Undefined
 * where none names a number.
 */
export function sheetReferences(template: StatblockTemplate, shown: FieldRecord, fields: readonly TemplateField[]): SheetReferences | undefined {
  const lookup = statblockLookup(template, shown, fields);
  const reader = readerFor(shown, fields);
  const columns = tableColumns(template);
  const rowsOf = (field: TemplateField): string[] => (columns.get(field.key) ?? []).flatMap((column) => column.label ?? []);
  const paths = [
    ...fields.flatMap((field) => fieldPaths([field.key, ...(field.formerKeys ?? [])], reader(field.key))),
    ...fields.filter((field) => field.type === 'scores').flatMap((field) => slotPaths(field, [field.key], rowsOf(field))),
    ...HIT_POINT_KEYS,
    ...[...fieldsByLabel(fields)].flatMap(([label, field]) => [
      ...fieldPaths([label], reader(field.key)),
      ...(field.type === 'scores' ? slotPaths(field, [label], rowsOf(field)) : []),
    ]),
  ];
  const references: Record<string, number> = {};
  let count = 0;
  for (const path of paths) {
    const key = referenceKey(path);
    if (count >= MAX_SHEET_REFERENCES) break;
    if (!isReferenceKey(key) || Object.hasOwn(references, key)) continue;
    const number = numberOf(lookup(path));
    if (number === null || !isReferenceNumber(number)) continue;
    references[key] = number;
    count += 1;
  }
  return count === 0 ? undefined : references;
}
