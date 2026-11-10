/**
 * What a drag carries (§7.6): a block of the canvas or a kind from the dock;
 * and the block types each puts into the template.
 */

import { createBlock } from '../../model/blockCatalogue';
import type { BlockIdSource } from '../../model/templateIds';
import { findBlock } from '../../model/treeQueries';
import type { StatblockTemplate, TemplateBlock } from '../../model/templateTypes';
import type { InsertItem } from '../template-editor/insertItems';
import type { DragSubject } from './dropTargets';
import { t } from '../../../i18n';

export type DragSource =
  | { kind: 'block'; id: string }
  | { kind: 'item'; item: InsertItem };

/** What a draggable hands dnd-kit as its `data`. */
export interface DragData {
  source: DragSource | null;
}

/** The source a draggable's data names, if it is one. */
export function sourceOf(data: unknown): DragSource | null {
  if (typeof data !== 'object' || data === null || !('source' in data)) return null;
  const source = (data as DragData).source;
  return source && typeof source === 'object' && 'kind' in source ? source : null;
}

const ids = (): BlockIdSource => {
  let next = 0;
  return () => `drag${(next++).toString(36)}`;
};

/** The block a new item would put in. */
function newBlock(source: Extract<DragSource, { kind: 'item' }>): TemplateBlock {
  return createBlock(source.item.type, ids());
}

/** What the drop puts in, for working out where it may go; null where the source names nothing in the template. */
export function subjectOf(template: StatblockTemplate, source: DragSource): DragSubject | null {
  if (source.kind === 'block') {
    const found = findBlock(template.layout.blocks, source.id);
    return found ? { types: [found.block.type], movingId: source.id } : null;
  }
  return { types: [newBlock(source).type], movingId: null };
}

/** What the source is called in announcements. */
export function sourceName(template: StatblockTemplate, source: DragSource, nameOf: (block: TemplateBlock) => string): string {
  if (source.kind === 'item') return source.item.label;
  const found = findBlock(template.layout.blocks, source.id);
  return found ? nameOf(found.block) : t('statblockEditor.theBlock');
}
