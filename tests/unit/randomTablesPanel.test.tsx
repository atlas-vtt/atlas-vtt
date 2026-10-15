import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { MotionGlobalConfig } from 'framer-motion';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeQueries } from '../mocks/fakeLootQueries';
import { BREW_NOTE } from '../fixtures/tableNotes';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { ViewStoreProvider } from '../../src/app/react/ViewStoreContext';
import { ContextMenuProvider } from '../../src/app/react/root/ContextMenuContext';
import { RandomTables } from '../../src/app/react/components/randomTables/RandomTablesPanel';
import { AssetService } from '../../src/app/services/AssetService';
import { LootHistoryStore } from '../../src/app/loot/LootHistoryStore';
import type { RandomTableSource } from '../../src/app/types/randomTableTypes';
import { showNotice } from '../../src/app/ui/notice';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({ getLoadedAtlasView: () => null }));
vi.mock('../../src/app/loot/lootQueryView', () => import('../mocks/fakeLootQueries'));
vi.mock('../../src/app/ui/notice', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../src/app/ui/notice')>(),
  showNotice: vi.fn(() => ({ hide: () => undefined })),
}));

const GEAR_NOTE = '| Item | Price |\n| --- | --- |\n| Rope | 1 |\n';

interface Mounted {
  app: App;
  store: ViewAtlasStore;
  collectionId: string;
}

type Handler = (...args: unknown[]) => void;

/** Workspace events that reach their listeners, as Obsidian's do: settings saved reach the window. */
function liveWorkspaceEvents(app: App): void {
  const handlers = new Map<string, Set<Handler>>();
  Object.assign(app.workspace, {
    on: (name: string, handler: Handler) => {
      handlers.set(name, (handlers.get(name) ?? new Set()).add(handler));
      return { name, handler };
    },
    offref: (ref: { name: string; handler: Handler }) => handlers.get(ref.name)?.delete(ref.handler),
    trigger: (name: string, ...args: unknown[]) => handlers.get(name)?.forEach((handler) => handler(...args)),
  });
}

async function mount(randomTables: RandomTableSource[], lootBases: string[] = []): Promise<Mounted> {
  const { app } = createInMemoryApp({
    files: { 'Adventures/Brew.md': BREW_NOTE, 'Gear.md': GEAR_NOTE, 'Loot/Items.base': 'views:\n  - type: table\n    name: Weapons\n' },
  });
  liveWorkspaceEvents(app);
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const collectionId = assets.getDefaultCollectionId();
  await assets.updateCollectionSettings(collectionId, { randomTables, lootBases, lootCurrency: 'gp' });
  const store = createViewAtlasStore(app, 'map');
  store.getState().setPersistenceEnabled(false);
  store.setState({ mapPath: `atlas-vtt/collections/${collectionId}/scenes/Cellar.atlasmap` });
  store.getState().setLootRollerOpen(true);
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><ContextMenuProvider><RandomTables /></ContextMenuProvider></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { app, store, collectionId };
}

const RUMOURS: RandomTableSource = { path: 'Adventures/Brew.md', table: '🗣️ Rumours in the Taproom', index: 1, kind: 'text', hiddenColumns: ['True?'] };
const GEAR: RandomTableSource = { path: 'Gear.md', index: 0, kind: 'items' };

/** The ⋯ of the sidebar row whose button is named `name`. */
const optionsOf = (sidebar: HTMLElement, name: RegExp): HTMLElement =>
  within(within(sidebar).getByRole('button', { name }).closest('.atlas-tables-entry') as HTMLElement).getByRole('button', { name: 'Table options' });

/** Clicks the Undo of the last notice shown. */
function clickUndo(): void {
  const message = vi.mocked(showNotice).mock.lastCall?.[0];
  if (!(message instanceof DocumentFragment)) throw new Error('no notice with an Undo');
  const undo = [...message.querySelectorAll('a')].find((link) => link.textContent === 'Undo');
  if (!undo) throw new Error('no Undo in the notice');
  fireEvent.click(undo);
}

