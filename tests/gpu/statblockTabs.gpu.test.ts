import '../setup/obsidianDom';
import React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import type { SectionBlock, TemplateBlock, TemplateField } from '../../src/app/statblocks/model/templateTypes';
import { StatblockSheet } from '../../src/app/statblocks/render/StatblockSheet';
import { FakeSession, shape, template } from '../unit/statblocks/template-editor/editorKit';
import { centreOf, mouse, pressAndMove } from './realMouse';
import { frame, frames, mount, useEditorStyles, wait } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const FIELDS: TemplateField[] = [
  { key: 'name', label: 'Name', type: 'text' },
  { key: 'actions', label: 'Actions', type: 'entries' },
  { key: 'reactions', label: 'Reactions', type: 'entries' },
  { key: 'lair', label: 'Lair', type: 'markdown' },
  { key: 'ac', label: 'Armor class', type: 'number' },
];

const ACTIONS_TAB: SectionBlock = { id: 'tabactn1', type: 'section', heading: 'Actions', blocks: [{ id: 'actions1', type: 'entries', field: 'actions' }] };
const REACTIONS_TAB: SectionBlock = { id: 'tabreac1', type: 'section', heading: 'Reactions', blocks: [{ id: 'reacts01', type: 'entries', field: 'reactions' }] };
const LAIR_TAB: SectionBlock = { id: 'tablair1', type: 'section', heading: 'Lair', blocks: [{ id: 'lairtext', type: 'text', field: 'lair' }] };
/** Tabs that hold more than lists of abilities: in the template editor a tile shown as it renders. */
const TABS: TemplateBlock = { id: 'tabs0001', type: 'tabs', blocks: [ACTIONS_TAB, REACTIONS_TAB, LAIR_TAB] };
/** A list of abilities split into tabs: one Abilities tile, whose Options name its tabs. */
const ABILITY_TABS: TemplateBlock = { id: 'abiltabs', type: 'tabs', blocks: [ACTIONS_TAB, REACTIONS_TAB] };
const VALUES = { name: 'Bog hag', actions: [{ name: 'Claw', desc: 'One target.' }], lair: 'A drowned mill.' };

/** Long enough for a drop to settle, and for the Options popover to open. */
const SETTLED_MS = 260;
/** The platform's own select-all key in a text field. */
const SELECT_ALL = navigator.platform.includes('Mac') ? '{Meta>}a{/Meta}' : '{Control>}a{/Control}';

const tabs = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.atlas-sb-sheet [role="tab"]')];
const tabNames = (): string[] => tabs().map((tab) => tab.textContent ?? '');
const openPanel = (): HTMLElement | null => document.querySelector<HTMLElement>('.atlas-sb-sheet [role="tabpanel"]:not([hidden])');
const selected = (): string | null | undefined => document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id');
const live = (): string => document.querySelector('.atlas-te-live')?.textContent?.trim() ?? '';
const gridShape = (session: FakeSession): string => shape(session.template.layout.blocks);
const toolbarName = (): string | null | undefined => document.querySelector('.atlas-te-toolbar')?.getAttribute('aria-label');
/** The selected tile's Options; the newest, where one before is still fading out. */
const options = (): HTMLElement | undefined => [...document.querySelectorAll<HTMLElement>('.atlas-te-options:not([data-closing])')].at(-1);
const optionsButton = (label: string): HTMLButtonElement | undefined =>
  [...(options()?.querySelectorAll('button') ?? [])].find((button) => button.textContent?.trim() === label);
const tabNameInputs = (): HTMLInputElement[] => [...(options()?.querySelectorAll<HTMLInputElement>('input[aria-label="Tab name"]') ?? [])];
const dockButton = (label: string): HTMLButtonElement =>
  [...document.querySelectorAll<HTMLButtonElement>('.atlas-te-dock button')].find((button) => button.textContent === label)!;

async function clickAt(element: Element): Promise<void> {
  const { x, y } = centreOf(element);
  await act(async () => {
    await mouse.hover(x, y);
    await mouse.click(x, y);
    await frames(3);
  });
}

