// @vitest-environment jsdom
import React, { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { BREW_NOTE } from '../fixtures/tableNotes';
import { RandomTablesTab } from '../../src/app/react/components/collection-settings/RandomTablesTab';
import { BUILT_IN_SYSTEM_PRESETS } from '../../src/app/gameSystems/builtInPresets';
import type { RandomTableSource, RarityOption } from '../../src/app/types/randomTableTypes';

vi.mock('../../src/app/loot/lootQueryView', () => import('../mocks/fakeLootQueries'));

const GEAR_NOTE = '## Gear\n\n| d4 | Item | Price |\n| --- | --- | --- |\n| 1 | Rope | 1 sp |\n| 2 | Lantern | 5 gp |\n| 3 | Chalk | 1 cp |\n| 4 | Pole | 5 sp |\n';

interface Draft {
  randomTables: readonly RandomTableSource[];
  itemRarities: readonly RarityOption[] | undefined;
}

/** The tab over a draft the test reads back, as the dialog keeps it until Save. */
function renderTab(app: App, initial: Partial<Draft> = {}, systemPresetId?: string): { draft: () => Draft } {
  let latest: Draft = { randomTables: [], itemRarities: undefined, ...initial };
  function Harness(): React.ReactElement {
    const [randomTables, setRandomTables] = useState(latest.randomTables);
    const [itemRarities, setItemRarities] = useState(latest.itemRarities);
    latest = { randomTables, itemRarities };
    return (
      <RandomTablesTab
        app={app}
        lootBases={[]}
        onBasesChange={vi.fn()}
        randomTables={randomTables}
        onRandomTablesChange={setRandomTables}
        currency=""
        onCurrencyChange={vi.fn()}
        itemRarities={itemRarities}
        onItemRaritiesChange={setItemRarities}
        systemPresetId={systemPresetId}
        presets={BUILT_IN_SYSTEM_PRESETS}
      />
    );
  }
  render(<Harness />);
  return { draft: () => latest };
}

// jsdom lays nothing out, so it has no scrolling an element into view.
beforeEach(() => { Element.prototype.scrollIntoView = vi.fn(); });
afterEach(() => cleanup());

describe('the Random tables tab', () => {
  it('adds the tables of a note it reads, guessing which give items', async () => {
    const { app } = createInMemoryApp({ files: { 'Adventures/Brew.md': BREW_NOTE, 'Gear.md': GEAR_NOTE } });
    const { draft } = renderTab(app);
    fireEvent.click(screen.getByRole('button', { name: 'Add from a note' }));
    fireEvent.click(within(document.querySelector<HTMLElement>('.atlas-linked-note-list')!).getByText('Brew'));
    const add = await screen.findByRole('button', { name: 'Add 2 tables' });
    expect(screen.getByText('🗣️ Rumours in the Taproom')).toBeTruthy();
    fireEvent.click(add);
    expect(draft().randomTables.map((source) => [source.table, source.index, source.kind])).toEqual([
      ['🎲 Random Tunnel Encounters', 0, 'text'],
      ['🗣️ Rumours in the Taproom', 1, 'text'],
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'Add from a note' }));
    fireEvent.click(within(document.querySelector<HTMLElement>('.atlas-linked-note-list')!).getByText('Gear'));
    fireEvent.click(await screen.findByRole('button', { name: 'Add 1 table' }));
    expect(draft().randomTables[2]).toEqual({ path: 'Gear.md', table: 'Gear', index: 0, kind: 'items' });
  });

  it('offers a table already rolled on as ticked and not to be added twice', async () => {
    const { app } = createInMemoryApp({ files: { 'Adventures/Brew.md': BREW_NOTE } });
    renderTab(app, { randomTables: [{ path: 'Adventures/Brew.md', index: 1, kind: 'text' }] });
    fireEvent.click(screen.getByRole('button', { name: 'Add from a note' }));
    fireEvent.click(within(document.querySelector<HTMLElement>('.atlas-linked-note-list')!).getByText('Brew'));
    await screen.findByRole('button', { name: 'Add 1 table' });
    const listed = screen.getAllByRole('checkbox').find((box) => (box as HTMLInputElement).disabled) as HTMLInputElement;
    expect(listed.checked).toBe(true);
  });

  it('sets what a table gives, the columns only the GM sees and No repeats, keeping fields of a newer Atlas', async () => {
    const { app } = createInMemoryApp({ files: { 'Adventures/Brew.md': BREW_NOTE } });
    const stored = { path: 'Adventures/Brew.md', table: '🗣️ Rumours in the Taproom', index: 1, kind: 'text', later: 'kept' } as RandomTableSource;
    const { draft } = renderTab(app, { randomTables: [stored] });
    const row = await screen.findByRole('button', { name: /Rumours in the Taproom/ });
    await waitFor(() => expect(row.textContent).toContain('d6'));

    fireEvent.click(screen.getByRole('radio', { name: 'Items' }));
    expect(draft().randomTables[0]).toMatchObject({ kind: 'items', later: 'kept' });

    fireEvent.click(row);
    fireEvent.click(screen.getByRole('button', { name: 'True?' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'No repeats' }));
    expect(draft().randomTables[0]).toEqual({ ...stored, kind: 'items', hiddenColumns: ['True?'], noRepeats: true });

    fireEvent.click(screen.getByRole('button', { name: 'True?' }));
    expect(draft().randomTables[0]).not.toHaveProperty('hiddenColumns');
    fireEvent.click(within(row.closest('.atlas-rt-row')!).getByRole('button', { name: 'Stop rolling on this table' }));
    expect(draft().randomTables).toEqual([]);
  });

  it('names a table in Atlas, its own name coming back when the field is cleared', async () => {
    const { app } = createInMemoryApp({ files: { 'Adventures/Brew.md': BREW_NOTE } });
    const stored: RandomTableSource = { path: 'Adventures/Brew.md', table: '🗣️ Rumours in the Taproom', index: 1, kind: 'text' };
    const { draft } = renderTab(app, { randomTables: [stored] });
    fireEvent.click(await screen.findByRole('button', { name: /Rumours in the Taproom/ }));
    const field = screen.getByRole('textbox', { name: 'Name in Atlas' }) as HTMLInputElement;
    await waitFor(() => expect(field.placeholder).toBe('🗣️ Rumours in the Taproom'));

    fireEvent.change(field, { target: { value: ' Tavern talk ' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    fireEvent.blur(field);
    expect(draft().randomTables[0]).toEqual({ ...stored, label: 'Tavern talk' });
    expect(screen.getByRole('button', { name: /Tavern talk/ })).toBeTruthy();

    fireEvent.change(field, { target: { value: '' } });
    fireEvent.blur(field);
    expect(draft().randomTables[0]).toEqual(stored);
  });

  it('edits the rarity words, storing nothing while they are the system\'s', () => {
    const { app } = createInMemoryApp({ files: {} });
    const { draft } = renderTab(app, {}, 'builtin:pathfinder2e');
    const names = (): string[] => screen.getAllByRole('textbox', { name: 'Rarity' }).map((input) => (input as HTMLInputElement).value);
    expect(names()).toEqual(['Common', 'Uncommon', 'Rare', 'Unique']);

    fireEvent.click(screen.getByRole('button', { name: 'Add rarity' }));
    const inputs = screen.getAllByRole('textbox', { name: 'Rarity' });
    fireEvent.change(inputs[4]!, { target: { value: 'Heirloom' } });
    fireEvent.click(within(screen.getByRole('radiogroup', { name: 'Colour of Heirloom' })).getByRole('radio', { name: 'Epic' }));
    expect(draft().itemRarities?.at(-1)).toEqual({ name: 'Heirloom', tone: 'epic' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Remove rarity' })[4]!);
    expect(draft().itemRarities).toBeUndefined();

    fireEvent.keyDown(screen.getAllByRole('button', { name: 'Drag to reorder, or Alt and an arrow key' })[3]!, { key: 'ArrowUp', altKey: true });
    expect(names()).toEqual(['Common', 'Uncommon', 'Unique', 'Rare']);
    fireEvent.click(screen.getByRole('button', { name: 'Use the system’s rarities' }));
    expect(draft().itemRarities).toBeUndefined();
    expect(names()).toEqual(['Common', 'Uncommon', 'Rare', 'Unique']);
  });
});
