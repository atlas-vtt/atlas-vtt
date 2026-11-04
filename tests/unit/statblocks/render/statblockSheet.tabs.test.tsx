// @vitest-environment jsdom
import React from 'react';
import { act, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';


import type { TemplateBlock, TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { foldedBlocks } from '../../../../src/app/statblocks/render/foldRule';
import { StatblockSheet } from '../../../../src/app/statblocks/render/StatblockSheet';
import { EMPTY_TAB_PROMPT } from '../../../../src/app/statblocks/render/blocks/SectionView';
import { blockEl, renderSheet, templateOf } from './sheetTestKit';

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'actions', label: 'Actions', type: 'entries' },
  { key: 'reactions', label: 'Reactions', type: 'entries' },
  { key: 'lair', label: 'Lair', type: 'markdown' },
  { key: 'school', label: 'School', type: 'text' },
  { key: 'spells', label: 'Spells', type: 'spells' },
];

const TABS: TemplateBlock = {
  id: 'tabs0001', type: 'tabs', blocks: [
    { id: 'tabactn1', type: 'section', heading: 'Actions', blocks: [{ id: 'actions1', type: 'entries', field: 'actions' }] },
    { id: 'tabreac1', type: 'section', heading: 'Reactions', blocks: [{ id: 'reacts01', type: 'entries', field: 'reactions' }] },
    { id: 'tablair1', type: 'section', headingField: 'school', blocks: [{ id: 'lairtext', type: 'text', field: 'lair' }] },
  ],
};

const TEMPLATE = templateOf(FIELDS, [TABS]);
const BITE = [{ name: 'Bite', desc: 'One target.' }];
const PARRY = [{ name: 'Parry', desc: 'Adds 2 to its AC.' }];

const tabNames = (container: HTMLElement): string[] =>
  [...container.querySelectorAll('[role="tab"]')].map((tab) => tab.textContent ?? '');
const openPanel = (container: HTMLElement): HTMLElement | null =>
  container.querySelector<HTMLElement>('[role="tabpanel"]:not([hidden])');

