import { canContain } from './blockCatalogue';
import type { BlockIdSource } from './templateIds';
import { done, parentTypeOf, refuse, spliced, withChildren, type TreeEdit, type TreeRefusal } from './treeEdit';
import { moveBlock } from './treeOps';
import { collectBlockIds, findBlock, type FoundBlock } from './treeQueries';
import { isContainerBlock, type ContainerBlock, type TemplateLayout } from './templateTypes';

interface SiblingRun {
  parentId: string | null;
  start: number;
  found: FoundBlock[];
}

/** The blocks `ids` name, when they are siblings standing next to each other, in their order. */
function siblingRun(layout: TemplateLayout, ids: readonly string[]): SiblingRun | TreeRefusal {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return 'nothing-selected';
  const found: FoundBlock[] = [];
  for (const id of unique) {
    const block = findBlock(layout.blocks, id);
    if (!block) return 'block-not-found';
    found.push(block);
  }
  const parentId = found[0]?.parentId ?? null;
  if (found.some((block) => block.parentId !== parentId)) return 'not-siblings';
  found.sort((a, b) => a.index - b.index);
  const start = found[0]?.index ?? 0;
  if (found.some((block, offset) => block.index !== start + offset)) return 'not-adjacent';
  return { parentId, start, found };
}

function wrap(layout: TemplateLayout, ids: readonly string[], container: ContainerBlock): TreeEdit {
  const run = siblingRun(layout, ids);
  if (typeof run === 'string') return refuse(layout, run);
  if (collectBlockIds(layout.blocks).has(container.id)) return refuse(layout, 'duplicate-id');
  const parentType = parentTypeOf(layout, run.parentId);
  const blocks = run.found.map((entry) => entry.block);
  if (parentType === null || !canContain(parentType, container.type)) return refuse(layout, 'not-allowed-here');
  if (blocks.some((block) => !canContain(container.type, block.type))) return refuse(layout, 'not-allowed-here');
  const wrapped: ContainerBlock = { ...container, blocks };
  const next = withChildren(layout, run.parentId, (children) => spliced(children, run.start, blocks.length, wrapped));
  return done(next, wrapped.id);
}

/**
 * Wraps sibling blocks that stand next to each other (in any order of `ids`)
 * into a new Section in their place; `unwrap` undoes it.
 */
export function wrapInSection(layout: TemplateLayout, ids: readonly string[], nextId: BlockIdSource): TreeEdit {
  return wrap(layout, ids, { id: nextId(), type: 'section', blocks: [] });
}

/**
 * Wraps sibling blocks that stand next to each other into a new Row in their
 * place. Refused for a Row among them or inside a Row, which already sets
 * blocks side by side.
 */
export function putSideBySide(layout: TemplateLayout, ids: readonly string[], nextId: BlockIdSource): TreeEdit {
  return wrap(layout, ids, { id: nextId(), type: 'row', blocks: [] });
}

/**
 * Moves block `id` next to block `targetId` (before it at `start`, after it at
 * `end`) and sets the two side by side in a new Row in the target's place: a
 * drop beside a block. All or nothing.
 */
export function placeBeside(layout: TemplateLayout, id: string, targetId: string, side: 'start' | 'end', nextId: BlockIdSource): TreeEdit {
  const moving = findBlock(layout.blocks, id);
  const target = findBlock(layout.blocks, targetId);
  if (!moving || !target) return refuse(layout, 'block-not-found');
  if (id === targetId) return refuse(layout, 'inside-itself');
  const leaves = moving.parentId === target.parentId && moving.index < target.index;
  const index = (leaves ? target.index - 1 : target.index) + (side === 'end' ? 1 : 0);
  const moved = moveBlock(layout, id, { parentId: target.parentId, index });
  if (!moved.ok) return refuse(layout, moved.reason);
  const paired = putSideBySide(moved.layout, [targetId, id], nextId);
  return paired.ok ? paired : refuse(layout, paired.reason);
}

/**
 * Replaces a Section or Row by its children, in its place; a container's own
 * settings (heading, alignment) go with it. Refused where a child would land
 * in a parent that does not take it (a Row out of a Section inside a Row).
 */
export function unwrap(layout: TemplateLayout, id: string): TreeEdit {
  const found = findBlock(layout.blocks, id);
  if (!found) return refuse(layout, 'block-not-found');
  if (!isContainerBlock(found.block)) return refuse(layout, 'not-a-container');
  const parentType = parentTypeOf(layout, found.parentId);
  const children = found.block.blocks;
  if (parentType === null || children.some((child) => !canContain(parentType, child.type))) {
    return refuse(layout, 'not-allowed-here');
  }
  const next = withChildren(layout, found.parentId, (list) => spliced(list, found.index, 1, ...children));
  return done(next, children[0]?.id ?? null);
}
