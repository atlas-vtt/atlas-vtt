/**
 * A small template that uses every block type and every optional key, holds a
 * block of a newer Atlas (read as opaque) and unknown keys on the template,
 * the layout, a field and a block. Its file text is written in the
 * serializer's key order, so writing the parsed template gives the text back.
 */

import {
  TEMPLATE_FORMAT,
  type StatblockTemplate,
  type TemplateBlock,
  type TemplateField,
} from '../../src/app/statblocks/model/templateTypes';

const FUTURE_TEMPLATE_KEYS = { pinnedPreview: { width: 480 }, accent: 'moss' };
const FUTURE_LAYOUT_KEYS = { gap: 'small' };
const FUTURE_FIELD_KEYS = { hint: 'Shown on hover' };
const FUTURE_BLOCK_KEYS = { tooltip: 'Vigor left', emphasis: 2 };

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text', ...FUTURE_FIELD_KEYS },
  { key: 'image', label: 'Token', type: 'image' },
  { key: 'kind', label: 'Kind', type: 'choice', meaning: 'creature-type', options: ['Beast', 'Spirit'], open: true },
  { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
  { key: 'armor', label: 'Armor', type: 'number', meaning: 'armor', unit: 'pts' },
  { key: 'vigor', label: 'Vigor', type: 'number', meaning: 'hit-points', formerKeys: ['hp'], prompt: 'Add vigor' },
  { key: 'vigor_dice', label: 'Vigor dice', type: 'dice' },
  {
    key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex', 'Wil'],
    slotKeys: ['strength', 'dexterity', 'willpower'],
  },
  { key: 'saves', label: 'Saves', type: 'pairs' },
  { key: 'keywords', label: 'Keywords', type: 'list' },
  { key: 'story', label: 'Story', type: 'markdown' },
  {
    key: 'moves', label: 'Moves', type: 'entries',
    entry: { nameKey: 'name', textKey: 'text', extras: [{ key: 'range', label: 'Range', type: 'text' }, { key: 'cost', label: 'Cost', type: 'number' }] },
  },
  { key: 'stress', label: 'Stress', type: 'number' },
  { key: 'spells', label: 'Spells', type: 'spells' },
];

const KNOWN_BLOCKS: TemplateBlock[] = [
  { id: 'a0row000', type: 'row', align: 'spread', blocks: [
    { id: 'a1sect00', type: 'section', heading: 'Who', headingField: 'name', collapsible: 'open', size: 'fill', blocks: [
      { id: 'a2title0', type: 'title', field: 'name', level: 2, pattern: '{name}' },
      { id: 'a3line00', type: 'line', fields: ['kind', 'level'], pattern: '{kind}[ · Level {level}]', separator: ' · ' },
    ] },
    { id: 'a4image0', type: 'image', field: 'image', shape: 'portrait', size: 'fit' },
  ] },
  { id: 'a5head00', type: 'heading', text: 'Defences', level: 'minor' },
  {
    id: 'a6stat00', type: 'stat', field: 'vigor', label: 'Vigor', look: 'stacked', pattern: '{vigor}[ ({vigor_dice})]',
    display: 'plain', rollFrom: 'vigor_dice', rollable: true, showWhen: { field: 'vigor', is: 'above', value: 0 }, whenEmpty: 'fallback',
    fallback: '{=armor * 2}', className: 'vigor', ...FUTURE_BLOCK_KEYS,
  },
  {
    id: 'a7score0', type: 'scores', field: 'stats', orientation: 'table', perLine: 3, display: 'signed',
    columns: [{ label: 'Save', field: 'saves', formula: 'value', display: 'signed' }], rollable: true,
  },
  { id: 'a8pairs0', type: 'pairs', field: 'saves', label: 'Saves', display: 'signed', rollable: true, showWhen: { field: 'saves', is: 'present' } },
  { id: 'a9tags00', type: 'tags', field: 'keywords', label: 'Keywords', look: 'chips', whenEmpty: 'hide' },
  { id: 'b0divid0', type: 'divider' },
  { id: 'b1text00', type: 'text', field: 'story', heading: 'Story' },
  { id: 'b2text00', type: 'text', text: 'Read aloud when the creature appears.' },
  {
    id: 'b3entr00', type: 'entries', field: 'moves', heading: 'Moves', introField: 'story', nameStyle: 'heading',
    addLabel: 'Add move', showWhen: { field: 'kind', is: 'not-equal', value: 'Spirit' },
  },
  { id: 'b4track0', type: 'track', field: 'stress', label: 'Stress', resource: 'stress', look: 'boxes', counts: 'up' },
  { id: 'b5spell0', type: 'spells', field: 'spells', heading: 'Spells' },
  { id: 'b8metr00', type: 'metric', heading: 'Thresholds', fields: ['armor', 'stress'], rollable: true, size: 'fill' },
  {
    id: 'b6scrip0', type: 'script', summary: 'Rolls the vigor dice', fs: { type: 'javascript', code: 'return el;' },
    fsExtras: { conditioned: true },
  },
];

/** A block of a type this Atlas does not know, as a newer Atlas would write it. */
export const NEWER_BLOCK = {
  id: 'b7newer0',
  type: 'carousel',
  slides: [{ label: 'Lore', blocks: [{ type: 'text', field: 'story' }] }],
  futureKey: 1,
};

type Head = Pick<StatblockTemplate, 'format' | 'version' | 'id' | 'description' | 'suits' | 'derivedFrom' | 'source' | 'importedFrom'>;

const HEAD: Head = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'every-block-x4k9q2',
  description: 'Every block type once',
  suits: ['monster'],
  derivedFrom: { templateId: 'builtin:generic-creature', revision: 2 },
  source: {
    system: 'Test system',
    label: 'Test rules · CC BY 4.0',
    licences: ['CC-BY-4.0'],
    attribution: 'Test attribution.',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
    sourceUrl: 'https://example.org/rules',
    modification: 'Atlas VTT arranged the stat block structure as an editable template.',
    trademarkNotice: 'Not affiliated.',
  },
  importedFrom: { layoutId: 'fs-layout-1', layoutName: 'Basic', extras: { pinned: true } },
};

const TAIL = {
  lookups: { tier: { '1': 'Minion', '2': 'Elite' } },
  sample: { name: 'Creature name', vigor: 6, stats: [1, 2, 3] },
  ...FUTURE_TEMPLATE_KEYS,
};

export const EVERY_BLOCK: StatblockTemplate = {
  ...HEAD,
  fields: FIELDS,
  layout: {
    maxColumns: 3,
    columnWidth: 18,
    blocks: [...KNOWN_BLOCKS, { id: NEWER_BLOCK.id, type: 'opaque', raw: NEWER_BLOCK }],
    ...FUTURE_LAYOUT_KEYS,
  },
  ...TAIL,
};

export const EVERY_BLOCK_JSON = `${JSON.stringify({
  ...HEAD,
  fields: FIELDS,
  layout: { maxColumns: 3, columnWidth: 18, blocks: [...KNOWN_BLOCKS, NEWER_BLOCK], ...FUTURE_LAYOUT_KEYS },
  ...TAIL,
}, null, 2)}\n`;
