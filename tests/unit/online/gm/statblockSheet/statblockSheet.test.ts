// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { statblockSheet, type StatblockSheetInput } from '../../../../../src/app/online/gm/book/statblockSheet';
import { parseBookStatblock, type SheetNode } from '../../../../../src/app/online/protocol/index.ts';
import type { ResourceDefinition } from '../../../../../src/app/resources/resourceTypes';
import type { StatblockTemplate, TemplateBlock, TemplateField } from '../../../../../src/app/statblocks/model/templateTypes';
import { entryItemKeys } from '../../../../../src/app/statblocks/values/entryKeys';
import { templateOf } from '../../../statblocks/render/sheetTestKit';
import { resolvedOf } from './sheetKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'image', label: 'Token art', type: 'image' },
  { key: 'level', label: 'Level', type: 'rating', meaning: 'rating' },
  { key: 'type', label: 'Kind', type: 'text', meaning: 'creature-type' },
  { key: 'hp', label: 'Hit points', type: 'number', meaning: 'hit-points' },
  { key: 'ac', label: 'Armour', type: 'number', meaning: 'armor' },
  { key: 'speed', label: 'Speed', type: 'text', prompt: 'Add speed' },
  { key: 'size', label: 'Size', type: 'choice', options: ['Small', 'Medium'] },
  { key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [{ key: 'cost', label: 'Cost', type: 'choice', options: ['Action', 'Bonus action'] }] } },
  { key: 'bonus', label: 'Bonus actions', type: 'entries', entry: { extras: [{ key: 'cost', label: 'Cost', type: 'choice', options: ['Action', 'Bonus action'] }] } },
  { key: 'traits', label: 'Traits', type: 'entries' },
  { key: 'spells', label: 'Spells', type: 'spells' },
];
const BLOCKS: TemplateBlock[] = [
  { id: 'armour01', type: 'stat', field: 'ac', look: 'run-in' },
  { id: 'speed001', type: 'stat', field: 'speed', look: 'run-in' },
  { id: 'size0001', type: 'stat', field: 'size', look: 'run-in' },
  { id: 'tabs0001', type: 'tabs', heading: 'Combat', blocks: [
    { id: 'tab00001', type: 'section', heading: 'Actions', blocks: [{ id: 'list0001', type: 'entries', field: 'actions' }] },
    { id: 'tab00002', type: 'section', heading: 'Bonus', blocks: [{ id: 'list0002', type: 'entries', field: 'bonus' }] },
  ] },
  { id: 'sect0001', type: 'section', heading: 'Features', blocks: [{ id: 'list0003', type: 'entries', field: 'traits' }] },
  { id: 'spel0001', type: 'spells', field: 'spells' },
];
const TEMPLATE: StatblockTemplate = templateOf(FIELDS, BLOCKS);
const ACTIONS = [{ name: 'Bite', desc: 'Teeth.', cost: 'Action' }, { name: 'Bite', desc: 'Teeth.', cost: 'Action' }];
const NOTE: Record<string, unknown> = {
  name: 'Ana', level: 3, type: 'Humanoid', hp: 12, ac: 15, size: 'Small', actions: ACTIONS, traits: [{ name: 'Keen', desc: 'Sees far.' }],
  spells: ['Ana casts with Wits:', { '1st level': 'bless, shield' }],
};
const HP: ResourceDefinition = { key: 'hp', name: 'HP', field: 'hp', direction: 'drains', color: '#aa0000', visibleToPlayers: true };

const input = (extra: Partial<StatblockSheetInput> = {}, template = TEMPLATE, note = NOTE): StatblockSheetInput => ({ resolved: resolvedOf(template, note), definitions: [HP], resources: { hp: { current: 5, max: 12 } }, ...extra });

