import { describe, expect, it } from 'vitest';
import { insertBlock, moveBlock } from '../../../../src/app/statblocks/model/treeOps';
import { findBlock } from '../../../../src/app/statblocks/model/treeQueries';
import { addTab, splitIntoTabs, tabsHolding } from '../../../../src/app/statblocks/model/treeTabs';
import { turnInto } from '../../../../src/app/statblocks/model/turnInto';
import type { TemplateBlock, TemplateField, TemplateLayout } from '../../../../src/app/statblocks/model/templateTypes';
import { deepFreeze, idsFrom } from './treeFixtures';

const fields: TemplateField[] = [{ key: 'spells', label: 'Spells', type: 'spells' }];

function layoutOf(...blocks: TemplateBlock[]): TemplateLayout {
  return deepFreeze({ maxColumns: 2, blocks });
}

const TAB_SECTIONS: TemplateBlock[] = [
  { id: 'tab00001', type: 'section', heading: 'Tab 1', blocks: [{ id: 'actions1', type: 'entries', field: 'actions' }] },
  { id: 'tab00002', type: 'section', heading: 'Tab 3', blocks: [] },
];
const TABS: TemplateBlock = { id: 'tabs0001', type: 'tabs', blocks: TAB_SECTIONS };

describe('addTab', () => {
  it('appends an empty tab headed with the first free "Tab n", focused, leaving the input as it was', () => {
    const layout = layoutOf(TABS);
    const edit = addTab(layout, 'tabs0001', idsFrom('tab00003'));
    expect(edit).toMatchObject({ ok: true, focus: 'tab00003' });
    expect(findBlock(edit.layout.blocks, 'tab00003')).toMatchObject({
      parentId: 'tabs0001', index: 2, block: { type: 'section', heading: 'Tab 4', blocks: [] },
    });
    expect(layout.blocks[0]).toBe(TABS);
  });

  it('refuses a block that is no Tabs block, an unknown id and an id already used', () => {
    const layout = layoutOf(TABS);
    expect(addTab(layout, 'tab00001', idsFrom('fresh001'))).toMatchObject({ ok: false, reason: 'wrong-type', layout });
    expect(addTab(layout, 'missing0', idsFrom('fresh001'))).toMatchObject({ ok: false, reason: 'block-not-found' });
    expect(addTab(layout, 'tabs0001', idsFrom('actions1'))).toMatchObject({ ok: false, reason: 'duplicate-id' });
  });
});

describe('splitIntoTabs', () => {
  it('makes the list the first tab, "Tab 1", beside an empty "Tab 2", in the list\'s place, the Tabs block keeping its heading', () => {
    const layout = layoutOf(
      { id: 'divider1', type: 'divider' },
      { id: 'spells01', type: 'spells', field: 'spells', heading: 'Spellcasting', className: 'magic' },
    );
    const edit = splitIntoTabs(layout, 'spells01', idsFrom('first001', 'second01', 'tabs0001'));
    expect(edit).toMatchObject({ ok: true, focus: 'tabs0001' });
    expect(edit.layout.blocks[1]).toStrictEqual({
      id: 'tabs0001', type: 'tabs', heading: 'Spellcasting', blocks: [
        { id: 'first001', type: 'section', heading: 'Tab 1', blocks: [{ id: 'spells01', type: 'spells', field: 'spells', className: 'magic' }] },
        { id: 'second01', type: 'section', heading: 'Tab 2', blocks: [] },
      ],
    });
  });

  it('gives the Tabs block no heading where the list has none, and keeps a label on the list', () => {
    const layout = layoutOf(
      { id: 'tags0001', type: 'tags', field: 'traits', label: 'Traits', look: 'chips' },
      { id: 'entries1', type: 'entries', field: 'actions', heading: '  ' },
    );
    const edit = splitIntoTabs(layout, 'tags0001', idsFrom('first001', 'second01', 'tabs0001'));
    expect(findBlock(edit.layout.blocks, 'first001')?.block).toMatchObject({ heading: 'Tab 1', blocks: [{ label: 'Traits' }] });
    expect(findBlock(edit.layout.blocks, 'tabs0001')?.block).not.toHaveProperty('heading');
    const blank = splitIntoTabs(layout, 'entries1', idsFrom('first001', 'second01', 'tabs0001'));
    expect(findBlock(blank.layout.blocks, 'tabs0001')?.block).not.toHaveProperty('heading');
    expect(findBlock(blank.layout.blocks, 'entries1')?.block).not.toHaveProperty('heading');
  });

  it('refuses what is no list, and a list in a Side by side, where Tabs may not stand', () => {
    const layout = layoutOf(
      { id: 'stat0001', type: 'stat', field: 'ac', look: 'run-in' },
      { id: 'row00001', type: 'row', blocks: [{ id: 'pairs001', type: 'pairs', field: 'saves' }] },
    );
    expect(splitIntoTabs(layout, 'stat0001', idsFrom('a', 'b', 'c'))).toMatchObject({ ok: false, reason: 'wrong-type', layout });
    expect(splitIntoTabs(layout, 'pairs001', idsFrom('a', 'b', 'c'))).toMatchObject({ ok: false, reason: 'not-allowed-here', layout });
    expect(splitIntoTabs(layout, 'missing0', idsFrom('a', 'b', 'c'))).toMatchObject({ ok: false, reason: 'block-not-found' });
  });
});

