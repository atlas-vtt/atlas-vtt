/**
 * The template editor's selection (§7.6), as pure functions of the template:
 * one block (a part of the header, or a tile), or sibling tiles picked with
 * Shift+click. The last id is the primary one, which the block toolbar hangs
 * from and focus follows.
 */

import { selectableBlocks } from '../../model/templateGrid';
import { headerPartOf, isHeaderBlockId, templateBlock } from '../../model/templateHeader';
import { findBlock } from '../../model/treeQueries';
import type { StatblockTemplate, TemplateLayout } from '../../model/templateTypes';

export type BlockSelection = readonly string[];

export const NO_SELECTION: BlockSelection = [];

/** The block the toolbar, the label editor and the keys act on. */
export function primaryOf(selection: BlockSelection): string | null {
  return selection.at(-1) ?? null;
}

/** The ids that still name a block the card draws, in the order they were picked; the same array when all do. */
export function existingSelection(template: StatblockTemplate, selection: BlockSelection): BlockSelection {
  const kept = selection.filter((id) => templateBlock(template, id) !== null && !headerPartOf(template, id)?.hidden);
  return kept.length === selection.length ? selection : kept;
}

/**
 * Shift+click: adds a sibling of the selection, or takes a picked block out
 * again. A block of another parent starts a new selection, and a part of the
 * header is selected on its own.
 */
export function withSibling(layout: TemplateLayout, selection: BlockSelection, id: string): BlockSelection {
  if (selection.includes(id)) return selection.filter((picked) => picked !== id);
  if (isHeaderBlockId(id) || selection.some(isHeaderBlockId)) return [id];
  const target = findBlock(layout.blocks, id);
  const first = selection[0] === undefined ? null : findBlock(layout.blocks, selection[0]);
  if (!target) return selection;
  return first && first.parentId === target.parentId ? [...selection, id] : [id];
}

/** The selected blocks in the order they stand in their parent. */
export function inSiblingOrder(layout: TemplateLayout, selection: BlockSelection): string[] {
  return selection
    .map((id) => findBlock(layout.blocks, id))
    .filter((found) => found !== null)
    .sort((a, b) => a.index - b.index)
    .map((found) => found.block.id);
}

/**
 * The selectable block before or after the primary one in reading order
 * (`selectableBlocks`: the header's parts, then the tiles row by row),
 * skipping those the canvas does not draw. Without a selection, the first (or
 * last) drawn one.
 */
export function stepInReadingOrder(
  template: StatblockTemplate, primary: string | null, step: 1 | -1, drawn: (id: string) => boolean,
): string | null {
  const order = selectableBlocks(template).filter(drawn);
  if (order.length === 0) return null;
  if (primary === null) return step === 1 ? order[0] ?? null : order.at(-1) ?? null;
  const index = order.indexOf(primary);
  if (index < 0) return order[0] ?? null;
  return order[index + step] ?? null;
}

/**
 * Where focus goes once the selected tiles are deleted: the next selectable
 * one after them in reading order, else the one before them.
 */
export function focusAfterDelete(template: StatblockTemplate, selection: BlockSelection): string | null {
  const order = selectableBlocks(template);
  const removed = new Set(selection);
  const at = selection.map((id) => order.indexOf(id)).filter((index) => index >= 0);
  if (at.length === 0) return null;
  const after = order.slice(Math.max(...at) + 1).find((id) => !removed.has(id));
  return after ?? order.slice(0, Math.min(...at)).reverse().find((id) => !removed.has(id)) ?? null;
}
