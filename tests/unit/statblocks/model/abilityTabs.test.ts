import { describe, expect, it } from 'vitest';
import { abilityFieldKeys, withAbilityParts } from '../../../../src/app/statblocks/model/abilityParts';
import { addAbilityTab, removeAbilityTab, splitAbilities } from '../../../../src/app/statblocks/model/abilityTabs';
import {
  TEMPLATE_FORMAT, TEMPLATE_VERSION, type EntryExtraShape, type StatblockTemplate, type TabsBlock, type TemplateBlock, type TemplateField,
} from '../../../../src/app/statblocks/model/templateTypes';
import { deepFreeze } from './treeFixtures';

function templateOf(blocks: TemplateBlock[], fields: TemplateField[]): StatblockTemplate {
  return deepFreeze({ format: TEMPLATE_FORMAT, version: TEMPLATE_VERSION, id: 'abilities-abc123', fields, layout: { maxColumns: 1, blocks } });
}

const RANGE: EntryExtraShape = { key: 'range', label: 'Range', type: 'text' };
const ACTION: EntryExtraShape = { key: 'type', label: 'Type', type: 'choice', options: ['Main action', 'Reaction'] };

const ACTIONS: TemplateField = { key: 'actions', label: 'Actions', type: 'entries', entry: { nameKey: 'title', extras: [RANGE] } };
const LIST: TemplateBlock = { id: 'actions1', type: 'entries', field: 'actions', heading: 'Spellbook' };

const tabsOf = (template: StatblockTemplate): TabsBlock => {
  const block = template.layout.blocks[0];
  if (block?.type !== 'tabs') throw new Error('no tabs');
  return block;
};

describe('splitting an Abilities list into tabs', () => {
  it('keeps the list\'s name on the Tabs block, names the tabs "Tab 1" and "Tab 2", and gives the second the parts', () => {
    const split = splitAbilities(templateOf([LIST], [ACTIONS]), 'actions1');
    expect(split.ok).toBe(true);
    const tabs = tabsOf(split.template);
    expect(tabs).toMatchObject({
      heading: 'Spellbook',
      blocks: [
        { type: 'section', heading: 'Tab 1', blocks: [{ id: 'actions1', type: 'entries', field: 'actions' }] },
        { type: 'section', heading: 'Tab 2', blocks: [{ type: 'entries', field: 'tab_2' }] },
      ],
    });
    expect(tabs.blocks[0]?.type === 'section' && tabs.blocks[0].blocks[0]).not.toHaveProperty('heading');
    expect(split.template.fields.find((field) => field.key === 'tab_2')).toMatchObject({ entry: ACTIONS.entry });
  });
});

describe('the last tab but one going', () => {
  const twoTabs = (heading: string | undefined): StatblockTemplate => templateOf([{
    id: 'tabs0001', type: 'tabs', ...(heading !== undefined && { heading }), blocks: [
      { id: 'tab00001', type: 'section', heading: 'Cantrips', blocks: [{ id: 'actions1', type: 'entries', field: 'actions' }] },
      { id: 'tab00002', type: 'section', heading: 'Level 1', blocks: [{ id: 'level101', type: 'entries', field: 'level_1' }] },
    ],
  }], [ACTIONS, { key: 'level_1', label: 'Level 1', type: 'entries' }]);

  it('leaves a plain list under the Tabs block\'s heading', () => {
    const removed = removeAbilityTab(twoTabs('Spellbook'), 'tabs0001', 'tab00002');
    expect(removed).toMatchObject({ ok: true, focus: 'actions1' });
    expect(removed.template.layout.blocks).toEqual([{ id: 'actions1', type: 'entries', field: 'actions', heading: 'Spellbook' }]);
  });

  it('heads it with the tab\'s name where the Tabs block has no heading', () => {
    for (const heading of [undefined, '  ']) {
      const removed = removeAbilityTab(twoTabs(heading), 'tabs0001', 'tab00001');
      expect(removed.template.layout.blocks).toEqual([{ id: 'level101', type: 'entries', field: 'level_1', heading: 'Level 1' }]);
    }
  });

  it('keeps the Tabs block and its heading while two tabs or more are left', () => {
    const added = addAbilityTab(twoTabs('Spellbook'), 'tabs0001');
    const removed = removeAbilityTab(added.template, 'tabs0001', 'tab00001');
    expect(tabsOf(removed.template)).toMatchObject({ heading: 'Spellbook', blocks: [{ id: 'tab00002' }, {}] });
  });
});

describe('the parts every ability has', () => {
  const TABS: TemplateBlock = { id: 'tabs0001', type: 'tabs', heading: 'Spellbook', blocks: [
    { id: 'tab00001', type: 'section', heading: 'Cantrips', blocks: [{ id: 'actions1', type: 'entries', field: 'actions' }] },
    { id: 'tab00002', type: 'section', heading: 'Level 1', blocks: [{ id: 'level101', type: 'entries', field: 'level_1' }] },
    { id: 'tab00003', type: 'section', heading: 'Again', blocks: [{ id: 'again001', type: 'entries', field: 'actions' }] },
  ] };
  const LEVEL_1: TemplateField = { key: 'level_1', label: 'Level 1', type: 'entries', entry: { textKey: 'body', extras: [{ key: 'old', label: 'Old', type: 'text' }] } };

  it('belong to the list\'s property, or to each tab\'s list\'s, each once, and to no other block', () => {
    expect(abilityFieldKeys(LIST)).toEqual(['actions']);
    expect(abilityFieldKeys(TABS)).toEqual(['actions', 'level_1']);
    expect(abilityFieldKeys({ id: 'stat0001', type: 'stat', field: 'ac', look: 'run-in' })).toEqual([]);
    expect(abilityFieldKeys({ id: 'tabs0002', type: 'tabs', blocks: [{ id: 'sect0001', type: 'section', blocks: [] }] })).toEqual([]);
  });

  it('are edited from the first list\'s and written to every tab\'s, keeping each property\'s own keys', () => {
    const source = templateOf([TABS], [ACTIONS, LEVEL_1]);
    const edited = withAbilityParts(source, abilityFieldKeys(TABS), (extras) => [...extras, ACTION]);
    expect(edited.fields).toEqual([
      { ...ACTIONS, entry: { nameKey: 'title', extras: [RANGE, ACTION] } },
      { ...LEVEL_1, entry: { textKey: 'body', extras: [RANGE, ACTION] } },
    ]);
  });

  it('go from every property when the last is removed, and an edit that changes nothing gives the very template back', () => {
    const source = templateOf([TABS], [{ key: 'actions', label: 'Actions', type: 'entries', entry: { extras: [RANGE] } }, LEVEL_1]);
    const emptied = withAbilityParts(source, ['actions', 'level_1'], () => []);
    expect(emptied.fields.map((field) => field.entry)).toEqual([undefined, { textKey: 'body' }]);
    expect(withAbilityParts(emptied, ['actions', 'level_1'], (extras) => extras)).toBe(emptied);
    expect(withAbilityParts(source, ['missing'], () => [ACTION])).toBe(source);
  });
});
