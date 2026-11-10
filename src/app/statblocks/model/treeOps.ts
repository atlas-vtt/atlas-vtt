// Pure, immutable edits of a template's block tree (grouping in `treeGrouping`,
// type changes in `turnInto`). Inputs are never changed: an edit copies only the
// containers on the path to what it changes. Every operation returns a
// `TreeEdit`, and a refused one the very layout it was given.

import { canContain } from './blockCatalogue';
import type { BlockIdSource } from './templateIds';
import {
  childrenOf, clampIndex, done, isLegalSubtree, parentTypeOf, refuse, spliced, withChildren,
  type TreeEdit, type TreeRefusal, type TreeTarget,
} from './treeEdit';
import { collectBlockIds, findBlock, flattenReadingOrder, isWithin } from './treeQueries';
import { isContainerBlock, type BlockType, type TemplateBlock, type TemplateLayout } from './templateTypes';

/** Why `block` cannot go to `target`, or null when it can. */
function placementProblem(layout: TemplateLayout, block: TemplateBlock, target: TreeTarget): TreeRefusal | null {
  const parentType = parentTypeOf(layout, target.parentId);
  if (parentType === null) return findBlock(layout.blocks, target.parentId ?? '') ? 'not-a-container' : 'target-not-found';
  return canContain(parentType, block.type) ? null : 'not-allowed-here';
}

function hasRepeatedIds(blocks: readonly TemplateBlock[]): boolean {
  const all = flattenReadingOrder(blocks);
  return new Set(all.map((block) => block.id)).size !== all.length;
}

/** Puts a new block (with any children) at `target`. */
export function insertBlock(layout: TemplateLayout, block: TemplateBlock, target: TreeTarget): TreeEdit {
  const taken = collectBlockIds(layout.blocks);
  if (flattenReadingOrder([block]).some((inner) => taken.has(inner.id)) || hasRepeatedIds([block])) {
    return refuse(layout, 'duplicate-id');
  }
  const problem = placementProblem(layout, block, target);
  if (problem) return refuse(layout, problem);
  if (!isLegalSubtree(block)) return refuse(layout, 'not-allowed-here');
  const next = withChildren(layout, target.parentId, (children) =>
    spliced(children, clampIndex(target.index, children.length), 0, block));
  return done(next, block.id);
}

/** Takes a block out with everything inside it. */
export function removeBlock(layout: TemplateLayout, id: string): TreeEdit {
  const found = findBlock(layout.blocks, id);
  if (!found) return refuse(layout, 'block-not-found');
  return done(withChildren(layout, found.parentId, (children) => spliced(children, found.index, 1)), null);
}

/**
 * Moves a block to `target`, whose index is where the block ends up once it
 * has left its old place; moving it back to where `findBlock` found it undoes
 * the move. A block never goes into itself.
 */
export function moveBlock(layout: TemplateLayout, id: string, target: TreeTarget): TreeEdit {
  const found = findBlock(layout.blocks, id);
  if (!found) return refuse(layout, 'block-not-found');
  if (target.parentId !== null && isWithin(layout.blocks, id, target.parentId)) return refuse(layout, 'inside-itself');
  const problem = placementProblem(layout, found.block, target);
  if (problem) return refuse(layout, problem);
  const without = withChildren(layout, found.parentId, (children) => spliced(children, found.index, 1));
  const length = childrenOf(without, target.parentId)?.length ?? 0;
  const index = clampIndex(target.index, length);
  if (target.parentId === found.parentId && index === found.index) return done(layout, id);
  return done(withChildren(without, target.parentId, (children) => spliced(children, index, 0, found.block)), id);
}

/** A copy of a block and everything inside it, every one with a new id from `nextId`. */
export function reKeyed(block: TemplateBlock, nextId: BlockIdSource): TemplateBlock {
  const id = nextId();
  if (!isContainerBlock(block)) return { ...block, id };
  return { ...block, id, blocks: block.blocks.map((child) => reKeyed(child, nextId)) };
}

/** A copy of a block and everything inside it, with new ids from `nextId`, right after the original. */
export function duplicateBlock(layout: TemplateLayout, id: string, nextId: BlockIdSource): TreeEdit {
  const found = findBlock(layout.blocks, id);
  if (!found) return refuse(layout, 'block-not-found');
  const copy = reKeyed(found.block, nextId);
  const taken = collectBlockIds(layout.blocks);
  if (flattenReadingOrder([copy]).some((inner) => taken.has(inner.id)) || hasRepeatedIds([copy])) {
    return refuse(layout, 'duplicate-id');
  }
  const next = withChildren(layout, found.parentId, (children) => spliced(children, found.index + 1, 0, copy));
  return done(next, copy.id);
}

type BlockOf<T extends BlockType> = Extract<TemplateBlock, { type: T }>;
type BlockProps<T extends BlockType> = Omit<BlockOf<T>, 'id' | 'type' | 'blocks'>;
type OptionalKeys<O> = { [K in keyof O]-?: Record<never, never> extends Pick<O, K> ? K : never }[keyof O];

/**
 * Changes to a block of type `T`. An optional key given as `undefined` is
 * removed; required keys can only be replaced. Children change only through
 * the tree operations.
 */
export type BlockChanges<T extends BlockType> = {
  [K in keyof BlockProps<T>]?: K extends OptionalKeys<BlockProps<T>> ? BlockProps<T>[K] | undefined : BlockProps<T>[K];
};

/**
 * Applies `changes` to the block `id`, which must be of `type` (the inspector
 * knows it); changing the type is `turnInto`. Changes that change nothing
 * return the layout as it was, so they make no undo step.
 */
export function updateBlock<T extends BlockType>(
  layout: TemplateLayout, id: string, type: T, changes: BlockChanges<T>,
): TreeEdit {
  const found = findBlock(layout.blocks, id);
  if (!found) return refuse(layout, 'block-not-found');
  if (found.block.type !== type) return refuse(layout, 'wrong-type');
  const updated: Record<string, unknown> = { ...found.block };
  let changed = false;
  for (const [key, value] of Object.entries(changes)) {
    if (key === 'id' || key === 'type' || key === 'blocks') continue;
    if (value === undefined && !Object.hasOwn(updated, key)) continue;
    if (value !== undefined && updated[key] === value) continue;
    changed = true;
    if (value === undefined) delete updated[key];
    else updated[key] = value;
  }
  if (!changed) return done(layout, id);
  const block = updated as unknown as TemplateBlock;
  return done(withChildren(layout, found.parentId, (children) => spliced(children, found.index, 1, block)), id);
}
