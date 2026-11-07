// @vitest-environment jsdom
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { pastedCells } from '../../../../src/app/statblocks/editor/table/cellText';
import { editableSpots } from '../../../../src/app/statblocks/editor/statblock-pane/editableSpots';
import { TemplateLibrary } from '../../../../src/app/statblocks/library/TemplateLibrary';
import { sheetState } from '../../../../src/app/statblocks/render/sheetState';
import { TEMPLATE_FORMAT, type ScoresBlock, type StatblockTemplate, type TemplateField } from '../../../../src/app/statblocks/model/templateTypes';
import { blockOf, renderPane, type PaneHarness } from './paneKit';

vi.mock('../../../../src/app/services/AssetService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../src/app/services/AssetService')>();
  const assets = {
    getCollections: async () => [{ id: 'campaign', name: 'Campaign' }],
    getAssets: async () => [],
    getDefaultCollectionId: () => 'campaign',
    loadedTokenAssets: () => [],
    getCollectionSettings: () => ({ conditions: [] }),
  };
  return { ...actual, AssetService: { getInstance: () => assets } };
});

const STATS: TemplateField = { key: 'stats', label: 'Abilities', type: 'scores', slots: ['Str', 'Dex', 'Con'], addRows: false, addColumns: false };
const ROW: ScoresBlock = { id: 'scores01', type: 'scores', field: 'stats', orientation: 'row', columns: [{ formula: 'floor((value - 10) / 2)', display: 'signed' }] };
const LOOT: TemplateField = { key: 'stats', label: 'Loot', type: 'scores', slots: ['Item', 'Qty'], rows: [['Rope', 1]] };

function templateWith(table: ScoresBlock = ROW, stats: TemplateField = STATS): StatblockTemplate {
  return {
    format: TEMPLATE_FORMAT,
    version: 1,
    id: 'scores-k7m2qa',
    fields: [{ key: 'name', label: 'Name', type: 'text' }, stats, { key: 'hp', label: 'HP', type: 'number' }],
    layout: {
      maxColumns: 1,
      blocks: [{ id: 'title001', type: 'title', field: 'name', level: 1 }, table, { id: 'stat-hp1', type: 'stat', field: 'hp', look: 'run-in' }],
    },
  };
}

const apps: App[] = [];
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const app of apps.splice(0)) TemplateLibrary.release(app);
});

async function pane(values: Record<string, unknown>, template = templateWith()): Promise<PaneHarness> {
  vi.spyOn(TemplateLibrary.prototype, 'get').mockReturnValue({
    template, name: 'Scores', status: 'ok', builtIn: false, path: 'Templates/Scores.atlastemplate',
  });
  const harness = await renderPane({ frontmatter: { statblock: true, 'atlas-template': template.id, name: 'Marsh Warden', ...values } });
  apps.push(harness.app);
  return harness;
}

const table = (harness: PaneHarness): HTMLElement => blockOf(harness.result.container, 'scores01');
const cell = (harness: PaneHarness, row: number, col: number): HTMLElement => table(harness).querySelector<HTMLElement>(`[data-table-row="${row}"][data-table-col="${col}"]`)!;
const focused = (): HTMLTextAreaElement => document.activeElement as HTMLTextAreaElement;
const named = (): string | null => focused().getAttribute('aria-label');

async function press(key: string, init: Partial<KeyboardEventInit> = {}): Promise<void> {
  await act(async () => { fireEvent.keyDown(document.activeElement!, { key, ...init }); });
}

async function type(text: string, key = 'Tab'): Promise<void> {
  fireEvent.change(focused(), { target: { value: text } });
  await press(key);
}

/** Lets the note take what was written, as the note source tells the pane. */
function noteTakes(harness: PaneHarness, values: Record<string, unknown>): void {
  act(() => { harness.source.set('Bestiary/Marsh Warden.md', { statblock: true, 'atlas-template': 'scores-k7m2qa', name: 'Marsh Warden', ...values }); });
}

describe('pasted cells', () => {
  it('fill from a spreadsheet\'s block, a row of numbers or a statblock line with its printed modifiers', () => {
    expect(pastedCells('Rope\t1\nTorch\t3')).toEqual([['Rope', 1], ['Torch', 3]]);
    expect(pastedCells('14 12 13 10 11 8')).toEqual([[14, 12, 13, 10, 11, 8]]);
    expect(pastedCells('18 (+4) 14 (+2) 16 (−3)')).toEqual([[18, 14, 16]]);
    expect(pastedCells('14')).toBeNull();
    expect(pastedCells('1 per day')).toBeNull();
  });
});

