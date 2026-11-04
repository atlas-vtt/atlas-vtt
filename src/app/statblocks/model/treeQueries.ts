import { isContainerBlock, type FieldKey, type TemplateBlock, type TemplateLayout } from './templateTypes';

export interface FoundBlock {
  block: TemplateBlock;
  /** null at the root. */
  parentId: string | null;
  index: number;
  /** 0 at the root. */
  depth: number;
}

/** The field references of a pattern; `expressions/` supplies it. */
export type PatternRefs = (pattern: string) => readonly FieldKey[];

function search(blocks: readonly TemplateBlock[], id: string, parentId: string | null, depth: number): FoundBlock | null {
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (!block) continue;
    if (block.id === id) return { block, parentId, index, depth };
    if (isContainerBlock(block)) {
      const inner = search(block.blocks, id, block.id, depth + 1);
      if (inner) return inner;
    }
  }
  return null;
}

export function findBlock(blocks: readonly TemplateBlock[], id: string): FoundBlock | null {
  return search(blocks, id, null, 0);
}

/** Every block, each before its children: the order the canvas reads and the arrow keys walk. */
export function flattenReadingOrder(blocks: readonly TemplateBlock[]): TemplateBlock[] {
  const order: TemplateBlock[] = [];
  const visit = (list: readonly TemplateBlock[]): void => {
    for (const block of list) {
      order.push(block);
      if (isContainerBlock(block)) visit(block.blocks);
    }
  };
  visit(blocks);
  return order;
}

export function collectBlockIds(blocks: readonly TemplateBlock[]): Set<string> {
  return new Set(flattenReadingOrder(blocks).map((block) => block.id));
}

/** Whether `id` is `rootId` or lies anywhere below it. */
export function isWithin(blocks: readonly TemplateBlock[], rootId: string, id: string): boolean {
  const root = findBlock(blocks, rootId);
  if (!root) return false;
  return root.block.id === id || (isContainerBlock(root.block) && findBlock(root.block.blocks, id) !== null);
}

/** The field a block is bound to and edits: its `field`, a Line's first, or a Metric's first named number. */
export function boundField(block: TemplateBlock): FieldKey | undefined {
  switch (block.type) {
    case 'line': return block.fields[0];
    case 'metric': return block.fields.find((key) => key !== '');
    case 'text': return block.field;
    case 'section': case 'row': case 'tabs': case 'heading': case 'divider': case 'script': case 'opaque': return undefined;
    default: return block.field;
  }
}

function boundFields(block: TemplateBlock): (FieldKey | undefined)[] {
  switch (block.type) {
    case 'section': return [block.headingField];
    case 'line': case 'metric': return block.fields;
    case 'stat': return [block.field, block.rollFrom];
    case 'scores': return [block.field, ...(block.columns ?? []).map((column) => column.field)];
    case 'entries': return [block.field, block.introField];
    default: return [boundField(block)];
  }
}

/** The patterns a block writes its text with: a Title's, Line's or Stat's own, and any block's fallback. */
export function blockPatterns(block: TemplateBlock): string[] {
  const own = block.type === 'title' || block.type === 'line' || block.type === 'stat' ? [block.pattern] : [];
  return [...own, block.fallback].filter((pattern): pattern is string => pattern !== undefined);
}

/**
 * The keys a block itself reads, children aside: its field, a Line's fields,
 * a Section's heading field, a Stat's `rollFrom`, an Entries intro and the
 * fields Scores columns read. With `refsOf`, also the fields its pattern and
 * fallback refer to. Unbound fields (`''`) are left out.
 */
export function fieldsShownBy(block: TemplateBlock, refsOf?: PatternRefs): FieldKey[] {
  const keys = new Set<FieldKey>();
  for (const key of boundFields(block)) if (key) keys.add(key);
  if (refsOf) {
    for (const pattern of blockPatterns(block)) {
      for (const key of refsOf(pattern)) if (key) keys.add(key);
    }
  }
  return [...keys];
}

/** The blocks that read a field, in reading order. */
export function blocksShowingField(layout: TemplateLayout, key: FieldKey, refsOf?: PatternRefs): TemplateBlock[] {
  return flattenReadingOrder(layout.blocks).filter((block) => fieldsShownBy(block, refsOf).includes(key));
}
