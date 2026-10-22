/** How the template editor names a block to people: in tags, toolbar labels and announcements. */

import { blockSpec } from '../../model/blockCatalogue';
import { fieldByKey } from '../../model/fieldKeys';
import { kindName } from '../../model/templateGrid';
import { boundField } from '../../model/treeQueries';
import type { BlockType, FieldKey, TemplateBlock, TemplateField } from '../../model/templateTypes';

function fieldLabel(fields: readonly TemplateField[], key: FieldKey | undefined): string | undefined {
  if (!key) return undefined;
  return fieldByKey(fields, key)?.label || key;
}

/** What the block itself says it is: its label, heading or field, without its type. Empty where it says nothing. */
export function blockTitle(block: TemplateBlock, fields: readonly TemplateField[]): string {
  switch (block.type) {
    case 'heading': return block.text.trim();
    case 'section': return (block.heading ?? '').trim() || (fieldLabel(fields, block.headingField) ?? '');
    case 'stat': case 'tags': case 'pairs': case 'track': case 'counters':
      return (block.label ?? '').trim() || (fieldLabel(fields, block.field) ?? '');
    case 'entries': case 'spells': return (block.heading ?? '').trim() || (fieldLabel(fields, block.field) ?? '');
    case 'tabs': return (block.heading ?? '').trim();
    case 'text': return (block.heading ?? '').trim() || (fieldLabel(fields, block.field) ?? '');
    case 'line': return block.fields.map((key) => fieldLabel(fields, key)).filter(Boolean).join(', ');
    case 'metric': return (block.heading ?? '').trim() || block.fields.map((key) => fieldLabel(fields, key)).filter(Boolean).join(', ');
    default: return fieldLabel(fields, boundField(block)) ?? '';
  }
}

/** A block type as people know it: its primitive, and its kind where the primitive has several ("List (a word)"). */
export function typeName(type: BlockType): string {
  const { label, kind } = blockSpec(type);
  return kind ? `${label} (${kind.toLowerCase()})` : label;
}

/** "Armor class", or the kind's name where the block says nothing ("Divider", "Abilities"). */
export function blockName(block: TemplateBlock, fields: readonly TemplateField[]): string {
  return blockTitle(block, fields) || kindName(block);
}

/** The tag a container shows: "Side by side", "Section · Defenses". */
export function containerTag(block: TemplateBlock, fields: readonly TemplateField[]): string {
  const type = blockSpec(block.type).label;
  const title = block.type === 'section' || block.type === 'tabs' ? blockTitle(block, fields) : '';
  return title ? `${type} · ${title}` : type;
}

/** "Armor class, value", for the block's accessible name (spec §15). */
export function blockDescription(block: TemplateBlock, fields: readonly TemplateField[]): string {
  const type = kindName(block);
  const title = blockTitle(block, fields);
  return title && title !== type ? `${title}, ${type.toLowerCase()}` : type;
}

/** Where a block stands, for "Moved Armor class to section Defenses, position 2 of 3". */
export function placeName(parent: TemplateBlock | null, fields: readonly TemplateField[]): string {
  if (!parent) return 'the top level';
  const title = blockTitle(parent, fields);
  const type = blockSpec(parent.type).label.toLowerCase();
  return title ? `${type} ${title}` : `a ${type}`;
}
