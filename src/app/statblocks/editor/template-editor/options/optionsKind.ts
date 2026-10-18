/**
 * Which Options a selected block has: a Value's, an Abilities list's, a Table's, a Metric's, or the header
 * line's values; none for the rest. Pure.
 */

import { tileKind } from '../../../model/templateGrid';
import { findBlock } from '../../../model/treeQueries';
import type { StatblockTemplate } from '../../../model/templateTypes';

export type OptionsKind = 'value' | 'abilities' | 'table' | 'line' | 'metric';

export function optionsKindOf(template: StatblockTemplate, blockId: string): OptionsKind | null {
  const block = findBlock(template.layout.blocks, blockId)?.block;
  if (!block) return null;
  if (block.type === 'line') return 'line';
  const kind = tileKind(block);
  return kind === 'value' || kind === 'abilities' || kind === 'table' || kind === 'metric' ? kind : null;
}