/** Opens the selected tile's Options with its toolbar's button. */
async function openOptions(): Promise<HTMLElement> {
  await clickAt(document.querySelector('.atlas-te-toolbar [data-options] button')!);
  await act(() => wait(SETTLED_MS));
  const shown = options();
  if (!shown) throw new Error('No Options opened.');
  return shown;
}

/** Drags a tile by its handle to a point of the card and lets go there; says what the live region announced on the way. */
async function dragTo(id: string, to: { x: number; y: number }): Promise<{ line: { y: number; orientation: string } | null; said: string }> {
  const { x, y } = centreOf(frame(id));
  await mouse.hover(x, y);
  await frames(2);
  const handle = document.querySelector<HTMLElement>('.atlas-sb-handle[data-glyph="grip"]');
  if (!handle) throw new Error(`No handle for ${id}.`);
  await pressAndMove(centreOf(handle), to, 16);
  await frames(2);
  const shown = document.querySelector<HTMLElement>('.atlas-te-drop-line');
  const line = shown ? { y: centreOf(shown).y, orientation: shown.dataset.orientation ?? '' } : null;
  const said = live();
  await act(async () => {
    await mouse.up(to.x, to.y);
    await wait(SETTLED_MS);
  });
  return { line, said };
}

/**
 * Tabs with real mouse and keyboard input: the read-only card shows a tab
 * only for a Section that shows something and the editing card every one,
 * clicks and the arrow keys open tabs. In the template editor's grid a Tabs
 * block is one tile: an Abilities tile's Options split its list into tabs
 * and add, name and remove them, each one undo step, and nothing is selected
 * in or dropped into a tab.
 */
describe('tabs on the statblock card', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  it('switches with a click and the arrow keys, and shows the open tab in the accent', async () => {
    render(React.createElement(StatblockSheet, { template: template([TABS], FIELDS), fields: VALUES, name: 'Hags', variant: 'full' }));
    await frames(2);
    expect(tabNames()).toEqual(['Actions', 'Lair']);
    expect(openPanel()?.textContent).toContain('Claw');
    await clickAt(tabs()[1]!);
    expect(openPanel()?.textContent).toContain('A drowned mill.');
    expect(document.activeElement).toBe(tabs()[1]);
    const open = getComputedStyle(tabs()[1]!);
    expect(open.borderBottomColor).toBe('rgb(127, 109, 242)');
    expect(getComputedStyle(tabs()[0]!).borderBottomColor).not.toBe(open.borderBottomColor);
    expect(getComputedStyle(document.querySelector('.atlas-sb-tabs')!).breakInside).toBe('avoid');

    await userEvent.keyboard('{ArrowLeft}');
    expect(openPanel()?.textContent).toContain('Claw');
    expect(document.activeElement).toBe(tabs()[0]);
    await userEvent.keyboard('{End}');
    expect(tabs()[1]?.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowRight}');
    expect(tabs()[0]?.getAttribute('aria-selected')).toBe('true');
  });

  it('leaves out an empty Section\'s tab when read, and shows it while editing', async () => {
    const view = render(React.createElement(StatblockSheet, { template: template([TABS], FIELDS), fields: VALUES, name: 'Hags', variant: 'full' }));
    expect(tabNames()).toEqual(['Actions', 'Lair']);
    view.unmount();
    render(React.createElement(StatblockSheet, { template: template([TABS], FIELDS), fields: VALUES, name: 'Hags', variant: 'full', mode: 'editing' }));
    expect(tabNames()).toEqual(['Actions', 'Reactions', 'Lair']);
  });
});

