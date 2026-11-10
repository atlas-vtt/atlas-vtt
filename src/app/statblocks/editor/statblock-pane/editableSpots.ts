/**
 * Where the pane edits each value: the fields a shown block holds, and the
 * order Tab walks them in (the template's field order, empty fields included,
 * §7.6). Pure: a template and the card's state in, spots out.
 */

import { writtenFields } from '../../expressions/patternFields';
import {
  isContainerBlock, type FieldKey, type FieldType, type StatblockTemplate, type TemplateBlock, type TemplateField,
} from '../../model/templateTypes';
import { shownHeaderParts } from '../../model/templateHeader';
import { blockDisplay } from '../../render/blockDisplay';
import type { SheetState } from '../../render/sheetState';
import { shownTable } from '../../render/values/shownTable';

/** Types the pane edits in place; a Table cell by cell, pairs and the rest as text. */
const EDITABLE_TYPES: ReadonlySet<FieldType> = new Set<FieldType>([
  'text', 'markdown', 'number', 'rating', 'dice', 'choice', 'list', 'scores', 'entries', 'pairs', 'image', 'spells',
]);

/** One value the pane can edit: a field, in the block whose values show it. */
export interface EditSpot {
  field: TemplateField;
  blockId: string;
}

export interface EditableSpots {
  /** Per shown block, the fields edited in its place, in the order the block names them. */
  byBlock: ReadonlyMap<string, readonly TemplateField[]>;
  /** The Tables whose grid shows, which are typed cell by cell, in their own cells (`editor/table/`). */
  tables: ReadonlySet<string>;
  /** Every editable field once, in the template's field order, in the first block that shows it. */
  order: readonly EditSpot[];
}

function blockKeys(block: TemplateBlock): FieldKey[] {
  switch (block.type) {
    // A pattern says what shows: where it works its value out (XP from a challenge rating), nothing is typed there.
    case 'title': case 'stat': return block.pattern ? writtenFields(block.pattern) : [block.field];
    case 'line': return block.pattern ? writtenFields(block.pattern) : [...block.fields];
    // Each number of a Metric is filled in on its own, in its own place (`ValueSlot`'s `field`).
    case 'metric': return block.fields.filter((key) => key !== '');
    case 'text': return block.field ? [block.field] : [];
    case 'scores': case 'tags': case 'entries': case 'pairs': case 'track': case 'image': case 'spells':
      return [block.field];
    default: return [];
  }
}

/** The template's fields a block edits in its place. */
export function editableFields(block: TemplateBlock, fields: ReadonlyMap<FieldKey, TemplateField>): TemplateField[] {
  const found = [...new Set(blockKeys(block))].map((key) => fields.get(key));
  return found.filter((field): field is TemplateField => field !== undefined && EDITABLE_TYPES.has(field.type));
}

/** The editable spots of the card as it shows now, the header's first: hidden blocks (a false `showWhen`, a hidden part of the header) offer none. */
export function editableSpots(template: StatblockTemplate, sheet: SheetState): EditableSpots {
  const byBlock = new Map<string, TemplateField[]>();
  const tables = new Set<string>();
  const firstBlock = new Map<FieldKey, string>();
  const visit = (blocks: readonly TemplateBlock[]): void => {
    for (const block of blocks) {
      const display = blockDisplay(block, sheet);
      if (!display) continue;
      if (isContainerBlock(block)) {
        visit(block.blocks);
        continue;
      }
      // The token socket edits an Image block's art (token-socket/), never a text input.
      if (block.type === 'image') continue;
      const fields = editableFields(block, sheet.fields);
      if (!fields.length) continue;
      byBlock.set(block.id, fields);
      // A Table whose grid shows is typed cell by cell; one whose value holds no table is typed whole, as written.
      if (block.type === 'scores' && shownTable(block, display, sheet)) tables.add(block.id);
      for (const field of fields) if (!firstBlock.has(field.key)) firstBlock.set(field.key, block.id);
    }
  };
  visit(shownHeaderParts(template).map((part) => part.block));
  visit(template.layout.blocks);
  const order = template.fields.flatMap((field): EditSpot[] => {
    const blockId = firstBlock.get(field.key);
    return blockId ? [{ field, blockId }] : [];
  });
  return { byBlock, tables, order };
}

/** The spot `step` places after (1) or before (-1) the value being edited; null past either end. */
export function neighbourSpot(order: readonly EditSpot[], key: FieldKey, step: 1 | -1): EditSpot | null {
  const index = order.findIndex((spot) => spot.field.key === key);
  if (index < 0) return null;
  return order[index + step] ?? null;
}
