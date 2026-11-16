// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { MotionGlobalConfig } from 'framer-motion';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { fakeQueries } from '../mocks/fakeLootQueries';
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

const WEAPON_NOTE = '## Magic Weapon\n\n| Part | Result |\n| --- | --- |\n| Name | {Bonus} {Type} |\n| Type | Mace |\n| Bonus | +`1d1000` |\n| Feature | Glows |\n';
const WEAPONS: RandomTableSource = { path: 'Generators/Weapons.md', table: 'Magic Weapon', index: 0, kind: 'generator', saveFolder: 'Loot/Weapons' };

interface Mounted {
  app: App;
  store: ViewAtlasStore;
  collectionId: string;
  files: Map<string, string>;
}

async function mount(randomTables: RandomTableSource[]): Promise<Mounted> {
  const { app, files } = createInMemoryApp({ files: { 'Generators/Weapons.md': WEAPON_NOTE } });
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const collectionId = assets.getDefaultCollectionId();
  await assets.updateCollectionSettings(collectionId, { randomTables });
  const store = createViewAtlasStore(app, 'map');
  store.getState().setPersistenceEnabled(false);
  store.setState({ mapPath: `atlas-vtt/collections/${collectionId}/scenes/Cellar.atlasmap` });
  store.getState().setLootRollerOpen(true);
  render(
    <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
      <ViewStoreProvider store={store}><ContextMenuProvider><RandomTables /></ContextMenuProvider></ViewStoreProvider>
    </AtlasUIContext.Provider>,
  );
  return { app, store, collectionId, files };
}

/** The die of every dice roll lands where `share` of its faces lie below it: 0.1 rolls 101 on a d1000. */
const diceLand = (share: number): void => { vi.spyOn(Math, 'random').mockReturnValue(share); };

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

describe('a generator in the Random tables window', () => {
  it('rolls all its parts into one card, rerolls a part and the unlocked ones, and keeps the history in step', async () => {
    const { app, store, collectionId } = await mount([WEAPONS]);
    const sidebar = await screen.findByRole('complementary');
    const generators = within(sidebar).getByRole('region', { name: 'Generators' });
    expect(within(generators).getByRole('button', { name: /Magic Weapon/ }).textContent).toContain('3');
    await waitFor(() => expect(document.querySelector('.atlas-tables-chip')?.textContent).toBe('3 parts, all rolled together'));
    expect(screen.queryByText('No repeats')).toBeNull();

    diceLand(0.1);
    fireEvent.click(screen.getByRole('button', { name: 'Roll Magic Weapon' }));
    const card = (await screen.findByText('+101 Mace')).closest('li')!;
    expect(within(card).getByText('Glows')).toBeTruthy();
    const history = LootHistoryStore.forApp(app);
    await waitFor(async () => expect(await history.load(collectionId)).toHaveLength(1));

    diceLand(0.9);
    fireEvent.click(within(card).getByRole('button', { name: 'Reroll Bonus' }));
    expect(await within(card).findByText('+901 Mace')).toBeTruthy();
    await waitFor(async () => expect((await history.load(collectionId))[0]?.results?.[0]?.text).toBe('+901 Mace'));
    expect(await history.load(collectionId)).toHaveLength(1);

    const lock = within(card).getByRole('button', { name: 'Keep Bonus when rerolling' });
    fireEvent.click(lock);
    expect(lock.getAttribute('aria-pressed')).toBe('true');
    diceLand(0.5);
    fireEvent.click(within(card).getByRole('button', { name: 'Reroll unlocked' }));
    await waitFor(() => expect(store.getState().lootRoller.lastRoll?.results?.[0]?.fields.map((field) => field.value)).toEqual(['Mace', '+901', 'Glows']));
    expect(within(card).getByText('+901 Mace')).toBeTruthy();

    // The history keeps what the card shows; it offers no rerolls of its own.
    act(() => store.getState().updateLootRoller({ pane: 'history' }));
    await waitFor(() => expect(document.querySelectorAll('.atlas-loot-history__roll')).toHaveLength(1));
    expect(screen.queryByRole('button', { name: 'Reroll unlocked' })).toBeNull();
    expect(document.querySelector('.atlas-loot-history__count')?.textContent).toBe('1 result');
  });

  it('saves a result as a note into its save folder and offers to open it', async () => {
    const { files } = await mount([WEAPONS]);
    await screen.findByRole('complementary');
    diceLand(0.1);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Roll Magic Weapon' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Roll Magic Weapon' }));
    const card = (await screen.findByText('+101 Mace')).closest('li')!;
    fireEvent.click(within(card).getByRole('button', { name: 'Save as note' }));
    await waitFor(() => expect(files.get('Loot/Weapons/+101 Mace.md')).toContain('name: +101 Mace'));
    expect(files.get('Loot/Weapons/+101 Mace.md')).toContain('**Feature.** Glows');
    const message = vi.mocked(showNotice).mock.lastCall?.[0];
    expect(message instanceof DocumentFragment && message.textContent).toBe('Saved “+101 Mace”. Open');
  });

  it('offers no Save as note without a save folder', async () => {
    const { saveFolder: _folder, ...unsaved } = WEAPONS;
    await mount([unsaved]);
    await screen.findByRole('complementary');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Roll Magic Weapon' }).hasAttribute('disabled')).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Roll Magic Weapon' }));
    const card = (await screen.findByText(/ Mace$/)).closest('li')!;
    expect(within(card).queryByRole('button', { name: 'Save as note' })).toBeNull();
  });
});