describe('tabs in the tree', () => {
  it('take Sections only, and never stand in a Side by side', () => {
    const layout = layoutOf(TABS, { id: 'row00001', type: 'row', blocks: [] });
    expect(insertBlock(layout, { id: 'stat0001', type: 'stat', field: 'ac', look: 'run-in' }, { parentId: 'tabs0001', index: 0 }))
      .toMatchObject({ ok: false, reason: 'not-allowed-here' });
    expect(insertBlock(layout, { id: 'sect0001', type: 'section', blocks: [] }, { parentId: 'tabs0001', index: 2 })).toMatchObject({ ok: true });
    expect(moveBlock(layout, 'tabs0001', { parentId: 'row00001', index: 0 })).toMatchObject({ ok: false, reason: 'not-allowed-here' });
    expect(moveBlock(layout, 'actions1', { parentId: 'tabs0001', index: 0 })).toMatchObject({ ok: false, reason: 'not-allowed-here' });
  });

  it('turn into a Section or Side by side and back, where the place and the children allow it', () => {
    const layout = layoutOf(TABS, { id: 'sect0001', type: 'section', blocks: [{ id: 'stat0001', type: 'stat', field: 'ac', look: 'run-in' }] });
    expect(turnInto(layout, 'tabs0001', 'section', fields).layout.blocks[0]).toMatchObject({ id: 'tabs0001', type: 'section', blocks: TAB_SECTIONS });
    expect(turnInto(layout, 'tabs0001', 'row', fields)).toMatchObject({ ok: true });
    expect(turnInto(layout, 'sect0001', 'tabs', fields)).toMatchObject({ ok: false, reason: 'not-allowed-here' });
    expect(turnInto(layout, 'tab00001', 'tabs', fields)).toMatchObject({ ok: false, reason: 'not-allowed-here' });
    expect(turnInto(layout, 'tab00001', 'row', fields)).toMatchObject({ ok: false, reason: 'not-allowed-here' });
    expect(turnInto(layout, 'stat0001', 'tabs', fields)).toMatchObject({ ok: false, reason: 'cannot-turn-into' });
  });

  it('keep their heading as a Section and back, and lose it as a Side by side', () => {
    const layout = layoutOf({ ...TABS, heading: 'Spellbook' } as TemplateBlock);
    const section = turnInto(layout, 'tabs0001', 'section', fields);
    expect(section.layout.blocks[0]).toMatchObject({ type: 'section', heading: 'Spellbook' });
    expect(turnInto(section.layout, 'tabs0001', 'tabs', fields).layout.blocks[0]).toMatchObject({ type: 'tabs', heading: 'Spellbook' });
    expect(turnInto(layout, 'tabs0001', 'row', fields).layout.blocks[0]).not.toHaveProperty('heading');
  });

  it('name the tabs that hold a block, outermost first', () => {
    const inner: TemplateBlock = { id: 'inner001', type: 'tabs', blocks: [{ id: 'innertab', type: 'section', blocks: [{ id: 'deep0001', type: 'divider' }] }] };
    const layout = layoutOf({ id: 'outer001', type: 'tabs', blocks: [{ id: 'outertab', type: 'section', blocks: [inner] }] }, { id: 'loose001', type: 'divider' });
    expect(tabsHolding(layout.blocks, 'deep0001')).toEqual([
      { tabsId: 'outer001', sectionId: 'outertab' },
      { tabsId: 'inner001', sectionId: 'innertab' },
    ]);
    expect(tabsHolding(layout.blocks, 'outertab')).toEqual([{ tabsId: 'outer001', sectionId: 'outertab' }]);
    expect(tabsHolding(layout.blocks, 'outer001')).toEqual([]);
    expect(tabsHolding(layout.blocks, 'loose001')).toEqual([]);
    expect(tabsHolding(layout.blocks, 'missing0')).toEqual([]);
  });
});
