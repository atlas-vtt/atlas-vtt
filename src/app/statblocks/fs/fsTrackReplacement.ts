/**
 * Putting Track blocks where an imported layout drew tracks of boxes with
 * JavaScript (§6.2), which every import does through `withTracksInPlace`. Pure: a
 * template goes in, the template with each such script replaced comes out,
 * and the number fields the tracks show are added where the template lacks
 * them. Scripts without a known replacement stay as they are.
 */

import { addField } from '../model/fieldOps';
import { blockIdSource } from '../model/templateIds';
import type { ScriptBlock, StatblockTemplate, TemplateLayout } from '../model/templateTypes';
import type { FsImportResult } from './fsLayoutTypes';
import { insertBlock, removeBlock } from '../model/treeOps';
import { collectBlockIds, findBlock, flattenReadingOrder } from '../model/treeQueries';
import { suggestedTrackReplacement } from './fsScripts';

/** The script blocks of a template that draw tracks Track blocks can draw instead, in reading order. */
export function trackScripts(template: StatblockTemplate): ScriptBlock[] {
  const ids = blockIdSource([]);
  return flattenReadingOrder(template.layout.blocks)
    .filter((block): block is ScriptBlock => block.type === 'script')
    .filter((block) => suggestedTrackReplacement(block, ids) !== null);
}

/** The layout with one script swapped for its blocks at its place; the layout as it was when anything is refused. */
function swapped(layout: TemplateLayout, script: ScriptBlock, replacement: TemplateLayout['blocks']): TemplateLayout {
  const found = findBlock(layout.blocks, script.id);
  if (!found) return layout;
  let next = removeBlock(layout, script.id).layout;
  for (const [offset, block] of replacement.entries()) {
    const edit = insertBlock(next, block, { parentId: found.parentId, index: found.index + offset });
    if (!edit.ok) return layout;
    next = edit.layout;
  }
  return next;
}

/**
 * The template with every script of `scriptIds` (all that draw tracks when
 * none are named) replaced by its Track blocks. The same object comes back
 * when nothing was replaced.
 */
export function withTrackBlocks(template: StatblockTemplate, scriptIds?: readonly string[]): StatblockTemplate {
  const nextId = blockIdSource(collectBlockIds(template.layout.blocks));
  let result = template;
  for (const script of trackScripts(template)) {
    if (scriptIds && !scriptIds.includes(script.id)) continue;
    const replacement = suggestedTrackReplacement(script, nextId);
    if (!replacement) continue;
    const layout = swapped(result.layout, script, replacement.blocks);
    if (layout === result.layout) continue;
    result = { ...result, layout };
    const known = new Set(result.fields.map((field) => field.key));
    for (const field of replacement.fields) if (!known.has(field.key)) result = addField(result, field);
  }
  return result;
}

/**
 * An import with Track blocks in place of every script they can stand in
 * for, and a report that names only the scripts the template still keeps.
 */
export function withTracksInPlace({ template, report }: FsImportResult): FsImportResult {
  const replaced = withTrackBlocks(template);
  if (replaced === template) return { template, report };
  const kept = new Set(flattenReadingOrder(replaced.layout.blocks).filter((block) => block.type === 'script').map((block) => block.id));
  return { template: replaced, report: { ...report, scripts: report.scripts.filter((script) => kept.has(script.blockId)) } };
}
