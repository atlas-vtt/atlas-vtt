/**
 * Dividers that separated blocks which do not show. A rule stands between
 * blocks; where the blocks on one side of it hide (empty, folded into a chip),
 * it would stand at the edge of its list or right under another rule. Only
 * hiding strands a rule: two rules a template places side by side both show.
 */

import type { TemplateBlock } from '../model/templateTypes';

/** The ids of the dividers in `blocks` that stand where hidden blocks left them; `shows` tells whether a block is drawn. */
export function strandedDividers(blocks: readonly TemplateBlock[], shows: (block: TemplateBlock) => boolean): ReadonlySet<string> {
  const stranded = new Set<string>();
  // From the start: a rule with hidden blocks before it and nothing but a kept rule (or the list's start) beyond them.
  let previous: TemplateBlock | undefined;
  let hiddenSince = false;
  for (const block of blocks) {
    if (!shows(block)) {
      hiddenSince = true;
      continue;
    }
    if (block.type === 'divider' && hiddenSince && (!previous || previous.type === 'divider')) {
      stranded.add(block.id);
      continue;
    }
    previous = block;
    hiddenSince = false;
  }
  // From the end: a rule with hidden blocks after it and nothing drawn beyond them.
  hiddenSince = false;
  for (let index = blocks.length - 1; index >= 0; index--) {
    const block = blocks[index]!;
    if (!shows(block) || stranded.has(block.id)) {
      hiddenSince ||= !shows(block);
      continue;
    }
    if (block.type !== 'divider' || !hiddenSince) break;
    stranded.add(block.id);
  }
  return stranded;
}
