// @vitest-environment jsdom
import React from 'react';
import { EventEmitter } from 'events';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { TokenCreator } from '../../src/app/packages/components/asset-manager/TokenCreator';
import { Header } from '../../src/app/packages/components/asset-manager/components/Header';
import type { FilterSearch } from '../../src/app/packages/components/asset-manager/hooks/useFilterSearch';
import { openCreatedScene } from '../../src/app/import/openCreatedScene';
import { generateDungeonFor } from '../../src/app/packages/components/dungeon-generator/openDungeonGenerator';
import { AtlasUIContext } from '../../src/app/react/root/AtlasUIContext';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { NotePinTool } from '../../src/app/tools/NotePinTool';
import { dungeonCreateEntry } from '../../src/app/tools/pinCreateEntries';
import { createInMemoryApp } from '../mocks/inMemoryVault';
import { stubLayout } from '../mocks/jsdomLayout';

vi.mock('../../src/app/packages/components/dungeon-generator/openDungeonGenerator', () => ({ generateDungeonFor: vi.fn() }));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/useAssetCatalog', () => ({
  useAssetCatalog: () => ({ assetService: {}, collections: [{ id: 'Dungeons', name: 'Dungeons' }] }),
}));
vi.mock('../../src/app/packages/components/asset-manager/token-creator/useAssetTags', () => ({ useAssetTags: () => ({ tags: [], createTag: vi.fn(), isCreatingTag: false }) }));
vi.mock('../../src/app/packages/components/asset-manager/components/HeaderSearch', () => ({ HeaderSearch: () => null }));

stubLayout({ width: 800, height: 600 });
const SCENE_MAP = 'atlas-vtt/collections/Dungeons/scenes/Town.atlasmap';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', class { observe(): void {} unobserve(): void {} disconnect(): void {} });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); document.body.empty(); });

describe('the asset manager', () => {
  it('offers Generate Dungeon beside Add Map in its Add menu', () => {
    const onGenerateDungeon = vi.fn();
    const onCreateMap = vi.fn();
    const { app } = createInMemoryApp({ files: {} });
    render(
      <Header
        app={app}
        search=""
        onSearch={vi.fn()}
        query={{} as FilterSearch}
        activeTab="maps"
        onTabChange={vi.fn()}
        assetCounts={null}
        onCreateMap={onCreateMap}
        onGenerateDungeon={onGenerateDungeon}
        onCreateFolder={vi.fn()}
        sidebarToggleLabel="Sidebar"
        onToggleSidebar={vi.fn()}
        sel={{ navigationHistory: { canGoBack: () => false, canGoForward: () => false }, handleNavigateBack: vi.fn(), handleNavigateForward: vi.fn() } as never}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const labels = screen.getAllByRole('menuitem').map((item) => item.textContent);
    expect(labels.indexOf('Generate Dungeon')).toBe(labels.indexOf('Add Map') + 1);
    fireEvent.click(screen.getByRole('menuitem', { name: 'Generate Dungeon' }));
    expect(onGenerateDungeon).toHaveBeenCalledTimes(1);
    expect(onCreateMap).not.toHaveBeenCalled();
  });

  it('adds maps in its map creator without a generator in it', () => {
    const { app } = createInMemoryApp({ files: {} });
    Object.assign(app, { scope: {}, keymap: { pushScope: vi.fn(), popScope: vi.fn() } });
    render(
      <AtlasUIContext.Provider value={{ app, view: null, pixiApp: null, renderer: null }}>
        <TokenCreator isOpen mode="map" selectedCollection="Dungeons" onClose={vi.fn()} />
      </AtlasUIContext.Provider>,
    );
    expect(screen.queryByRole('radio', { name: 'Generate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Create scene' })).toBeNull();
    expect(document.querySelector('.atlas-token-creator__rail')).not.toBeNull();
  });

  it('opens the scene a map import or the generator created', async () => {
    const openFile = vi.fn(async (): Promise<void> => {});
    const scene = { path: SCENE_MAP };
    const app = { vault: { getFileByPath: vi.fn(() => scene) }, workspace: { getLeaf: () => ({ openFile }) } } as unknown as App;
    expect(await openCreatedScene(app, SCENE_MAP, 'Town')).toBe(true);
    expect(openFile).toHaveBeenCalledWith(scene, undefined);
  });

  it('opens a scene of several floors on the level it names, through the view state', async () => {
    const openFile = vi.fn(async (): Promise<void> => {});
    const scene = { path: SCENE_MAP };
    const app = { vault: { getFileByPath: vi.fn(() => scene) }, workspace: { getLeaf: () => ({ openFile }) } } as unknown as App;
    expect(await openCreatedScene(app, SCENE_MAP, 'Town', { level: 'level_a' })).toBe(true);
    expect(openFile).toHaveBeenCalledWith(scene, { state: { level: 'level_a' } });
  });
});

describe('generating a dungeon from the note pin search', () => {
  it('is offered only on a map of a collection, whose scenes a pin may link', () => {
    const { app } = createInMemoryApp({ files: {} });
    const store = createViewAtlasStore(app, 'pin-dungeon-entry');
    expect(dungeonCreateEntry(store, 'maps/town.atlasmap')).toBeNull();
    expect(dungeonCreateEntry(store, null)).toBeNull();
    expect(dungeonCreateEntry(store, SCENE_MAP)?.label('Crypt')).toBe('Generate dungeon “Crypt”');
  });

  it('pins the scene the generator created, in the map’s collection', async () => {
    const { app } = createInMemoryApp({ files: {} });
    Object.assign(app.vault, { getAllLoadedFiles: () => [] });
    const store = createViewAtlasStore(app, 'pin-dungeon-view');
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(SCENE_MAP);
    const eventBus = new EventEmitter();
    const tool = new NotePinTool(eventBus, app, store);
    try {
      store.getState().setActiveTool('note-pin');
      eventBus.emit('canvas-click', { x: 0, y: 0, worldX: 40, worldY: 60, shiftKey: false });
      await Promise.resolve();
      const input = document.querySelector<HTMLInputElement>('#atlas-note-pin-dropdown .pin-search-input')!;
      input.value = 'Crypt';
      input.dispatchEvent(new Event('input'));
      const entry = [...document.querySelectorAll<HTMLElement>('.pin-create-item')].find((item) => item.textContent?.includes('Generate dungeon'));
      expect(entry).toBeDefined();
      let finish!: (scene: { scenePath: string; entryLevel?: string }) => void;
      vi.mocked(generateDungeonFor).mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
      entry!.click();
      // The generator works over the map: the dropdown waits unseen meanwhile
      const dropdown = document.querySelector<HTMLElement>('#atlas-note-pin-dropdown')!;
      await waitFor(() => expect(dropdown.classList.contains('atlas-away')).toBe(true));
      finish({ scenePath: 'atlas-vtt/collections/Dungeons/scenes/Crypt.atlasmap', entryLevel: 'floor-a' });
      await waitFor(() => expect(Object.values(store.getState().objects.pins)).toHaveLength(1));
      // The wizard takes the dropdown's place
      expect(generateDungeonFor).toHaveBeenCalledWith(store, { name: 'Crypt', collectionId: 'Dungeons', anchor: { left: 0, top: 0, width: 800, height: 600 } });
      // The pin opens the dungeon on its entry floor
      expect(Object.values(store.getState().objects.pins)[0]).toMatchObject({ notePath: 'atlas-vtt/collections/Dungeons/scenes/Crypt.atlasmap', sceneLevel: 'floor-a' });
    } finally {
      tool.destroy();
    }
  });
});
