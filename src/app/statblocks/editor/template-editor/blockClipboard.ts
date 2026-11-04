/**
 * Copying blocks (Mod+C, Copy in the block toolbar's menu) and pasting them
 * after the selection, in this template or another: a paste takes new block
 * ids, and the fields the blocks show come along where the template lacks them.
 */

import { patternRefs } from '../../expressions/patternRefs';
import { fieldByKey, fieldKeysOf } from '../../model/fieldKeys';
import type { BlockIdSource } from '../../model/templateIds';
import { reKeyed } from '../../model/treeOps';
import { fieldsShownBy, findBlock, flattenReadingOrder } from '../../model/treeQueries';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../model/templateTypes';
import { inSiblingOrder } from './selection';

export interface BlockClip {
  /** Top-level copied blocks, in the order they stood; children inside them. */
  blocks: readonly TemplateBlock[];
  /** The fields they show, as the template they came from defines them. */
  fields: readonly TemplateField[];
}

/** One clip per app (each window of the app shares it), so a block copied in one template pastes into another. */
const clips = new WeakMap<object, BlockClip>();

export function rememberClip(owner: object, clip: BlockClip): void {
  clips.set(owner, clip);
}

export function clipOf(owner: object): BlockClip | null {
  return clips.get(owner) ?? null;
}

/** The selected blocks, in order, with the fields they show; null for an empty selection. */
export function copyBlocks(template: StatblockTemplate, ids: readonly string[]): BlockClip | null {
  const blocks = inSiblingOrder(template.layout, ids)
    .map((id) => findBlock(template.layout.blocks, id)?.block)
    .filter((block): block is TemplateBlock => block !== undefined);
  if (blocks.length === 0) return null;
  const keys = new Set(flattenReadingOrder(blocks).flatMap((block) => fieldsShownBy(block, patternRefs)));
  const fields = [...keys]
    .map((key) => fieldByKey(template.fields, key))
    .filter((field): field is TemplateField => field !== undefined);
  return { blocks, fields: [...new Set(fields)] };
}

/**
 * What a paste into `template` inserts: the blocks with ids from `nextId`, and
 * the clip's fields whose keys the template neither has nor had. A field the
 * template already has keeps its own definition.
 */
export function pastedBlocks(clip: BlockClip, template: StatblockTemplate, nextId: BlockIdSource): { blocks: TemplateBlock[]; fields: TemplateField[] } {
  const taken = fieldKeysOf(template.fields);
  return {
    blocks: clip.blocks.map((block) => reKeyed(block, nextId)),
    fields: clip.fields.filter((field) => !taken.has(field.key)),
  };
}
