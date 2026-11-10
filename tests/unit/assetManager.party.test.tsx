// @vitest-environment jsdom
import React from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import AssetManager from '../../src/app/packages/components/asset-manager/AssetManager';
import type { AnyAsset, Folder, Tab } from '../../src/app/packages/components/asset-manager/types';
import { AssetService } from '../../src/app/services/AssetService';
import { setPlayerCharacters } from '../../src/app/react/components/context-menu/playerCharacterMenu';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/react/ViewStoreContext', () => ({
  useOptionalAtlasStore: (_selector: unknown, fallback: unknown) => fallback,
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetCrud', () => ({ useAssetCrud: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useTagsAndCollections', () => ({ useTagsAndCollections: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useContextMenus', () => ({ useContextMenus: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useStatblockLink', () => ({ useStatblockLink: () => ({}) }));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useRememberedPlace', () => ({
  useRememberedPlace: () => ({ scrollTopOf: () => 0, setScrollTop: () => {} }),
}));
vi.mock('../../src/app/packages/components/asset-manager/hooks/useAssetManagerEffects', () => ({ useAssetManagerEffects: () => {} }));
vi.mock('../../src/app/packages/components/asset-manager/components/Sidebar', () => ({ Sidebar: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/ModalLayer', () => ({ ModalLayer: () => null }));
vi.mock('../../src/app/packages/components/asset-manager/components/Header', () => ({
  Header: ({ onTabChange }: { onTabChange: (tab: Tab) => void }) => (
    <>
      <button onClick={() => onTabChange('tokens')}>Characters</button>
      <button onClick={() => onTabChange('party')}>Player characters</button>
    </>
  ),
}));
vi.mock('../../src/app/packages/components/asset-manager/components/Content', () => ({
  Content: ({ activeTab, assets, folders, loading, selectedFolderId, onFolderDoubleClick }: {
    activeTab: Tab; assets: AnyAsset[]; folders: Folder[]; loading: boolean; selectedFolderId: string | null; onFolderDoubleClick: (id: string) => void;
  }) => (
    <section aria-label={activeTab} data-loading={loading} data-folder={selectedFolderId ?? 'root'}>
      {folders.map((folder) => <button key={folder.id} onDoubleClick={() => onFolderDoubleClick(folder.id)}>{folder.name}</button>)}
      <ul>{assets.map((asset) => <li key={asset.id}>{asset.name}</li>)}</ul>
    </section>
  ),
}));

const TOKENS = 'atlas-vtt/collections/default/tokens';

/** Hag at the top, a wolf in Beasts, and in Heroes the ranger (a player character) beside a squire who is not one yet. */
async function library(): Promise<{ app: App; assets: AssetService }> {
  AssetService.resetInstance();
  const art = ['Heroes/ranger.png', 'Heroes/squire.png', 'Beasts/wolf.png', 'hag.png'];
  const { app } = createInMemoryApp({
    files: Object.fromEntries(art.map((path) => [`${TOKENS}/${path}`, 'PNG'])),
    folders: [`${TOKENS}/Heroes`, `${TOKENS}/Beasts`],
  });
  // Workspace events reach their listeners, so the refresh after a change reloads the manager.
  const listeners = new Map<string, Array<() => unknown>>();
  app.workspace.on = vi.fn((name: string, callback: () => unknown) => {
    listeners.set(name, [...(listeners.get(name) ?? []), callback]);
    return {};
  }) as never;
  app.workspace.trigger = vi.fn((name: string) => listeners.get(name)?.forEach((callback) => callback())) as never;
  const assets = AssetService.getInstance(app);
  await assets.initialize();
  const ranger = (await assets.getTokenAssets()).find((token) => token.imagePath.endsWith('ranger.png'))!;
  await assets.setPlayerCharacters([ranger.id], true);
  return { app, assets };
}

const openManager = (app: App): void => {
  render(<AtlasUIContext.Provider value={{ app, view: null } as never}><AssetManager isOpen onClose={() => {}} /></AtlasUIContext.Provider>);
};

const pane = (tab: Tab): HTMLElement => screen.getByRole('region', { name: tab });
const listed = (tab: Tab): string[] => Array.from(pane(tab).querySelectorAll('li')).map((item) => item.textContent ?? '');
const shownFolders = (tab: Tab): string[] => Array.from(pane(tab).querySelectorAll('button')).map((button) => button.textContent ?? '');

describe('the asset manager with player characters', () => {
  beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists the player characters on their tab and the others on the Characters tab', async () => {
    openManager((await library()).app);
    await waitFor(() => expect(listed('tokens')).toEqual(['Hag']));
    expect(shownFolders('tokens').sort()).toEqual(['Beasts', 'Heroes']);

    fireEvent.click(screen.getByRole('button', { name: 'Player characters' }));
    await waitFor(() => expect(listed('party')).toEqual(['Ranger']));
    expect(shownFolders('party')).toEqual([]);
  });

  it('leaves an open folder for the root once only player characters fill it', async () => {
    const { app, assets } = await library();
    openManager(app);
    await waitFor(() => expect(shownFolders('tokens')).toContain('Heroes'));

    fireEvent.doubleClick(screen.getByRole('button', { name: 'Heroes' }));
    await waitFor(() => expect(listed('tokens')).toEqual(['Squire']));

    const squire = (await assets.getTokenAssets()).find((token) => token.imagePath.endsWith('squire.png'))!;
    await act(async () => { await setPlayerCharacters(app, assets, [squire.id], true); });

    await waitFor(() => expect(pane('tokens').dataset.folder).toBe('root'));
    await waitFor(() => expect(listed('tokens')).toEqual(['Hag']));
    expect(shownFolders('tokens')).toEqual(['Beasts']);
  });
});