describe('a Table in the statblock pane', () => {
  it('is one stop of the template\'s field order, typed cell by cell inside', () => {
    const template = templateWith();
    const { tables, order } = editableSpots(template, sheetState({ template, record: {}, mode: 'editing' }));
    expect([...tables]).toEqual(['scores01']);
    expect(order.map((spot) => spot.field.key)).toEqual(['name', 'stats', 'hp']);
  });

  it('types the cell clicked in its own place, named by its column, the rest of the grid drawn as it is', async () => {
    const harness = await pane({ stats: [10, 12, 14] });
    fireEvent.click(cell(harness, 0, 1));
    expect(named()).toBe('Dex');
    expect(cell(harness, 0, 1).contains(focused())).toBe(true);
    expect(focused().value).toBe('12');
    expect(table(harness).querySelectorAll('textarea')).toHaveLength(1);
    expect(cell(harness, 0, 0).textContent).toBe('10');
    expect(cell(harness, 0, 1).classList.contains('is-typing')).toBe(true);
  });

  it('writes the one-row table back as a flat list, one write per cell, each built on the one before while the note has not taken it', async () => {
    const harness = await pane({});
    fireEvent.click(cell(harness, 0, 0));
    await type('18');
    await type('14');
    expect(harness.writer.patches()).toEqual([
      { op: 'set', path: ['stats'], base: undefined, next: [18] },
      { op: 'set', path: ['stats'], base: [18], next: [18, 14] },
    ]);
    expect(named()).toBe('Con');
  });

  it('walks the cells with Tab and Shift+Tab and, where rows are the template\'s, leaves the table at its ends', async () => {
    await pane({ stats: [10, 12, 14] });
    fireEvent.click(screen.getByText('14'));
    expect(named()).toBe('Con');
    await press('Tab');
    expect(named()).toBe('HP');
    await press('Tab', { shiftKey: true });
    expect(named()).toBe('Con');
    await press('Tab', { shiftKey: true });
    await press('Tab', { shiftKey: true });
    expect(named()).toBe('Str');
    await press('Tab', { shiftKey: true });
    expect(named()).toBe('Name');
  });

  it('goes down with Enter and up with Shift+Enter; Enter in the last row of a fixed table finishes', async () => {
    const harness = await pane({ stats: [[10, 12, 14], [8, 9, 11]] });
    fireEvent.click(cell(harness, 0, 2));
    await press('Enter');
    expect(named()).toBe('Con, row 2');
    await press('Enter', { shiftKey: true });
    expect(named()).toBe('Con, row 1');
    await press('Enter');
    await press('Enter');
    expect(table(harness).querySelector('textarea')).toBeNull();
    expect(harness.writer.writes).toEqual([]);
  });

  it('crosses into the neighbouring cell with the arrows at the caret\'s ends', async () => {
    const harness = await pane({ stats: [[10, 12, 14], [8, 9, 11]] });
    fireEvent.click(cell(harness, 0, 1));
    focused().setSelectionRange(0, 0);
    await press('ArrowLeft');
    expect(named()).toBe('Str, row 1');
    focused().setSelectionRange(2, 2);
    await press('ArrowRight');
    expect(named()).toBe('Dex, row 1');
    await press('ArrowDown');
    expect(named()).toBe('Dex, row 2');
    // A cell reached by the keys starts with its text selected: the first arrow collapses it, as Obsidian's.
    await press('ArrowUp');
    expect(named()).toBe('Dex, row 2');
    focused().setSelectionRange(0, 0);
    await press('ArrowUp');
    expect(named()).toBe('Dex, row 1');
    // A caret short of the text's end moves through the text as ever.
    focused().setSelectionRange(0, 0);
    await press('ArrowRight');
    expect(named()).toBe('Dex, row 1');
    expect(harness.writer.writes).toEqual([]);
  });

  it('cancels a cell with Escape: nothing is written and typing ends', async () => {
    const harness = await pane({ stats: [10, 12, 14] });
    fireEvent.click(cell(harness, 0, 0));
    fireEvent.change(focused(), { target: { value: '99' } });
    await press('Escape');
    expect(table(harness).querySelector('textarea')).toBeNull();
    expect(harness.writer.writes).toEqual([]);
  });

  it('fills the cell pasted into and the ones after it with one write, as many as the template\'s columns hold', async () => {
    const harness = await pane({ stats: [10] });
    fireEvent.click(cell(harness, 0, 1));
    await act(async () => {
      fireEvent.paste(focused(), { clipboardData: { getData: () => '14\t12\t13\t9' } });
    });
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['stats'], base: [10], next: [10, 14, 12] }]);
    expect(focused().value).toBe('14');
  });

  it('keeps values written by name under their names, and text as written', async () => {
    const harness = await pane({ stats: { str: 10, dex: 12 } });
    fireEvent.click(cell(harness, 0, 1));
    await type('—');
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['stats'], base: { str: 10, dex: 12 }, next: { str: 10, dex: '—' } }]);
  });

  it('types a value that holds no table as one line of text, as written', async () => {
    const harness = await pane({ stats: 'see notes' });
    expect(table(harness).querySelector('[data-table-row]')).toBeNull();
    fireEvent.click(table(harness));
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: 'Abilities' }).value).toBe('see notes');
  });

  it('offers no rows, columns or menu where the template keeps them, and types its cells all the same', async () => {
    const harness = await pane({ stats: [10, 12, 14] });
    expect(table(harness).querySelector('.atlas-sb-sheet-table__handle, .atlas-sb-sheet-table__add')).toBeNull();
    fireEvent.contextMenu(cell(harness, 0, 0));
    expect(screen.queryByRole('menu')).toBeNull();
  });
});

