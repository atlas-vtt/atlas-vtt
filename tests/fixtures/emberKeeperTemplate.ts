import { TEMPLATE_FORMAT, type EntryExtraShape, type StatblockTemplate, type TemplateBlock, type TemplateField } from '../../src/app/statblocks/model/templateTypes';

/**
 * A character template of a homebrew system, laid out as a player character's sheet: the header
 * with the name and token art, a line of values, two gauges side by side, a row of dice values
 * around a boxed number, four boxed numbers, words, a skills section in two columns, and ability
 * lists: three tabs, a section of three tabs, a list with parts, and six tabs of armour pieces.
 * The header's hit points are drawn as a gauge of Encumbrance beside the art. Every name is made up
 * for tests.
 */

const ABILITY = (key: string, label: string, extras?: EntryExtraShape[]): TemplateField => ({
  key, label, type: 'entries', ...(extras && { entry: { extras } }),
});
const WEAPON_PARTS: EntryExtraShape[] = [
  { key: 'die', label: 'Die', type: 'dice' },
  { key: 'range', label: 'Range', type: 'choice', options: ['Close', 'Near', 'Far'] },
  { key: 'damage', label: 'Damage', type: 'text' },
];
const SKILLS = ['Trade', 'Craft', 'Empathy', 'Lore', 'Medicine', 'Stealth', 'Survival', 'Travel', 'Watch', 'Combat'];
const ARMOUR = ['Head', 'Torso', 'Left arm', 'Right arm', 'Left leg', 'Right leg'];
const slug = (label: string): string => label.toLowerCase().replace(/[^a-z]+/g, '_');
const id = (stem: string, index = 0): string => `${stem}${String(index).padStart(8 - stem.length, '0')}`;

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'description', label: 'Description', type: 'markdown', meaning: 'description' },
  { key: 'encumbrance', label: 'Encumbrance', type: 'number', meaning: 'hit-points' },
  { key: 'personality', label: 'Personality & Quirk', type: 'text', prompt: 'Add personality' },
  { key: 'calling', label: 'Path', type: 'choice', options: ['Arcanist', 'Warden', 'Seeker'] },
  { key: 'kin', label: 'Kin', type: 'choice', options: ['Imp', 'Human', 'Elf'] },
  { key: 'rank', label: 'Level', type: 'rating' },
  { key: 'size', label: 'Size', type: 'text' },
  { key: 'mist', label: 'Mist', type: 'number' },
  { key: 'vigour', label: 'Vigour', type: 'number' },
  { key: 'guard', label: 'Guard', type: 'dice' },
  { key: 'evade', label: 'Evade', type: 'dice' },
  { key: 'ward', label: 'Ward', type: 'number', meaning: 'armor' },
  { key: 'resist', label: 'Resist', type: 'dice' },
  { key: 'grip', label: 'Grip', type: 'dice' },
  { key: 'luck', label: 'Luck', type: 'number' },
  { key: 'grit', label: 'Grit', type: 'number' },
  { key: 'nerve', label: 'Nerve', type: 'number' },
  { key: 'spark', label: 'Spark', type: 'number' },
  { key: 'marks', label: 'Tags', type: 'list' },
  { key: 'knowledge', label: 'Knowledge', type: 'list' },
  ...SKILLS.map((skill): TemplateField => ({ key: slug(skill), label: skill, type: 'text' })),
  ABILITY('edge', 'Edge'), ABILITY('feats', 'Feats'), ABILITY('gifts', 'Dark gifts'),
  ABILITY('roots', 'Spellroots'), ABILITY('words', 'Spellwords'), ABILITY('edicts', 'Edicts'),
  ABILITY('weapons', 'Weapons', WEAPON_PARTS),
  ...ARMOUR.map((piece) => ABILITY(`armour_${slug(piece)}`, piece)),
];

const stat = (field: string, look: 'run-in' | 'stacked', index: number): TemplateBlock => ({ id: id(`st${field.slice(0, 3)}`, index), type: 'stat', field, look });
const metric = (field: string): TemplateBlock => ({ id: id(`me${field.slice(0, 3)}`), type: 'metric', fields: [field] });
const divider = (index: number): TemplateBlock => ({ id: id('div', index), type: 'divider' });
const tab = (label: string, field: string, index: number): TemplateBlock => ({
  id: id('tab', index), type: 'section', heading: label, blocks: [{ id: id('lis', index), type: 'entries', field }],
});

