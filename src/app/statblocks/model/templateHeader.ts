/**
 * The header every statblock has: its name, its token art, its level, its
 * type, its hit points and its description, drawn by Atlas in one fixed
 * arrangement above everything the template lays out. The header is no part
 * of the layout tree: a template keeps of it only each part's field (whose
 * label is the part's name on the card, its alias) and which parts it hides
 * (`StatblockTemplate.header`). So no part is ever deleted, moved, copied,
 * turned into another block, or given another key: a system keeps its own
 * key ("Challenge" stays `cr`), found by the field's meaning (`headerKey`).
 * The name and the token art always show; the others may be hidden where a
 * system has no use for them. The hit points show the template's hit dice
 * beside them (`hit_dice`), which then roll them. The name shows the field
 * meant as the display name where the template has one and the statblock a
 * value in it (Cairn's `title`, "Aranea"), else `name`, which stays what
 * identifies the statblock ("Aranea (Cairn)"). Pure.
 */

import { fieldByKey } from './fieldKeys';
import { findBlock } from './treeQueries';
import {
  HEADER_PART_IDS,
  TEMPLATE_VERSION,
  type FieldKey,
  type FieldMeaning,
  type HeaderPartId,
  type HeaderTrack,
  type StatblockTemplate,
  type TemplateBlock,
  type TemplateField,
  type TemplateHeader,
} from './templateTypes';

interface HeaderPartSpec {
  id: HeaderPartId;
  /** How the editor names the part before its field has a label. */
  label: string;
  /** The field a template without one gets. */
  field: TemplateField;
  /** Where the template's own field for it may have another key (5E's `cr`). */
  meaning?: FieldMeaning;
  /** Whether a template may keep it off the card; the name and the token art always show. */
  hideable: boolean;
}