describe('a Table statblocks shape', () => {
  const loot = (): StatblockTemplate => templateWith({ id: 'scores01', type: 'scores', field: 'stats', orientation: 'row' }, LOOT);

  it('shows its template\'s starting table, and writes a copy of its own with the first edit', async () => {
    const harness = await pane({}, loot());
    expect(cell(harness, 0, 0).textContent).toBe('Rope');
    fireEvent.click(cell(harness, 0, 1));
    await type('2', 'Enter');
    // Enter in the last row adds one: the cell typed and the new row are one write, and the new row is typed at once.
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['stats'], base: undefined, next: [['Rope', 2], []] }]);
    expect(named()).toBe('Qty, row 2');
  });

  it('adds a row past the last cell with Tab, and names its columns in the header row', async () => {
    const harness = await pane({ stats: [['Rope', 1]] }, loot());
    fireEvent.click(cell(harness, -1, 1));
    expect(named()).toBe('Column 2 name');
    await type('Count');
    expect(harness.writer.patches()).toEqual([{ op: 'set', path: ['stats'], base: [['Rope', 1]], next: { columns: ['Item', 'Count'], rows: [['Rope', 1]] } }]);
    noteTakes(harness, { stats: { columns: ['Item', 'Count'], rows: [['Rope', 1]] } });
    await press('Tab');
    await press('Tab');
    expect(named()).toBe('Item, row 2');
  });

  it('adds rows and columns from its add buttons, and changes them from a cell\'s menu', async () => {
    const harness = await pane({ stats: [['Rope', 1], ['Torch', 3]] }, loot());
    fireEvent.click(screen.getByRole('button', { name: 'Add row below' }));
    expect(harness.writer.patches().at(-1)).toMatchObject({ next: [['Rope', 1], ['Torch', 3], []] });
    expect(named()).toBe('Item, row 3');
    noteTakes(harness, { stats: [['Rope', 1], ['Torch', 3], []] });
    fireEvent.click(screen.getByRole('button', { name: 'Add column to the right' }));
    const own = { columns: ['Item', 'Qty', ''], rows: [['Rope', 1], ['Torch', 3], []] };
    expect(harness.writer.patches().at(-1)).toMatchObject({ next: own });
    expect(named()).toBe('Column 3 name');
    noteTakes(harness, { stats: own });
    fireEvent.contextMenu(cell(harness, 1, 0));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent?.trim())).toEqual(
      ['Row', 'Column', 'Sort by column (A to Z)', 'Sort by column (Z to A)'],
    );
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Z to A/ }));
    expect(harness.writer.patches().at(-1)).toMatchObject({ next: { columns: own.columns, rows: [['Torch', 3], ['Rope', 1], []] } });
  });

  it('selects a row by its handle, deletes it with Delete, and keeps the last row', async () => {
    const harness = await pane({ stats: [['Rope', 1], ['Torch', 3]] }, loot());
    const handle = screen.getByRole('button', { name: 'Row 2' });
    fireEvent.pointerDown(handle, { button: 0, pointerId: 1 });
    expect(cell(harness, 1, 0).classList.contains('is-selected')).toBe(true);
    await press('Delete');
    expect(harness.writer.patches().at(-1)).toMatchObject({ next: [['Rope', 1]] });
    noteTakes(harness, { stats: [['Rope', 1]] });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Row 1' }), { button: 0, pointerId: 1 });
    const writes = harness.writer.writes.length;
    await press('Delete');
    expect(harness.writer.writes).toHaveLength(writes);
  });
});
