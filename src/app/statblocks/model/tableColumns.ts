/**
 * A Table block's starting table in the template: the grid every statblock
 * starts with, read from and written into the property it shows (`slots`,
 * `slotKeys`, `align`, `rows`). Pure; a write that changes nothing returns
 * the very template, so a session records no step for it.
 *
 * Notes are never rewritten here, as nowhere in the template editor: a
 * statblock keeps its values as it wrote them. Cells are read by place
 * (`tableValues`), so a column renamed in the template is renamed in every
 * statblock that does not name its own, and a column keeps its key when it is
 * renamed, so a value written by name (`{ str: 18 }`) still finds it.
 */

import { updateField, type FieldChanges } from './fieldOps';
import { fieldByKey } from './fieldKeys';
import { sameGrid, templateGrid, trimmedRow, type TableGrid } from './tableGrid';
import { findBlock } from './treeQueries';
import type { ScoresBlock, StatblockTemplate, TemplateField } from './templateTypes';

/**
 * The table a new Table tile starts with: three unnamed columns under the
 * header row over two empty rows, which statblocks may add rows and columns
 * to. Every part is written out, so it reads the same in any later Atlas.
 */
export function newTable(): Pick<TemplateField, 'slots' | 'rows'> {
  return { slots: ['', '', ''], rows: [[], []] };
}

export interface TableParts {
  block: ScoresBlock;
  field: TemplateField;
  /** The table every statblock starts with. */
  grid: TableGrid;
}

/** The Table `id` and the property it shows; undefined where it is none or shows no table property yet. */
export function tableParts(template: StatblockTemplate, id: string): TableParts | undefined {
  const block = findBlock(template.layout.blocks, id)?.block;
  if (block?.type !== 'scores') return undefined;
  const field = fieldByKey(template.fields, block.field);
  return field?.type === 'scores' ? { block, field, grid: templateGrid(field) } : undefined;
}

/** The `slotKeys` the columns write: none where every key is its name in lower case, else each up to the last that is not. */
function writtenKeys(names: readonly string[], keys: readonly string[]): string[] | undefined {
  const last = keys.findLastIndex((key, index) => key !== (names[index] ?? '').toLowerCase());
  return last < 0 ? undefined : keys.slice(0, last + 1);
}

/** What a field holds for `grid`: its columns' names, keys and alignments and its starting rows, each left out where it says nothing. */
function fieldOfGrid(grid: TableGrid): FieldChanges {
  const names = grid.columns.map((column) => column.name);
  // A column named for the first time takes its name's key; a renamed one keeps the key it had.
  const keys = grid.columns.map((column) => column.key || column.name.trim().toLowerCase());
  const aligns = grid.columns.map((column) => column.align);
  const lastAlign = aligns.findLastIndex((align) => align !== null);
  const rows = grid.rows.map(trimmedRow);
  const plain = rows.length === 1 && rows[0]?.length === 0;
  return {
    slots: names,
    slotKeys: writtenKeys(names, keys),
    align: lastAlign < 0 ? undefined : aligns.slice(0, lastAlign + 1),
    rows: plain ? undefined : rows,
  };
}

/** The template with the Table `id` starting as `grid`. */
export function withTemplateTable(template: StatblockTemplate, id: string, grid: TableGrid): StatblockTemplate {
  const parts = tableParts(template, id);
  if (!parts || sameGrid(parts.grid, grid)) return template;
  return updateField(template, parts.field.key, fieldOfGrid(grid));
}