function fieldsOf(value: unknown): unknown[] {
  if (Array.isArray(value)) return value.flatMap(fieldsOf);
  if (value === null || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  return [...(record.field ? [record.field] : []), ...Object.values(record).flatMap(fieldsOf)];
}

describe('a player\'s own statblock', () => {
  it('is drawn only for a native Atlas statblock', () => {
    expect(statblockSheet(input())).not.toBeNull();
    for (const source of [{ kind: 'fs-frontmatter' }, { kind: 'fs-fence', params: {} }] as const) {
      expect(statblockSheet({ ...input(), resolved: { ...resolvedOf(TEMPLATE, NOTE), source } })).toBeNull();
    }
    expect(statblockSheet({ ...input(), resolved: resolvedOf(TEMPLATE, NOTE, 'auto') })).toBeNull();
    expect(statblockSheet({ ...input(), resolved: { ...resolvedOf(TEMPLATE, NOTE), template: null } })).toBeNull();
  });

  it('may not be changed where its template is missing or of a newer Atlas', () => {
    for (const status of ['missing', 'newer'] as const) {
      const statblock = statblockSheet({ ...input(), resolved: resolvedOf(TEMPLATE, NOTE, status) })!;
      expect(statblock.editable).toBe(false);
      expect(fieldsOf(statblock)).toEqual([]);
      expect(statblock.abilities.every((component) => component.access === 'read')).toBe(true);
      expect(parseBookStatblock(statblock)).toEqual(statblock);
    }
  });

  it('draws the header as sigils, hit points from the character\'s resource, and the armour once', () => {
    const statblock = statblockSheet(input())!;
    expect(statblock.displayName).toBe('Ana');
    expect(statblock.sigils).toMatchObject({
      hp: { label: 'Hit points', text: { opening: '12' }, resource: 'hp', field: { key: 'hp', type: 'number', value: 12 } },
      armor: { label: 'Armour', text: { opening: '15' } },
      level: { label: 'Level', text: { opening: '3' } },
      type: { label: 'Kind', text: { opening: 'Humanoid' } },
    });
    expect(JSON.stringify(statblock.blocks)).not.toContain('Armour');
    expect(statblockSheet(input({ resources: {} }))!.sigils.hp?.resource).toBeUndefined();
  });

  it('offers each value the player may change with its stored value and its base, and an empty one with its prompt', () => {
    const statblock = statblockSheet(input())!;
    const [speed, size] = statblock.blocks as Extract<SheetNode, { k: 'value' }>[];
    expect(speed?.value).toMatchObject({ label: 'Speed', text: { opening: '' }, prompt: 'Add speed', field: { key: 'speed', value: null, base: entryItemKeys([undefined as never])[0] } });
    expect(size?.value).toMatchObject({ label: 'Size', text: { opening: 'Small' }, field: { key: 'size', type: 'choice', options: ['Small', 'Medium'], value: 'Small', base: entryItemKeys(['Small'])[0] } });
    const read = statblockSheet(input({}, { ...TEMPLATE, players: { size: 'read', speed: 'read' } }))!;
    expect(read.blocks).toHaveLength(1);
    expect(read.blocks[0]).toMatchObject({ k: 'value', value: { label: 'Size', field: null } });
  });

  it('never offers the name or the token art', () => {
    const template = templateOf(FIELDS, [{ id: 'name0001', type: 'title', field: 'name', level: 2 }]);
    const statblock = statblockSheet(input({}, { ...template, players: { name: 'edit' } }))!;
    expect(statblock.blocks).toMatchObject([{ k: 'value', value: { text: { opening: 'Ana' }, field: null } }]);
  });

  it('puts every Abilities component in the Abilities tab under its name, its abilities named as the GM\'s Atlas names them', () => {
    const statblock = statblockSheet(input())!;
    const [combat, features, spells] = statblock.abilities;
    expect(combat).toMatchObject({ id: 'tabs0001', name: 'Combat', access: 'edit', parts: [{ key: 'cost', label: 'Cost', type: 'choice', options: ['Action', 'Bonus action'] }] });
    expect(combat?.tabs.map((tab) => [tab.label, tab.list])).toEqual([['Actions', 'actions'], ['Bonus', 'bonus']]);
    expect(combat?.tabs[0]?.entries.map((entry) => entry.key)).toEqual(entryItemKeys(ACTIONS));
    expect(combat?.tabs[0]?.entries[0]).toEqual({ key: entryItemKeys(ACTIONS)[0], name: 'Bite', text: { opening: 'Teeth.' }, parts: { cost: 'Action' } });
    expect(features).toMatchObject({ name: 'Features', access: 'edit', tabs: [{ label: null, list: 'traits' }] });
    expect(spells).toMatchObject({ name: 'Spells', access: 'read', spells: true });
    expect(spells?.tabs).toMatchObject([{ label: '1st level', intro: { opening: 'Ana casts with Wits:' }, entries: [{ name: 'bless' }, { name: 'shield' }] }]);
    expect(JSON.stringify(statblock.blocks)).not.toContain('Bite');
  });

  it('names a list by its own heading, else by its property, and lets the player only read one the template says so', () => {
    const template = templateOf(FIELDS, [{ id: 'list0001', type: 'entries', field: 'actions', heading: 'Deeds' }, { id: 'list0003', type: 'entries', field: 'traits' }]);
    const statblock = statblockSheet(input({}, { ...template, players: { traits: 'read' } }))!;
    expect(statblock.abilities.map((component) => [component.name, component.access])).toEqual([['Deeds', 'edit'], ['Traits', 'read']]);
    const tabs = statblockSheet(input({}, { ...TEMPLATE, players: { bonus: 'read' } }))!;
    expect(tabs.abilities[0]?.access).toBe('read');
  });
});