describe('tabs in the template editor', () => {
  useEditorStyles();
  afterEach(() => cleanup());

  const NAME: TemplateBlock = { id: 'title001', type: 'title', field: 'name', level: 1 };
  const LIST: TemplateBlock = { id: 'actions1', type: 'entries', field: 'actions', heading: 'Actions' };
  const VALUE: TemplateBlock = { id: 'stat-ac1', type: 'stat', field: 'ac', look: 'run-in' };
  const tabsShape = 'tabs0001(tabactn1(actions1) tabreac1(reacts01) tablair1(lairtext))';

  it('splits an Abilities tile into tabs from its Options, one undo step, and goes on as that one tile with its tabs to name', async () => {
    const session = new FakeSession(template([NAME, LIST], FIELDS));
    mount(session, 1280);
    await frames(2);
    await clickAt(frame('actions1'));
    expect(toolbarName()).toBe('Abilities toolbar');
    await openOptions();
    await clickAt(optionsButton('Split into tabs')!);

    const [, tabsBlock] = session.template.layout.blocks;
    // The tile keeps its name above the strip; its tabs are named "Tab 1" and "Tab 2".
    expect(tabsBlock).toMatchObject({
      type: 'tabs',
      heading: 'Actions',
      blocks: [{ heading: 'Tab 1', blocks: [{ id: 'actions1' }] }, { heading: 'Tab 2', blocks: [{ type: 'entries', field: 'tab_2' }] }],
    });
    expect(session.template.fields.find((field) => field.key === 'tab_2')).toMatchObject({ label: 'Tab 2', type: 'entries' });
    expect(session.steps).toBe(1);
    expect(tabNames()).toEqual(['Tab 1', 'Tab 2']);
    expect(frame(tabsBlock!.id).querySelector('.atlas-sb-section-heading')?.textContent).toBe('Actions');
    expect(openPanel()?.querySelector('[data-block-id="actions1"]')).not.toBeNull();

    // The list is inside the tile now: the tile is what stays selected, and its Options name its tabs; nothing splits a second time.
    expect(selected()).toBe(tabsBlock?.id);
    expect(toolbarName()).toBe('Abilities toolbar');
    expect(tabNameInputs().map((input) => input.value)).toEqual(['Tab 1', 'Tab 2']);
    expect(optionsButton('Split into tabs')).toBeUndefined();
  });

  it('adds, names and removes a tab in an Abilities tile\'s Options, each one undo step', async () => {
    const session = new FakeSession(template([NAME, ABILITY_TABS], FIELDS));
    mount(session, 1280);
    await frames(2);
    // A click on a list inside selects the tile: one Abilities tile, however many tabs it has.
    await clickAt(frame('actions1'));
    expect(selected()).toBe('abiltabs');
    expect(toolbarName()).toBe('Abilities toolbar');
    const popover = await openOptions();
    expect(tabNameInputs().map((input) => input.value)).toEqual(['Actions', 'Reactions']);
    expect(optionsButton('Split into tabs')).toBeUndefined();

    await clickAt(optionsButton('Add tab')!);
    expect(session.steps).toBe(1);
    expect(tabNames()).toEqual(['Actions', 'Reactions', 'Tab 3']);
    expect(session.template.layout.blocks[1]).toMatchObject({ blocks: [{}, {}, { heading: 'Tab 3', blocks: [{ type: 'entries', field: 'tab_3' }] }] });
    expect(selected()).toBe('abiltabs');

    // Typing a name shows on the card as it is typed, and is one step once it ends.
    await clickAt(tabNameInputs()[2]!);
    await userEvent.keyboard(SELECT_ALL);
    await userEvent.keyboard('Legendary');
    expect(tabNames()).toEqual(['Actions', 'Reactions', 'Legendary']);
    expect(session.steps).toBe(1);
    await userEvent.keyboard('{Enter}');
    expect(session.steps).toBe(2);
    // The Options stand beside the card, clear of the tile they change.
    const box = popover.getBoundingClientRect();
    const tile = frame('abiltabs').getBoundingClientRect();
    expect(box.right).toBeLessThanOrEqual(tile.left);

    await clickAt(optionsButton('Remove Reactions')!);
    expect(session.steps).toBe(3);
    expect(tabNames()).toEqual(['Actions', 'Legendary']);
    expect(session.template.fields.some((field) => field.key === 'reactions')).toBe(true);

    for (const names of [['Actions', 'Reactions', 'Legendary'], ['Actions', 'Reactions', 'Tab 3'], ['Actions', 'Reactions']]) {
      await clickAt(dockButton('Undo'));
      expect(tabNames()).toEqual(names);
    }
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(gridShape(session)).toBe('title001 abiltabs(tabactn1(actions1) tabreac1(reacts01))');
  });

  it('opens a tab on a click without a change, and selects a Tabs tile as one: a click in it, and the arrow keys step past what it holds', async () => {
    const session = new FakeSession(template([NAME, TABS, VALUE], FIELDS));
    mount(session, 1280);
    await frames(2);
    await clickAt(tabs()[2]!);
    expect(openPanel()?.querySelector('[data-block-id="lairtext"]')).not.toBeNull();
    expect(selected()).toBeUndefined();

    await clickAt(frame('lairtext'));
    expect(selected()).toBe('tabs0001');
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('tabs0001');
    // Shown as it renders: its inside is edited as JSON, so it has no Options.
    expect(toolbarName()).toBe('Tabs toolbar');
    expect(document.querySelector('.atlas-te-toolbar [data-options]')).toBeNull();

    await clickAt(tabs()[0]!);
    expect(openPanel()?.querySelector('[data-block-id="actions1"]')).not.toBeNull();
    expect(selected()).toBe('tabs0001');

    await userEvent.keyboard('{ArrowDown}');
    await frames(2);
    expect(selected()).toBe('stat-ac1');
    await userEvent.keyboard('{ArrowUp}');
    await frames(2);
    expect(selected()).toBe('tabs0001');
    expect(document.activeElement?.getAttribute('data-block-id')).toBe('tabs0001');
    await userEvent.keyboard('{ArrowUp}');
    await frames(2);
    expect(selected()).toBe('title001');
    expect(session.steps).toBe(0);
  });

  it('never drops into tabs: a tile let go over the strip or an open tab lands in a row of its own beside the Tabs tile', async () => {
    const session = new FakeSession(template([NAME, TABS, VALUE], FIELDS));
    mount(session, 1280);
    await frames(2);
    const overStrip = await dragTo('stat-ac1', centreOf(document.querySelector('.atlas-te-stage .atlas-sb-tabstrip')!));
    expect(overStrip.line?.orientation).toBe('horizontal');
    expect(overStrip.said).toBe('A row of its own, row 2 of 3.');
    expect(gridShape(session)).toBe(`title001 stat-ac1 ${tabsShape}`);
    expect(session.steps).toBe(1);
    // Where the line showed is where it landed: between the name and the tile, which the Tabs tile now follows.
    expect(overStrip.line!.y).toBeGreaterThanOrEqual(frame('title001').getBoundingClientRect().bottom - 1);
    expect(overStrip.line!.y).toBeLessThanOrEqual(frame('stat-ac1').getBoundingClientRect().top + 1);
    expect(frame('tabs0001').getBoundingClientRect().top).toBeGreaterThanOrEqual(frame('stat-ac1').getBoundingClientRect().bottom);

    const list = frame('actions1').getBoundingClientRect();
    const overList = await dragTo('stat-ac1', { x: list.left + list.width / 2, y: list.bottom - 4 });
    expect(overList.line?.orientation).toBe('horizontal');
    expect(overList.said).toBe('A row of its own, row 3 of 3.');
    expect(gridShape(session)).toBe(`title001 ${tabsShape} stat-ac1`);
    expect(session.steps).toBe(2);
    expect(overList.line!.y).toBeGreaterThanOrEqual(frame('tabs0001').getBoundingClientRect().bottom - 1);
    expect(overList.line!.y).toBeLessThanOrEqual(frame('stat-ac1').getBoundingClientRect().top + 1);
    expect(tabNames()).toEqual(['Actions', 'Reactions', 'Lair']);
  });
});
