import { canContain, type ParentType } from './blockCatalogue';
import { findBlock } from './treeQueries';
import { isContainerBlock, type TemplateBlock, type TemplateLayout } from './templateTypes';

/** Where a block goes: into the root (`parentId: null`) or a container, at its final index there. */
export interface TreeTarget {
  parentId: string | null;
  index: number;
}

/** Why a tree operation left the layout as it was. */
export type TreeRefusal =
  | 'block-not-found'     // an id names no block
  | 'target-not-found'    // the target's parent names no block
  | 'not-a-container'     // the target's parent, or the block to unwrap, holds no children
  | 'not-allowed-here'    // the catalogue does not allow the block in that parent (a Row in a Row)
  | 'inside-itself'       // a block moved into itself or below itself
  | 'duplicate-id'        // an id that is already in the template
  | 'nothing-selected'
  | 'not-siblings'        // blocks to group do not share a parent
  | 'not-adjacent'        // blocks to group do not stand next to each other
  | 'cannot-turn-into'    // a container into a leaf, a leaf into a container, or into a script or unknown block
  | 'wrong-type'          // an update for another block type
  | 'header';             // a part of the header, which stays where Atlas draws it (`templateHeader`)

/**
 * What every tree operation returns. A refusal returns the very layout it was
 * given. `focus` is the block to select afterwards: the one inserted, moved,
 * copied, turned or updated, the new container, or an unwrapped container's
 * first child.
 */
export type TreeEdit =
  | { ok: true; layout: TemplateLayout; focus: string | null }
  | { ok: false; layout: TemplateLayout; reason: TreeRefusal };

export function refuse(layout: TemplateLayout, reason: TreeRefusal): TreeEdit {
  return { ok: false, layout, reason };
}

export function done(layout: TemplateLayout, focus: string | null): TreeEdit {
  return { ok: true, layout, focus };
}

/** The list a parent holds, or null when the parent is missing or no container. */
export function childrenOf(layout: TemplateLayout, parentId: string | null): readonly TemplateBlock[] | null {
  if (parentId === null) return layout.blocks;
  const found = findBlock(layout.blocks, parentId);
  return found && isContainerBlock(found.block) ? found.block.blocks : null;
}

/** The type of the block that holds a list, or 'root'; null when it holds none. */
export function parentTypeOf(layout: TemplateLayout, parentId: string | null): ParentType | null {
  if (parentId === null) return 'root';
  const found = findBlock(layout.blocks, parentId);
  return found && isContainerBlock(found.block) ? found.block.type : null;
}

type ListEdit = (children: TemplateBlock[]) => TemplateBlock[];

function editList(blocks: TemplateBlock[], parentId: string, edit: ListEdit): TemplateBlock[] {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (!block || !isContainerBlock(block)) continue;
    const children = block.id === parentId ? edit(block.blocks) : editList(block.blocks, parentId, edit);
    if (children === block.blocks) continue;
    const copy = blocks.slice();
    copy[index] = { ...block, blocks: children };
    return copy;
  }
  return blocks;
}

/**
 * The layout with one list replaced, copying only the containers on the way
 * to it; everything else is shared with the input.
 */
export function withChildren(layout: TemplateLayout, parentId: string | null, edit: ListEdit): TemplateLayout {
  const blocks = parentId === null ? edit(layout.blocks) : editList(layout.blocks, parentId, edit);
  return blocks === layout.blocks ? layout : { ...layout, blocks };
}

/** A copy of `list` with `items` in place of `count` items from `start`. */
export function spliced(list: readonly TemplateBlock[], start: number, count: number, ...items: TemplateBlock[]): TemplateBlock[] {
  const copy = list.slice();
  copy.splice(start, count, ...items);
  return copy;
}

/** A whole number in [0, length]. */
export function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return index > 0 ? length : 0;
  return Math.min(length, Math.max(0, Math.trunc(index)));
}

/** Whether every container in a subtree holds only what the catalogue allows. */
export function isLegalSubtree(block: TemplateBlock): boolean {
  if (!isContainerBlock(block)) return true;
  return block.blocks.every((child) => canContain(block.type, child.type) && isLegalSubtree(child));
}