beforeEach(() => {
  MotionGlobalConfig.skipAnimations = true;
  fakeQueries.reset();
  Reflect.set(AssetService, 'instance', null);
});

afterEach(() => {
  cleanup();
  vi.mocked(showNotice).mockClear();
  vi.restoreAllMocks();
  MotionGlobalConfig.skipAnimations = false;
});

describe('the Random tables window', () => {
  it('lists the tables of notes by kind and rolls the one picked, its hidden column marked', async () => {
    const { app, store, collectionId } = await mount([RUMOURS, GEAR]);
    const sidebar = await screen.findByRole('complementary');
    const items = within(sidebar).getByRole('region', { name: 'Items' });
    const text = within(sidebar).getByRole('region', { name: 'Text' });
    expect(within(items).getByRole('button', { name: /Gear/ })).toBeTruthy();
    const rumours = within(text).getByRole('button', { name: /Rumours in the Taproom/ });
    expect(rumours.textContent).toContain('d6');

    fireEvent.click(rumours);
    expect(store.getState().lootRoller.selected).toBe('Adventures/Brew.md#1');
    expect(document.querySelector('.atlas-tables-chip')?.textContent).toBe('Rolls d6');

    vi.spyOn(Math, 'random').mockReturnValue(0.4); // a 3 on the d6
    fireEvent.click(screen.getByRole('button', { name: 'Roll 🗣️ Rumours in the Taproom' }));

    const card = await screen.findByText('"The old wizard kept a pet that ate fire."');
    const result = card.closest('li')!;
    expect(within(result).getByText('3')).toBeTruthy();
    expect(within(result).getByText('True?')).toBeTruthy();
    expect(result.querySelector('.atlas-table-card__field.is-hidden')).toBeTruthy();
    expect(within(result).getByText('Brew › 🗣️ Rumours in the Taproom')).toBeTruthy();

    await waitFor(async () => expect(await LootHistoryStore.forApp(app).load(collectionId)).toHaveLength(1));
    const [saved] = await LootHistoryStore.forApp(app).load(collectionId);
    expect(saved?.draws).toEqual([]);
    expect(saved?.results?.[0]?.roll).toEqual({ die: 'd6', total: 3 });
  });

  it('shows rolls of every kind in the history, counted', async () => {
    const { store } = await mount([RUMOURS, GEAR]);
    fireEvent.click(within(await screen.findByRole('complementary')).getByRole('button', { name: /Gear/ }));
    expect(screen.queryByText('No repeats')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Roll Gear' }));
    await screen.findByText('Rope');

    fireEvent.click(within(screen.getByRole('complementary')).getByRole('button', { name: /Rumours in the Taproom/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Roll 🗣️ Rumours in the Taproom' }));
    await waitFor(() => expect(store.getState().lootRoller.lastRoll?.results).toHaveLength(1));

    act(() => store.getState().updateLootRoller({ pane: 'history' }));
    await waitFor(() => expect(document.querySelectorAll('.atlas-loot-history__roll')).toHaveLength(2));
    const counts = [...document.querySelectorAll('.atlas-loot-history__count')].map((count) => count.textContent);
    expect(counts).toEqual(['1 result', '1 item']);
  });

  it('saves No repeats on the table, keeping the rest of its entry', async () => {
    const { app, collectionId } = await mount([{ ...RUMOURS, ...{ future: 1 } } as RandomTableSource]);
    await waitFor(() => expect(document.querySelector('.atlas-tables-chip')?.textContent).toBe('Rolls d6'));
    fireEvent.click(screen.getByRole('switch', { name: 'No repeats' }));
    await waitFor(() => expect(AssetService.getInstance(app).getCollectionSettings(collectionId).randomTables).toEqual([
      { ...RUMOURS, future: 1, noRepeats: true },
    ]));
  });

  it('searches the tables by name', async () => {
    await mount([RUMOURS, GEAR, { path: 'Adventures/Brew.md', index: 0, kind: 'text' }]);
    const search = await screen.findByRole('searchbox', { name: 'Search tables' });
    fireEvent.change(search, { target: { value: 'tunnel' } });
    const sidebar = screen.getByRole('complementary');
    expect(within(sidebar).queryByRole('button', { name: /Rumours/ })).toBeNull();
    expect(within(sidebar).getByRole('button', { name: /Tunnel Encounters/ })).toBeTruthy();
    fireEvent.change(search, { target: { value: 'nothing like it' } });
    expect(within(sidebar).getByText('No table matches')).toBeTruthy();
  });

  it('offers a table from a note while the collection has none', async () => {
    await mount([]);
    expect(await screen.findByText('No random tables yet')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Use a table from a note' })).toBeTruthy();
  });

  it('renames a table from its menu without touching the note, and its own name comes back when cleared', async () => {
    const { app, collectionId } = await mount([RUMOURS, GEAR]);
    const sidebar = await screen.findByRole('complementary');
    const settings = (): RandomTableSource[] | undefined => AssetService.getInstance(app).getCollectionSettings(collectionId).randomTables;

    fireEvent.click(optionsOf(sidebar, /Rumours in the Taproom/));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const field = await screen.findByRole('textbox', { name: 'New name for 🗣️ Rumours in the Taproom' });
    fireEvent.change(field, { target: { value: 'Tavern talk' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    await waitFor(() => expect(settings()?.[0]).toEqual({ ...RUMOURS, label: 'Tavern talk' }));
    const renamed = await within(sidebar).findByRole('button', { name: /Tavern talk/ });
    await waitFor(() => expect(document.activeElement).toBe(renamed));
    expect(await app.vault.adapter.read('Adventures/Brew.md')).toBe(BREW_NOTE);

    // Found by its own name as well as the new one.
    const search = screen.getByRole('searchbox', { name: 'Search tables' });
    fireEvent.change(search, { target: { value: 'taproom' } });
    expect(within(sidebar).getByRole('button', { name: /Tavern talk/ })).toBeTruthy();
    fireEvent.change(search, { target: { value: '' } });

    fireEvent.click(optionsOf(sidebar, /Tavern talk/));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const again = await screen.findByRole('textbox', { name: 'New name for Tavern talk' });
    fireEvent.change(again, { target: { value: '' } });
    fireEvent.keyDown(again, { key: 'Enter' });
    await waitFor(() => expect(settings()?.[0]).toEqual(RUMOURS));
  });

  it('keeps the name when renaming is cancelled with Escape', async () => {
    const { app, collectionId } = await mount([GEAR]);
    const sidebar = await screen.findByRole('complementary');
    fireEvent.click(within(sidebar).getByRole('button', { name: 'Table options' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const field = await screen.findByRole('textbox', { name: 'New name for Gear' });
    fireEvent.change(field, { target: { value: 'Junk' } });
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(within(sidebar).getByRole('button', { name: /Gear/ })).toBeTruthy();
    expect(AssetService.getInstance(app).getCollectionSettings(collectionId).randomTables).toEqual([GEAR]);
  });

  it('removes a table whose note is gone and a base from the list, leaving the others', async () => {
    const gone: RandomTableSource = { path: 'Gone.md', index: 0, kind: 'text' };
    const { app, collectionId } = await mount([gone, GEAR], ['Loot/Items.base']);
    await waitFor(() => fakeQueries.of('Weapons'));
    act(() => fakeQueries.of('Weapons').listener.onSnapshot({ entries: [], order: [], displayNames: {} }));
    const sidebar = await screen.findByRole('complementary');
    const options = (): HTMLElement[] => within(sidebar).getAllByRole('button', { name: 'Table options' });
    await waitFor(() => expect(options()).toHaveLength(3));

    fireEvent.click(optionsOf(sidebar, /Gone/));
    expect((await screen.findByRole('menuitem', { name: 'Open note' })).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: 'Remove from list' }));
    await waitFor(() => expect(AssetService.getInstance(app).getCollectionSettings(collectionId).randomTables).toEqual([GEAR]));

    fireEvent.click(optionsOf(sidebar, /Items/));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from list' }));
    await waitFor(() => expect(AssetService.getInstance(app).getCollectionSettings(collectionId).lootBases).toEqual([]));
    await waitFor(() => expect(options()).toHaveLength(1));
    expect(app.vault.getFileByPath('Loot/Items.base')).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('searchbox', { name: 'Search tables' }));
  });

  it('puts a removed table back as it was with Undo, in its place', async () => {
    const renamed = { ...RUMOURS, label: 'Tavern talk', future: 1 } as RandomTableSource;
    const { app, collectionId } = await mount([GEAR, renamed, { path: 'Gone.md', index: 0, kind: 'text' }]);
    const sidebar = await screen.findByRole('complementary');
    const settings = (): RandomTableSource[] | undefined => AssetService.getInstance(app).getCollectionSettings(collectionId).randomTables;

    fireEvent.click(optionsOf(sidebar, /Tavern talk/));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Remove from list' }));
    await waitFor(() => expect(vi.mocked(showNotice)).toHaveBeenCalled());
    expect(settings()).toHaveLength(2);
    clickUndo();
    await waitFor(() => expect(settings()).toEqual([GEAR, renamed, { path: 'Gone.md', index: 0, kind: 'text' }]));
  });

  it('never brings back a table removed elsewhere when renaming it', async () => {
    const { app, collectionId } = await mount([RUMOURS, GEAR]);
    const sidebar = await screen.findByRole('complementary');
    fireEvent.click(optionsOf(sidebar, /Rumours in the Taproom/));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const field = await screen.findByRole('textbox', { name: /New name for/ });
    // Another window takes it off the list while the name is typed here.
    await AssetService.getInstance(app).updateCollectionSettings(collectionId, { randomTables: [GEAR] });
    fireEvent.change(field, { target: { value: 'Tavern talk' } });
    fireEvent.blur(field);
    await act(async () => { await Promise.resolve(); });
    expect(AssetService.getInstance(app).getCollectionSettings(collectionId).randomTables).toEqual([GEAR]);
  });

  it('marks a table whose note is gone and does not roll it', async () => {
    await mount([{ path: 'Gone.md', index: 0, kind: 'text' }]);
    const roll = await screen.findByRole('button', { name: 'Roll Gone' });
    expect((roll as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector('.atlas-tables-chip--problem')?.textContent).toBe('The note is gone');
  });
});

describe('New table', () => {
  const PDF = 'd6 Encounter\n1 Two giant rats fighting over a dead centipede\n2 A brewery cat, Mustard\n3 Ale seeps through the ceiling; the smell draws a swarm of rats\n4 A ghostly whisper\n5 A loose flagstone hides a fall into a cis-\ntern with `2d6` gp\n7 Nothing but warm air';

  it('shows the pasted table read only with its problems, writes it as a note under a free name and rolls it once', async () => {
    const { app, store, collectionId } = await mount([RUMOURS]);
    await app.vault.createFolder(`atlas-vtt/collections/${collectionId}/tables`);
    await app.vault.create(`atlas-vtt/collections/${collectionId}/tables/Cellar.md`, 'taken');

    fireEvent.click(within(await screen.findByRole('complementary')).getByRole('button', { name: 'New table' }));
    const dialog = screen.getByRole('dialog', { name: 'New table' });
    expect(within(dialog).queryByRole('radio', { name: 'Import file' })).toBeNull();
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
    const save = within(dialog).getByRole('button', { name: 'Save and roll' }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Table to paste' }), { target: { value: PDF } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'Cellar' } });

    const chips = [...dialog.querySelectorAll('.atlas-tables-chip')].map((chip) => chip.textContent);
    expect(chips).toEqual(['Rolls d6', '1 row the die never rolls', '1 gap']);
    expect(within(dialog).getByText('A loose flagstone hides a fall into a cistern with', { exact: false })).toBeTruthy();
    expect(within(dialog).getByText('2d6 is rolled with the result')).toBeTruthy();
    // Nothing in the preview can be edited.
    expect(dialog.querySelector('.atlas-paste-table__preview input, .atlas-paste-table__preview textarea, .atlas-paste-table__preview [contenteditable]')).toBeNull();

    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    fireEvent.click(save);
    const path = `atlas-vtt/collections/${collectionId}/tables/Cellar 2.md`;
    await waitFor(() => expect(app.vault.getFileByPath(path)).toBeTruthy());
    expect(await app.vault.read(app.vault.getFileByPath(path)!)).toMatch(/^## Cellar\n\n\| d6 \| Encounter \|\n\| --- \| --- \|\n\| 1 \| Two giant rats/);
    await waitFor(() => expect(AssetService.getInstance(app).getCollectionSettings(collectionId).randomTables).toContainEqual(
      { path, table: 'Cellar', index: 0, kind: 'text' },
    ));
    await waitFor(() => expect(store.getState().lootRoller.lastRoll?.results?.[0]?.text).toBe('Two giant rats fighting over a dead centipede'));
    expect(store.getState().lootRoller.selected).toBe(`${path}#0`);
  });

  it('writes the tables folder where the collection has none yet', async () => {
    const { app, collectionId } = await mount([]);
    fireEvent.click(await screen.findByRole('button', { name: 'New table' }));
    const dialog = screen.getByRole('dialog', { name: 'New table' });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Table to paste' }), { target: { value: 'Weight\tItem\tPrice\n3\tRope\t1 sp\n1\tLantern\t5 gp' } });
    fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), { target: { value: 'Gear' } });
    expect(within(dialog).getByRole('radio', { name: 'Items' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Save and roll' }));
    await waitFor(() => expect(app.vault.getFileByPath(`atlas-vtt/collections/${collectionId}/tables/Gear.md`)).toBeTruthy());
    await waitFor(() => expect(AssetService.getInstance(app).getCollectionSettings(collectionId).randomTables?.[0]?.kind).toBe('items'));
  });

  it('offers only pasted text when the collection has no tables', async () => {
    await mount([]);
    fireEvent.click(await screen.findByRole('button', { name: 'New table' }));
    const dialog = screen.getByRole('dialog', { name: 'New table' });
    expect(within(dialog).getByRole('textbox', { name: 'Table to paste' })).toBeTruthy();
    expect(within(dialog).queryByRole('radiogroup', { name: 'Table source' })).toBeNull();
    expect(within(dialog).queryByRole('radio', { name: 'Import file' })).toBeNull();
    expect(dialog.querySelector('input[type="file"]')).toBeNull();
  });

  it('keeps the destination collection from when the importer was opened', async () => {
    const { app, store, collectionId } = await mount([]);
    const assets = AssetService.getInstance(app);
    const other = await act(async () => assets.createCollection('Other'));
    fireEvent.click(await screen.findByRole('button', { name: 'New table' }));
    act(() => store.setState({ mapPath: `atlas-vtt/collections/${other.id}/scenes/Other.atlasmap` }));
    const text = '## Weather\n| d4 | Result |\n| --- | --- |\n| 1-4 | Rain |';
    fireEvent.change(screen.getByRole('textbox', { name: 'Table to paste' }), { target: { value: text } });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Weather' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save and roll' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'New table' })).toBeNull());
    expect(assets.getCollectionSettings(collectionId).randomTables).toHaveLength(1);
    expect(assets.getCollectionSettings(other.id).randomTables ?? []).toEqual([]);
  });
});
