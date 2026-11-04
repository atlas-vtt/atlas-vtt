import {
  AUTHORABLE_BLOCK_TYPES, canContain, createBlock, type AuthorableBlockType, type ParentType,
} from '../../../../src/app/statblocks/model/blockCatalogue';
import { blockIdSource, type BlockIdSource } from '../../../../src/app/statblocks/model/templateIds';
import {
  FIELD_TYPES, isContainerBlock, isContainerType, type ContainerType, type TemplateBlock, type TemplateField, type TemplateLayout,
} from '../../../../src/app/statblocks/model/templateTypes';

/** A seeded PRNG (mulberry32), so every failing case reproduces from its seed. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Random = () => number;

/** An integer in [min, max]. */
export function int(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}

export function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('pick from an empty list');
  return item;
}

export const LEAF_TYPES: readonly AuthorableBlockType[] = AUTHORABLE_BLOCK_TYPES.filter((type) => !isContainerType(type));

const CONTAINER_TYPES: readonly ContainerType[] = ['section', 'row', 'tabs'];

export const FIELD_KEYS = ['f0', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9'];

export function randomFields(random: Random): TemplateField[] {
  return FIELD_KEYS.map((key) => ({ key, label: key.toUpperCase(), type: pick(random, FIELD_TYPES) }));
}

export function randomLeaf(random: Random, nextId: BlockIdSource): TemplateBlock {
  const roll = random();
  if (roll < 0.05) return { id: nextId(), type: 'script', summary: 'HP track', fs: { type: 'javascript', code: 'return 1' } };
  if (roll < 0.1) return { id: nextId(), type: 'opaque', raw: { type: 'chart', bars: 3 } };
  const block = createBlock(pick(random, LEAF_TYPES), nextId, pick(random, FIELD_KEYS));
  return random() < 0.3 ? { ...block, className: 'tint' } : block;
}

interface Budget { left: number }

function randomList(random: Random, nextId: BlockIdSource, parent: ParentType, depth: number, budget: Budget): TemplateBlock[] {
  const blocks: TemplateBlock[] = [];
  const count = int(random, 0, depth === 0 ? 6 : 4);
  for (let i = 0; i < count && budget.left > 0; i++) {
    budget.left--;
    // Tabs hold Sections only.
    if (parent === 'tabs' || (depth < 4 && random() < 0.3)) {
      const type = pick(random, CONTAINER_TYPES.filter((each) => canContain(parent, each)));
      const container = createBlock(type, nextId);
      blocks.push({ ...container, blocks: randomList(random, nextId, type, depth + 1, budget) });
    } else {
      blocks.push(randomLeaf(random, nextId));
    }
  }
  return blocks;
}

/** A legal tree of at most `size` blocks, nested up to five levels. */
export function randomLayout(random: Random, size = 30): TemplateLayout {
  const nextId = blockIdSource([], random);
  return { maxColumns: 2, blocks: randomList(random, nextId, 'root', 0, { left: size }) };
}

/** A small legal subtree with ids from `nextId`. */
export function randomSubtree(random: Random, nextId: BlockIdSource): TemplateBlock {
  if (random() < 0.7) return randomLeaf(random, nextId);
  const type = pick(random, CONTAINER_TYPES);
  return { ...createBlock(type, nextId), blocks: randomList(random, nextId, type, 3, { left: 4 }) };
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Every container id, and null for the root. */
export function parentIds(layout: TemplateLayout): (string | null)[] {
  const ids: (string | null)[] = [null];
  const visit = (blocks: readonly TemplateBlock[]): void => {
    for (const block of blocks) {
      if (isContainerBlock(block)) {
        ids.push(block.id);
        visit(block.blocks);
      }
    }
  };
  visit(layout.blocks);
  return ids;
}

/** What is wrong with a tree: a cycle, a repeated id, or a child its parent does not take. */
export function treeProblems(layout: TemplateLayout): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  const onPath = new Set<object>();
  const visit = (blocks: readonly TemplateBlock[], parent: ParentType): void => {
    for (const block of blocks) {
      if (onPath.has(block)) { problems.push(`cycle at ${block.id}`); continue; }
      if (ids.has(block.id)) problems.push(`repeated id ${block.id}`);
      ids.add(block.id);
      if (!canContain(parent, block.type)) problems.push(`${block.type} ${block.id} inside ${parent}`);
      if (isContainerBlock(block)) {
        onPath.add(block);
        visit(block.blocks, block.type);
        onPath.delete(block);
      }
    }
  };
  visit(layout.blocks, 'root');
  return problems;
}

/** Every block that holds no children, by id. */
export function leavesById(layout: TemplateLayout): Map<string, TemplateBlock> {
  const leaves = new Map<string, TemplateBlock>();
  const visit = (blocks: readonly TemplateBlock[]): void => {
    for (const block of blocks) {
      if (isContainerBlock(block)) visit(block.blocks);
      else leaves.set(block.id, block);
    }
  };
  visit(layout.blocks);
  return leaves;
}

/** A source that gives the listed ids in turn. */
export function idsFrom(...ids: string[]): BlockIdSource {
  let next = 0;
  return () => {
    const id = ids[next++];
    if (id === undefined) throw new Error('out of ids');
    return id;
  };
}