export const HEADER_PARTS: Readonly<Record<HeaderPartId, HeaderPartSpec>> = {
  name: { id: 'name', label: 'Name', field: { key: 'name', label: 'Name', type: 'text' }, hideable: false },
  token: { id: 'token', label: 'Token art', field: { key: 'image', label: 'Token art', type: 'image' }, hideable: false },
  level: {
    id: 'level', label: 'Level', field: { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' }, meaning: 'rating', hideable: true,
  },
  type: {
    id: 'type', label: 'Type', field: { key: 'type', label: 'Type', type: 'text', meaning: 'creature-type' }, meaning: 'creature-type', hideable: true,
  },
  hp: {
    id: 'hp', label: 'HP', field: { key: 'hp', label: 'HP', type: 'number', meaning: 'hit-points' }, meaning: 'hit-points', hideable: true,
  },
  description: {
    id: 'description',
    label: 'Description',
    field: { key: 'description', label: 'Description', type: 'markdown', meaning: 'description' },
    meaning: 'description',
    hideable: true,
  },
};

/**
 * The id each part's block has on the card. Not 8 base36 characters, so no
 * block of a layout can ever take one (`blockIds.ts`).
 */
const BLOCK_IDS: Readonly<Record<HeaderPartId, string>> = {
  name: 'header-name', token: 'header-token', level: 'header-level', type: 'header-type', hp: 'header-hp', description: 'header-description',
};

const PART_OF_BLOCK: ReadonlyMap<string, HeaderPartId> = new Map(HEADER_PART_IDS.map((id) => [BLOCK_IDS[id], id]));

/** One part of a template's header, as the card draws it. */
export interface HeaderPart {
  id: HeaderPartId;
  /** The block the card draws the part with; it stands in no layout, so no tree edit finds it. */
  block: TemplateBlock;
  /** The part's own field; the name's block shows the display name before it (`displayNameKey`). */
  key: FieldKey;
  /** The part's name: its field's label, else the part's own. */
  label: string;
  hidden: boolean;
  hideable: boolean;
}

/** The key of the template's field for a part: the field with the part's meaning, else the part's own key. */
export function headerKey(fields: readonly TemplateField[], id: HeaderPartId): FieldKey {
  const spec = HEADER_PARTS[id];
  return (spec.meaning && fields.find((field) => field.meaning === spec.meaning)?.key) || spec.field.key;
}

/**
 * The field the header's name shows where the statblock has a value in it: the
 * one meant as the display name, unless that is the name itself. Null where
 * the template has none, and the name shows `name`.
 */
export function displayNameKey(fields: readonly TemplateField[]): FieldKey | null {
  const name = headerKey(fields, 'name');
  const key = fields.find((field) => field.meaning === 'display-name')?.key;
  return key && key !== name ? key : null;
}

/** Whether `id` names a part of the header rather than a block of the layout. */
export function isHeaderBlockId(id: string): boolean {
  return PART_OF_BLOCK.has(id);
}

/** The part a block id names, or null for a block of the layout. */
function headerPartIdOf(blockId: string): HeaderPartId | null {
  return PART_OF_BLOCK.get(blockId) ?? null;
}


/** The key hit dice are kept under by convention (Fantasy Statblocks' 5e layouts, the d20 built-ins). */
const HIT_DICE_KEY = 'hit_dice';

/** The template's hit dice, which the header shows beside the hit points: a dice field under the conventional key, else null. */
export function hitDiceKey(fields: readonly TemplateField[]): FieldKey | null {
  return fields.some((field) => field.key === HIT_DICE_KEY && field.type === 'dice') ? HIT_DICE_KEY : null;
}

/**
 * The hit points' block: the template's track where it draws them as one (a row of boxes), else
 * "22 (4d8 + 4)" where the template keeps hit dice, which then roll the hit points.
 */
function hitPointsBlock(blockId: string, key: FieldKey, fields: readonly TemplateField[], track: HeaderTrack | undefined): TemplateBlock {
  if (track) return { id: blockId, type: 'track', field: key, ...track };
  const dice = hitDiceKey(fields);
  if (!dice || dice === key) return { id: blockId, type: 'stat', field: key, look: 'run-in' };
  return { id: blockId, type: 'stat', field: key, look: 'run-in', pattern: `{${key}}[ ({${dice}})]`, rollFrom: dice };
}

/** The name's block: the display name, falling back to `name` where the statblock has none. */
function nameBlock(blockId: string, key: FieldKey, fields: readonly TemplateField[]): TemplateBlock {
  const shown = displayNameKey(fields);
  if (!shown) return { id: blockId, type: 'title', field: key, level: 1 };
  return { id: blockId, type: 'title', field: shown, level: 1, whenEmpty: 'fallback', fallback: `{${key}}` };
}

function partBlock(id: HeaderPartId, key: FieldKey, fields: readonly TemplateField[], header: TemplateHeader | undefined): TemplateBlock {
  const blockId = BLOCK_IDS[id];
  switch (id) {
    case 'name': return nameBlock(blockId, key, fields);
    case 'token': return { id: blockId, type: 'image', field: key, shape: 'token' };
    case 'description': return { id: blockId, type: 'text', field: key };
    case 'hp': return hitPointsBlock(blockId, key, fields, header?.hitPoints);
    default: return { id: blockId, type: 'stat', field: key, look: 'run-in' };
  }
}

function isHidden(template: StatblockTemplate, id: HeaderPartId): boolean {
  return HEADER_PARTS[id].hideable && (template.header?.hidden?.includes(id) ?? false);
}

/** Each template's parts, worked out once: the card and the editor read the same block objects. */
const PARTS = new WeakMap<StatblockTemplate, readonly HeaderPart[]>();

/** The header's parts in the order Atlas draws them, hidden ones included. */
export function headerParts(template: StatblockTemplate): readonly HeaderPart[] {
  const known = PARTS.get(template);
  if (known) return known;
  const parts = HEADER_PART_IDS.map((id): HeaderPart => {
    const key = headerKey(template.fields, id);
    const spec = HEADER_PARTS[id];
    return {
      id,
      block: partBlock(id, key, template.fields, template.header),
      key,
      label: fieldByKey(template.fields, key)?.label?.trim() || spec.label,
      hidden: isHidden(template, id),
      hideable: spec.hideable,
    };
  });
  PARTS.set(template, parts);
  return parts;
}

/** The part a block id names in this template, or null for a block of the layout. */
export function headerPartOf(template: StatblockTemplate, blockId: string): HeaderPart | null {
  const id = headerPartIdOf(blockId);
  return id ? headerParts(template).find((part) => part.id === id) ?? null : null;
}

/** The parts the template keeps off the card, in the header's order. */
export function hiddenHeaderParts(template: StatblockTemplate): HeaderPart[] {
  return headerParts(template).filter((part) => part.hidden);
}

/** The parts the card draws, in the header's order. */
export function shownHeaderParts(template: StatblockTemplate): HeaderPart[] {
  return headerParts(template).filter((part) => !part.hidden);
}

/** A block of the card by its id: a part of the header, else a block of the layout. */
export function templateBlock(template: StatblockTemplate, id: string): TemplateBlock | null {
  return headerPartOf(template, id)?.block ?? findBlock(template.layout.blocks, id)?.block ?? null;
}

/**
 * The template with a part taken off the card (`hidden`) or put back. The very
 * template where nothing changes, and for the name and the token art, which
 * always show.
 */
export function setHeaderPartHidden(template: StatblockTemplate, id: HeaderPartId, hidden: boolean): StatblockTemplate {
  if (!HEADER_PARTS[id].hideable || isHidden(template, id) === hidden) return template;
  const now = new Set(template.header?.hidden ?? []);
  if (hidden) now.add(id);
  else now.delete(id);
  const list = HEADER_PART_IDS.filter((part) => now.has(part));
  const { hidden: _hidden, ...kept } = template.header ?? {};
  return withHeaderSettings(template, list.length > 0 ? { ...kept, hidden: list } : kept);
}

/** The template with `header` as its header settings, and none where they say nothing. */
export function withHeaderSettings(template: StatblockTemplate, header: TemplateHeader): StatblockTemplate {
  const { header: _header, ...rest } = template;
  return Object.keys(header).length > 0 ? { ...rest, header } : rest;
}

/**
 * The template with a field for every part of its header: one it lacks is
 * added, in memory like a migration, and written with the next real edit. A
 * template that has them all comes back as the same object; one of a newer
 * format is read-only and is left as it is.
 */
export function withHeaderFields(template: StatblockTemplate): StatblockTemplate {
  if (template.version > TEMPLATE_VERSION) return template;
  const missing = HEADER_PART_IDS
    .filter((id) => !fieldByKey(template.fields, headerKey(template.fields, id)))
    .map((id) => HEADER_PARTS[id].field);
  return missing.length === 0 ? template : { ...template, fields: [...template.fields, ...missing] };
}
