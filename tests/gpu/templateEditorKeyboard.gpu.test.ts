import '../setup/obsidianDom';
import React from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import css from '../../styles/main.scss?inline';
import { TooltipProvider } from '../../src/app/packages/components/primitives/tooltip';
import { TemplateEditor, type TemplateEditorHost } from '../../src/app/statblocks/editor/template-editor/TemplateEditor';
import { HEADER_MESSAGE } from '../../src/app/statblocks/editor/template-editor/sessionEdit';
import { newTable } from '../../src/app/statblocks/model/tableColumns';
import { FakeSession, sampleTemplate, shape, template } from '../unit/statblocks/template-editor/editorKit';
import { wait } from './sidePanesHarness';

// Dice links reach the map view and the token link service, whose
// Node `events` has no browser build; nothing here rolls dice or writes files.
vi.mock('../../src/app/services/statblockDiceLinks', () => ({
  attachDiceRolling: () => () => undefined,
  diceLinkProps: () => ({}),
  linkDiceIn: () => undefined,
}));
vi.mock('../../src/app/statblocks/render/shared/useStatblockDiceRolling', () => ({ useStatblockDiceRolling: () => [undefined, null] }));

const THEME = `
  body { margin: 0; font: 13px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; --background-primary: #1e1e1e; --background-secondary: #262626;
    --background-modifier-border: #363636; --background-modifier-hover: rgba(255, 255, 255, 0.075); --text-normal: #dadada;
    --text-muted: #b3b3b3; --text-faint: #777; --interactive-accent: #7f6df2; --radius-s: 4px; --radius-m: 8px; --radius-l: 12px;
    --radius-xl: 16px; --font-ui-smaller: 12px; --font-ui-small: 13px; --font-ui-medium: 15px; --input-height: 30px; }
`;
const h = React.createElement;
const noop = (): void => undefined;
const host: TemplateEditorHost = { save: async () => null, close: noop };
/** The platform's own undo key in a text field: Playwright sends macOS's editing command for Meta+Z. */
const NATIVE_UNDO = navigator.platform.includes('Mac') ? '{Meta>}z{/Meta}' : '{Control>}z{/Control}';

function mount(session: FakeSession): void {
  render(h(TooltipProvider, null,
    h('div', { className: 'atlas-vtt-plugin' },
      h('button', null, 'Before'),
      h('div', { className: 'atlas-statblock-editor', 'data-surface': 'template-editor', style: { height: 720, width: 1180 } },
        h(TemplateEditor, {
          session, host, collectionId: null,
        })),
      h('button', null, 'After'))));
}

/** Where focus is: the editor region it lies in, the stop outside the editor, or the block it is on. */
function whereFocus(): string {
  const active = document.activeElement;
  if (!active || active === document.body) return 'body';
  const region = active.closest('[data-te-region]')?.getAttribute('data-te-region');
  if (region) return region;
  if (active.closest('.atlas-sb-note-panel__handle')) return 'resize';
  if (active.closest('.atlas-te-layer')) return 'toolbar';
  return active.textContent?.trim() ?? active.tagName;
}

/** Presses Tab (or Shift+Tab) until focus reaches `stop`, noting each place it passes. */
async function walk(stop: string, back: boolean): Promise<string[]> {
  const visited: string[] = [];
  for (let presses = 0; presses < 40 && whereFocus() !== stop; presses++) {
    await userEvent.keyboard(back ? '{Shift>}{Tab}{/Shift}' : '{Tab}');
    visited.push(whereFocus());
  }
  return visited;
}

/** Collapses runs of one place into one: the regions in the order Tab met them. */
const regionsOf = (visited: readonly string[]): string[] => visited.filter((place, index) => place !== visited[index - 1]);

