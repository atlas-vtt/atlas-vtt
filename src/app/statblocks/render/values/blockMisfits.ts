import { splitRef } from '../../values/fieldValues';
import { referenceMisfit, valueMisfit, type ValueMisfit } from '../../values/valueFit';
import type { FieldKey, TemplateBlock } from '../../model/templateTypes';
import { visibilityFields } from '../blockDisplay';
import type { SheetState } from '../sheetState';

export interface FieldMisfit extends ValueMisfit {
  key: FieldKey;
}

/**
 * The values a block shows that do not fit their fields' types, one per field
 * in the order the block names them: its bound fields and those its own
 * pattern reads ("stats.1" is the field `stats`). Its fallback's fields do not
 * count; they show only while the block's own are empty.
 */
export function blockMisfits(block: TemplateBlock, sheet: SheetState): FieldMisfit[] {
  const keys = new Set(visibilityFields(block).map((ref) => (sheet.fields.has(ref) ? ref : splitRef(ref).key)));
  return [...keys].flatMap((key) => {
    const field = sheet.fields.get(key);
    // The value as shown: references filled in, those that name nothing left as written
    const shown = field ? sheet.reader(field.key) : undefined;
    const misfit = field ? referenceMisfit(field, shown) ?? valueMisfit(field, shown) : null;
    return misfit ? [{ key, ...misfit }] : [];
  });
}