describe('StatblockSheet: tabs', () => {
  it('reads as WAI-ARIA tabs, the first open, each Section\'s heading on its tab and not again in its panel', () => {
    const { container } = renderSheet(TEMPLATE, { actions: BITE, reactions: PARRY, lair: 'Damp.', school: 'Lair' });
    expect(blockEl(container, 'tabs0001')?.getAttribute('data-type')).toBe('group');
    expect(tabNames(container)).toEqual(['Actions', 'Reactions', 'Lair']);
    const [first, second] = [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    expect(first?.getAttribute('aria-selected')).toBe('true');
    expect(first?.tabIndex).toBe(0);
    expect(second?.tabIndex).toBe(-1);
    const panel = openPanel(container);
    expect(panel?.getAttribute('aria-labelledby')).toBe(first?.id);
    expect(first?.getAttribute('aria-controls')).toBe(panel?.id);
    expect(panel?.textContent).toContain('Bite');
    expect(panel?.querySelector('.atlas-sb-section-heading')).toBeNull();
    expect(container.querySelectorAll('[role="tabpanel"][hidden]')).toHaveLength(2);
  });

  it('opens a tab on a click, and moves with the arrow keys, Home and End', () => {
    const { container } = renderSheet(TEMPLATE, { actions: BITE, reactions: PARRY, lair: 'Damp.', school: 'Lair' });
    const tabs = (): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('[role="tab"]')];
    fireEvent.click(tabs()[1] as HTMLElement);
    expect(openPanel(container)?.textContent).toContain('Parry');
    const strip = container.querySelector('[role="tablist"]') as HTMLElement;
    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(openPanel(container)?.textContent).toContain('Damp.');
    expect(tabs()[2]?.ownerDocument.activeElement).toBe(tabs()[2]);
    fireEvent.keyDown(strip, { key: 'ArrowRight' });
    expect(openPanel(container)?.textContent).toContain('Bite');
    fireEvent.keyDown(strip, { key: 'End' });
    expect(tabs()[2]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(strip, { key: 'Home' });
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(strip, { key: 'ArrowLeft' });
    expect(tabs()[2]?.getAttribute('aria-selected')).toBe('true');
  });

  it('shows a tab only for a Section that shows something, and no Tabs block where none does', () => {
    const some = renderSheet(TEMPLATE, { reactions: PARRY });
    expect(tabNames(some.container)).toEqual(['Reactions']);
    expect(openPanel(some.container)?.textContent).toContain('Parry');
    some.unmount();

    const none = renderSheet(TEMPLATE, { name: 'Wisp' });
    expect(blockEl(none.container, 'tabs0001')).toBeNull();
  });

  it('says where to start in an empty tab while editing, and nothing read-only', () => {
    const empty: TemplateBlock = { id: 'tabs0002', type: 'tabs', blocks: [
      { id: 'tabone01', type: 'section', heading: 'Actions', blocks: [] },
      { id: 'tabtwo01', type: 'section', heading: 'Reactions', blocks: [{ id: 'reacts02', type: 'entries', field: 'reactions' }] },
    ] };
    const editing = renderSheet(templateOf(FIELDS, [empty]), {}, { mode: 'editing' });
    expect(openPanel(editing.container)?.querySelector('.atlas-sb-empty-tab')?.textContent).toBe(EMPTY_TAB_PROMPT);
    editing.unmount();
    const { container } = renderSheet(templateOf(FIELDS, [empty]), { reactions: PARRY });
    expect(tabNames(container)).toEqual(['Reactions']);
    expect(container.querySelector('.atlas-sb-empty-tab')).toBeNull();
  });

  it('draws the block\'s own heading above the strip, and none where it is blank', () => {
    const headed = renderSheet(templateOf(FIELDS, [{ ...TABS, heading: 'Spellbook' }]), { actions: BITE });
    const heading = blockEl(headed.container, 'tabs0001')?.querySelector('.atlas-sb-section-heading');
    expect(heading?.textContent).toBe('Spellbook');
    expect(heading?.nextElementSibling?.getAttribute('role')).toBe('tablist');
    headed.unmount();
    const blank = renderSheet(templateOf(FIELDS, [{ ...TABS, heading: '  ' }]), { actions: BITE });
    expect(blockEl(blank.container, 'tabs0001')?.querySelector('.atlas-sb-section-heading')).toBeNull();
  });

  it('shows every tab while editing, an unnamed one as "Tab n"', () => {
    const { container } = renderSheet(TEMPLATE, {}, { mode: 'editing' });
    expect(tabNames(container)).toEqual(['Actions', 'Reactions', 'Tab 3']);
  });

  it('opens the tabs that hold the block to reveal, whenever it changes', () => {
    const view = renderSheet(TEMPLATE, {}, { mode: 'editing', reveal: 'reacts01' });
    expect(openPanel(view.container)?.querySelector('[data-block-id="reacts01"]')).not.toBeNull();
    act(() => {
      view.rerender(<RevealSheet reveal="lairtext" />);
    });
    expect(openPanel(view.container)?.querySelector('[data-block-id="lairtext"]')).not.toBeNull();
  });

  it('never folds a tab\'s Section into a chip: the tab stays and holds the prompts', () => {
    const headed = templateOf(FIELDS, [TABS, { id: 'sectlair', type: 'section', heading: 'Lair', blocks: [{ id: 'lair0002', type: 'text', field: 'lair' }] }]);
    expect(foldedBlocks(headed, {}).map((block) => block.blockId)).toEqual(['sectlair']);
  });
});

describe('StatblockSheet: spells as tabs', () => {
  const SPELLS = [
    'The mage casts with Intelligence:',
    { 'Cantrips (at will)': 'light, mage hand' },
    { '1st level (4 slots)': 'magic missile, shield' },
  ];

  it('keeps the lines by default, and with the tabs look puts each level on a tab under the loose lines', () => {
    const lines = renderSheet(templateOf(FIELDS, [{ id: 'spells01', type: 'spells', field: 'spells' }]), { spells: SPELLS });
    expect(lines.container.querySelector('[role="tablist"]')).toBeNull();
    lines.unmount();

    const { container } = renderSheet(templateOf(FIELDS, [{ id: 'spells01', type: 'spells', field: 'spells', look: 'tabs' }]), { spells: SPELLS });
    expect(container.querySelector('.atlas-sb-spell-header')?.textContent).toBe('The mage casts with Intelligence:');
    expect(tabNames(container)).toEqual(['Cantrips (at will)', '1st level (4 slots)']);
    expect(openPanel(container)?.textContent).toBe('light, mage hand');
    fireEvent.click(container.querySelectorAll('[role="tab"]')[1] as HTMLElement);
    expect(openPanel(container)?.textContent).toBe('magic missile, shield');
  });
});

function RevealSheet({ reveal }: { reveal: string }): React.JSX.Element {
  return <StatblockSheet template={TEMPLATE} fields={{}} name="Test template" variant="full" mode="editing" reveal={reveal} />;
}