/** Long enough for a closing Options popover to fade and leave the page. */
const CLOSED_MS = 300;
const live = (): string => document.querySelector('.atlas-te-live')?.textContent?.trim() ?? '';
const gridShape = (session: FakeSession): string => shape(session.template.layout.blocks);
const focusedBlock = (): string | null | undefined => document.activeElement?.getAttribute('data-block-id');
const tile = (id: string | undefined): HTMLElement => document.querySelector<HTMLElement>(`.atlas-te-stage [data-block-id="${id ?? ''}"]`)!;

describe('the template editor by keyboard', () => {
  const style = document.createElement('style');
  style.textContent = THEME + css;

  beforeEach(async () => {
    await page.viewport(1200, 800);
    document.head.append(style);
  });

  afterEach(() => {
    cleanup();
    style.remove();
  });

  it('leaves every region with Tab and Shift+Tab, stopping once on the canvas: the note, the panel\'s edge, the capsule, the card, the dock', async () => {
    mount(new FakeSession(sampleTemplate()));
    page.getByRole('button', { name: 'Before' }).element().focus();
    const forward = await walk('After', false);
    expect(regionsOf(forward)).toEqual(['note', 'resize', 'header', 'canvas', 'dock', 'After']);
    expect(forward.filter((place) => place === 'canvas')).toHaveLength(1);

    const backward = await walk('Before', true);
    expect(regionsOf(backward)).toEqual(['dock', 'canvas', 'header', 'resize', 'note', 'Before']);
    expect(backward.filter((place) => place === 'canvas')).toHaveLength(1);
  });

  it('leaves the canvas with Tab while a block is selected, and comes back to that block', async () => {
    mount(new FakeSession(sampleTemplate()));
    await userEvent.click(tile('stat-hp1'));
    await userEvent.keyboard('{Tab}');
    expect(whereFocus()).toBe('dock');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(focusedBlock()).toBe('stat-hp1');
  });

  it('builds a list of abilities and a table from a blank template by keyboard alone, each action one undo step (a tile placed and named is one)', async () => {
    const session = new FakeSession(template([]));
    mount(session);
    page.getByRole('button', { name: 'Before' }).element().focus();
    await walk('canvas', false);
    // The card is one stop with its header; Tab goes on to the blank card's rows before it leaves the card.
    expect(document.activeElement?.classList.contains('atlas-te-stage')).toBe(true);
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement?.textContent).toBe('A value');

    // The blank card's rows are buttons: Tab steps along them, Enter adds what the row names.
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement?.textContent).toBe('Abilities');
    await userEvent.keyboard('{Enter}');
    const [list] = session.template.layout.blocks;
    expect(list).toMatchObject({ type: 'entries', field: '' });
    // A tile placed asks for its name at once, and Enter gives focus back to it.
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('placeholder')).toBe('Name component'));
    await userEvent.keyboard('Actions{Enter}');
    expect(session.template.fields).toEqual([{ key: 'actions', label: 'Actions', type: 'entries' }]);
    expect(focusedBlock()).toBe(list?.id);
    // Placing a tile and naming it are one step.
    expect(session.steps).toBe(1);

    // "/" adds below the selected tile, in a row of its own.
    await userEvent.keyboard('/');
    expect(page.getByRole('combobox', { name: 'Find a kind' }).element()).toBe(document.activeElement);
    await userEvent.keyboard('Table');
    await userEvent.keyboard('{Enter}');
    expect(session.template.layout.blocks.map((block) => block.type)).toEqual(['entries', 'scores']);
    const table = session.template.layout.blocks[1];
    await vi.waitFor(() => expect(document.activeElement?.getAttribute('placeholder')).toBe('Name component'));
    await userEvent.keyboard('Abilities{Enter}');
    expect(session.template.fields[1]).toEqual({ key: 'stats', label: 'Abilities', type: 'scores', ...newTable() });
    expect(focusedBlock()).toBe(table?.id);
    expect(session.steps).toBe(2);

    // Enter types the table's first cell, its first column's name; Tab names the next, each one step, and Escape goes back to the tile.
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Column 1 name');
    await userEvent.keyboard('Body{Tab}Mind{Tab}Spirit{Tab}');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Body, row 1');
    await userEvent.keyboard('{Escape}');
    expect(session.template.fields[1]).toMatchObject({ slots: ['Body', 'Mind', 'Spirit'] });
    expect(focusedBlock()).toBe(table?.id);
    expect(session.steps).toBe(5);

    // Shift+Enter opens the tile's Options on their first control.
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    const options = page.getByRole('dialog', { name: 'Abilities options' }).element();
    await vi.waitFor(() => expect(options.contains(document.activeElement)).toBe(true));

    // What was built stands on the card: the list above the table, whose columns read as typed, and the Options never over their tile.
    const listBox = tile(list?.id).getBoundingClientRect();
    const tableBox = tile(table?.id).getBoundingClientRect();
    expect(tableBox.top).toBeGreaterThanOrEqual(listBox.bottom);
    expect(tile(table?.id).textContent).toMatch(/Body.*Mind.*Spirit/);
    expect(options.getBoundingClientRect().right).toBeLessThanOrEqual(tableBox.left);
  });

  it('hands focus back to the tile when its Options close on Escape, so its keys go on working', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session);
    await userEvent.click(tile('stat-ac1'));
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    const options = page.getByRole('dialog', { name: 'Armor class options' }).element();
    expect(options.contains(document.activeElement)).toBe(true);

    await userEvent.keyboard('{Escape}');
    await wait(CLOSED_MS);
    expect(document.querySelector('.atlas-te-options')).toBeNull();
    expect(document.querySelector('[data-te-selected="primary"]')?.getAttribute('data-block-id')).toBe('stat-ac1');
    expect(focusedBlock()).toBe('stat-ac1');
    await userEvent.keyboard('{ArrowDown}');
    expect(focusedBlock()).toBe('stat-hp1');
    expect(session.steps).toBe(0);
  });

  it('moves a tile along its row, out of its ends into a row of its own and past other rows with Alt+arrows, never into the header', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session);
    await userEvent.click(tile('stat-sp1'));
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(gridShape(session)).toBe('title001 stat-ac1 stat-hp1 row00001(stat-cr1 stat-sp1) divider1');
    expect(live()).toBe('Moved Speed into a row, place 2 of 2.');
    expect(tile('stat-sp1').getBoundingClientRect().left).toBeGreaterThanOrEqual(tile('stat-cr1').getBoundingClientRect().right);
    expect(focusedBlock()).toBe('stat-sp1');

    // Past the row's end the tile leaves it; the row, left with one tile, is that tile again.
    await userEvent.keyboard('{Alt>}{ArrowRight}{/Alt}');
    expect(gridShape(session)).toBe('title001 stat-ac1 stat-hp1 stat-cr1 stat-sp1 divider1');
    expect(live()).toBe('Moved Speed to a row of its own, row 5 of 6.');
    const alone = tile('stat-sp1').getBoundingClientRect();
    expect(alone.top).toBeGreaterThanOrEqual(tile('stat-cr1').getBoundingClientRect().bottom);
    expect(alone.left).toBeCloseTo(tile('stat-cr1').getBoundingClientRect().left, 0);
    expect(focusedBlock()).toBe('stat-sp1');
    expect(session.steps).toBe(2);

    // Up past every row, and no further: the header Atlas draws stays above the rows.
    for (let presses = 0; presses < 4; presses++) await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(gridShape(session)).toBe('stat-sp1 title001 stat-ac1 stat-hp1 stat-cr1 divider1');
    expect(live()).toBe('Moved Speed to a row of its own, row 1 of 6.');
    expect(session.steps).toBe(6);
    await userEvent.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(gridShape(session)).toBe('stat-sp1 title001 stat-ac1 stat-hp1 stat-cr1 divider1');
    expect(live()).toBe('Already at the top.');
    expect(session.steps).toBe(6);
    expect(tile('stat-sp1').getBoundingClientRect().top).toBeGreaterThanOrEqual(tile('header-name').getBoundingClientRect().bottom);
    expect(focusedBlock()).toBe('stat-sp1');
  });

  it('steps a tile past a whole row with Alt+arrows, never into it, and leaves a row by its start with Alt+←', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session);
    await userEvent.click(tile('stat-hp1'));
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(gridShape(session)).toBe('title001 stat-ac1 row00001(stat-sp1 stat-cr1) stat-hp1 divider1');
    expect(live()).toBe('Moved Hit points to a row of its own, row 4 of 5.');
    expect(tile('stat-hp1').getBoundingClientRect().top).toBeGreaterThanOrEqual(tile('stat-sp1').getBoundingClientRect().bottom);
    expect(focusedBlock()).toBe('stat-hp1');
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(gridShape(session)).toBe('title001 stat-ac1 row00001(stat-sp1 stat-cr1) divider1 stat-hp1');
    expect(live()).toBe('Already at the end.');
    expect(session.steps).toBe(2);

    await userEvent.click(tile('stat-sp1'));
    await userEvent.keyboard('{Alt>}{ArrowLeft}{/Alt}');
    expect(gridShape(session)).toBe('title001 stat-ac1 stat-sp1 stat-cr1 divider1 stat-hp1');
    expect(live()).toBe('Moved Speed to a row of its own, row 3 of 6.');
    expect(focusedBlock()).toBe('stat-sp1');
    expect(session.steps).toBe(3);

    // A part of the header is no tile: Alt+arrows leave it where it is, and say so.
    await userEvent.click(tile('header-name'));
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(gridShape(session)).toBe('title001 stat-ac1 stat-sp1 stat-cr1 divider1 stat-hp1');
    expect(live()).toBe(HEADER_MESSAGE);
    expect(session.steps).toBe(3);
  });

  it('undoes the text of a focused input with Mod+Z, never the template', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session);
    await userEvent.click(tile('stat-ac1'));
    await userEvent.keyboard('{Delete}');
    expect(session.steps).toBe(1);

    await userEvent.click(tile('stat-hp1'));
    await userEvent.keyboard('{Enter}');
    const input = page.getByRole('textbox', { name: 'Label' }).element() as HTMLInputElement;
    expect(input.value).toBe('Hit points');
    await userEvent.keyboard('Vigour');
    expect(input.value).toBe('Vigour');
    await userEvent.keyboard(NATIVE_UNDO);
    expect(input.value).toBe('Hit points');
    expect(session.getSnapshot().canUndo).toBe(true);
    expect(gridShape(session)).toBe('title001 stat-hp1 row00001(stat-sp1 stat-cr1) divider1');

    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(document.querySelector('[data-block-id="stat-ac1"]')).not.toBeNull();
  });

  it('keeps Mod+Z in a tile\'s Options to the text typed there, which the card shows as it is typed', async () => {
    const session = new FakeSession(sampleTemplate());
    mount(session);
    await userEvent.click(tile('stat-ac1'));
    await userEvent.keyboard('{Delete}');
    await userEvent.click(tile('stat-hp1'));
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    await userEvent.keyboard('{Tab}');
    const unit = page.getByRole('textbox', { name: 'Unit' }).element() as HTMLInputElement;
    expect(unit).toBe(document.activeElement);
    await userEvent.keyboard('ft.');
    expect(session.template.fields.find((field) => field.key === 'hp')).toMatchObject({ unit: 'ft.' });

    await userEvent.keyboard(NATIVE_UNDO);
    expect(unit.value).toBe('');
    expect(session.template.fields.find((field) => field.key === 'hp')).not.toHaveProperty('unit');
    // The delete before it stands: the input's undo never reached the template's.
    expect(gridShape(session)).toBe('title001 stat-hp1 row00001(stat-sp1 stat-cr1) divider1');
    expect(session.getSnapshot().canUndo).toBe(true);
  });
});