const LAYOUT: TemplateBlock[] = [
  stat('personality', 'run-in', 1),
  { id: id('rowline'), type: 'row', blocks: [stat('calling', 'run-in', 1), stat('kin', 'run-in', 1), stat('rank', 'run-in', 1), stat('size', 'run-in', 1)] },
  divider(1),
  { id: id('rowgaug'), type: 'row', blocks: [
    { id: id('trmist'), type: 'track', field: 'mist', resource: 'mist', look: 'gauge', counts: 'down' },
    { id: id('trvigo'), type: 'track', field: 'vigour', resource: 'vigour', look: 'gauge', counts: 'down' },
  ] },
  divider(2),
  { id: id('rowdice'), type: 'row', blocks: [stat('guard', 'stacked', 1), stat('evade', 'stacked', 1), metric('ward'), stat('resist', 'stacked', 1), stat('grip', 'stacked', 1)] },
  { id: id('rowmetr'), type: 'row', blocks: [metric('luck'), metric('grit'), metric('nerve'), metric('spark')] },
  divider(3),
  { id: id('rowword'), type: 'row', blocks: [
    { id: id('tgmark'), type: 'tags', field: 'marks', look: 'comma' },
    { id: id('tgknow'), type: 'tags', field: 'knowledge', look: 'comma' },
  ] },
  divider(4),
  { id: id('seskill'), type: 'section', heading: 'Skills', blocks: [
    { id: id('rowskil'), type: 'row', blocks: [
      { id: id('seskila'), type: 'section', blocks: SKILLS.slice(0, 5).map((skill, index) => stat(slug(skill), 'run-in', index)) },
      { id: id('seskilb'), type: 'section', blocks: SKILLS.slice(5).map((skill, index) => stat(slug(skill), 'run-in', index + 5)) },
    ] },
  ] },
  divider(5),
  { id: id('tbedge'), type: 'tabs', blocks: [tab('Edge', 'edge', 1), tab('Feats', 'feats', 2), tab('Dark gifts', 'gifts', 3)] },
  { id: id('sespell'), type: 'section', heading: 'Spellcasting', blocks: [
    { id: id('tbspell'), type: 'tabs', blocks: [tab('Spellroots', 'roots', 4), tab('Spellwords', 'words', 5), tab('Edicts', 'edicts', 6)] },
  ] },
  { id: id('liweap'), type: 'entries', field: 'weapons', heading: 'Weapons' },
  { id: id('tbarmo'), type: 'tabs', heading: 'Armour', blocks: ARMOUR.map((piece, index) => tab(piece, `armour_${slug(piece)}`, 10 + index)) },
];

export const EMBER_KEEPER: StatblockTemplate = {
  format: TEMPLATE_FORMAT,
  version: 1,
  id: 'ember-keeper-a1b2c3',
  fields: FIELDS,
  // The header's hit points are the character's Encumbrance, a gauge beside the art bound to the `burden` resource
  header: { hidden: ['level', 'type'], hitPoints: { look: 'gauge', counts: 'up', resource: 'burden' } },
  layout: { maxColumns: 1, blocks: LAYOUT },
};

/** A character of the template, with some of every kind of value and a few abilities in most lists. */
export const EMBER_KEEPER_NOTE: Record<string, unknown> = {
  statblock: true,
  'atlas-template': EMBER_KEEPER.id,
  name: 'Ember Keeper',
  calling: 'Arcanist',
  kin: 'Imp',
  mist: 15,
  vigour: 12,
  guard: 'd6',
  evade: 'd8',
  ward: 15,
  encumbrance: 12,
  resist: 'd4',
  grip: 'd4',
  luck: 2,
  grit: 2,
  nerve: 1,
  spark: 0,
  marks: ['Lantern-bearer'],
  trade: 'Barter',
  survival: 'Forage',
  edge: [{ name: 'Steady hand', desc: 'Reroll one die of a careful task.' }, { name: 'Night eyes', desc: 'See in dim light.' }],
  feats: [{ name: 'Second wind', desc: 'Recover once a day.' }],
  roots: [{ name: 'Kindle', desc: 'A small flame.' }, { name: 'Hush', desc: 'Silence around you.' }],
  words: [{ name: 'Bind', desc: 'Hold a creature still.' }],
  weapons: [
    { name: 'Knife', desc: 'Small and quick.', die: 'd6', range: 'Close', damage: '1' },
    { name: 'Sling', desc: 'Stones.', die: 'd4', range: 'Far', damage: '1' },
  ],
  armour_head: [{ name: 'Leather cap', desc: 'Soaks one hit.' }],
};
