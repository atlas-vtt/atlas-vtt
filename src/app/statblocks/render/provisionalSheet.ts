/**
 * A tile just placed in the template editor shows no field until it is named.
 * While it is edited it is drawn as if it showed the field its name will make
 * (`newFieldFor`), named after its kind and under the empty key it holds, so a
 * Table shows its starting grid and a Value its label over its prompt before
 * a name is typed: naming changes its words, never its shape. The field lives
 * in the sheet state of that one block alone and is never stored.
 */

import { newFieldFor } from '../model/newFields';
import { kindName } from '../model/templateGrid';
import type { TemplateBlock } from '../model/templateTypes';
import { fieldLabels, readerFor } from '../values/fieldValues';
import { startTableValue } from '../values/tableValues';
import { isUnboundBlock } from './blockDisplay';
import type { SheetState } from './sheetState';

const drawn = new WeakMap<SheetState, WeakMap<TemplateBlock, SheetState | null>>();

function provisional(block: TemplateBlock, sheet: SheetState): SheetState | null {
  if (sheet.mode !== 'editing' || block.type === 'metric' || !isUnboundBlock(block)) return null;
  const field = newFieldFor(block, '', kindName(block));
  if (!field) return null;
  const start = startTableValue(field);
  const record = start === undefined ? sheet.record : { ...sheet.record, [field.key]: start };
  const fields = new Map(sheet.fields).set(field.key, field);
  const list = [...fields.values()];
  return {
    ...sheet,
    record,
    reader: readerFor(record, list),
    fields,
    context: { ...sheet.context, labelOf: fieldLabels(list) },
    provisional: field,
  };
}

/** The sheet state `block` is drawn with: the one given, or for a tile not named yet one holding its provisional field. */
export function provisionalSheet(block: TemplateBlock, sheet: SheetState): SheetState {
  let answers = drawn.get(sheet);
  if (!answers) {
    answers = new WeakMap();
    drawn.set(sheet, answers);
  }
  if (!answers.has(block)) answers.set(block, provisional(block, sheet));
  return answers.get(block) ?? sheet;
}
