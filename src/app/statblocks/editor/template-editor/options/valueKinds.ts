/**
 * The kinds a Value tile holds, as the toolbar's Kind of value and the tile's
 * Options offer them: one value (a number, text, dice, a rating or a choice
 * from a list), words, or labels with values. A Value of words is a Words
 * block, one of labels and values a Labels and values block; changing the
 * kind changes the property's type and, where needed, the block's, in one
 * step. Pure.
 */

import { fieldByKey } from '../../../model/fieldKeys';
import { updateField } from '../../../model/fieldOps';
import { boundField, findBlock } from '../../../model/treeQueries';
import { turnInto } from '../../../model/turnInto';
import type { FieldType, StatblockTemplate, TemplateBlock, TemplateField } from '../../../model/templateTypes';

export type ValueKind = 'number' | 'text' | 'dice' | 'rating' | 'choice' | 'words' | 'pairs';

export const VALUE_KINDS: ReadonlyArray<{ kind: ValueKind; label: string }> = [
  { kind: 'number', label: 'Number' },
  { kind: 'text', label: 'Text' },
  { kind: 'dice', label: 'Dice' },
  { kind: 'rating', label: 'Rating' },
  { kind: 'choice', label: 'One of a list' },
  { kind: 'words', label: 'Words' },
  { kind: 'pairs', label: 'Labels and values' },
];

const FIELD_TYPES: Readonly<Record<ValueKind, FieldType>> = {
  number: 'number', text: 'text', dice: 'dice', rating: 'rating', choice: 'choice', words: 'list', pairs: 'pairs',
};

const BLOCK_TYPES: Readonly<Record<ValueKind, 'stat' | 'tags' | 'pairs'>> = {
  number: 'stat', text: 'stat', dice: 'stat', rating: 'stat', choice: 'stat', words: 'tags', pairs: 'pairs',
};

export function valueKindLabel(kind: ValueKind): string {
  return VALUE_KINDS.find((entry) => entry.kind === kind)?.label ?? kind;
}

/** The kind a Value tile holds; null for a block that is no Value, or one bound to no property yet. */
export function valueKindOf(block: TemplateBlock, field: TemplateField | undefined): ValueKind | null {
  if (block.type === 'tags') return 'words';
  if (block.type === 'pairs') return 'pairs';
  // A number shown as a track (`numberLooks`)
  if (block.type === 'track') return field?.type === 'number' ? 'number' : null;
  if (block.type !== 'stat' || !field) return null;
  const kind = VALUE_KINDS.find((entry) => FIELD_TYPES[entry.kind] === field.type)?.kind;
  return kind && BLOCK_TYPES[kind] === 'stat' ? kind : null;
}

/**
 * The template with the Value `blockId` holding `kind`: its property's type
 * first, then the block's type, which keeps the property where it binds the
 * new type. The same template where nothing changes or the block may not turn.
 */
export function withValueKind(template: StatblockTemplate, blockId: string, kind: ValueKind): StatblockTemplate {
  const block = findBlock(template.layout.blocks, blockId)?.block;
  const key = block ? boundField(block) : undefined;
  if (!block || !key || !fieldByKey(template.fields, key)) return template;
  // A track is how a number shows, which Show as changes
  if (block.type === 'track' && kind === 'number') return template;
  const typed = updateField(template, key, { type: FIELD_TYPES[kind] });
  const turned = turnInto(typed.layout, blockId, BLOCK_TYPES[kind], typed.fields);
  if (!turned.ok) return template;
  return turned.layout === typed.layout ? typed : { ...typed, layout: turned.layout };
}
