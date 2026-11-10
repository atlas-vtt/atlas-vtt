import { describe, expect, it, vi } from 'vitest';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { deleteLevel } from '../../../src/app/react/components/levels/levelEditing';
import { presentLevelInsteadOf } from '../../../src/app/services/presentedLevel';
import { presentedSceneOf } from '../../../src/app/services/presentedScene';
import { createTabMetaStore } from '../../../src/app/stores/tabMetaStore';
import type { AtlasView } from '../../../src/app/atlas-view';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('../../../src/app/ui/confirmDialog', () => ({ chooseAction: vi.fn(async () => 'move') }));

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
  { id: 'roof', name: 'Roof', elevation: { bottom: 20, top: 30 }, background: null },
];

describe('deleting the level a view shows', () => {
  it('shows the level that took its objects, in the GM\'s view and on the player view', async () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `level-deletion-${Math.random()}`);
    store.setState({ persistenceEnabled: false, levels: LEVELS, viewedLevel: 'upper' });
    const tabMetaStore = createTabMetaStore();
    const tab = tabMetaStore.getState().addTab('maps/tower.atlasmap', 'Tower');
    tabMetaStore.getState().setActiveTab(tab);
    const storage = new Map<string, unknown>();
    const device = { loadLocalStorage: (key: string) => storage.get(key), saveLocalStorage: (key: string, value: unknown) => void storage.set(key, value) };
    const view = { app: device, tabMetaStore } as unknown as AtlasView;
    presentedSceneOf(device).set({ tabId: tab, filePath: 'maps/tower.atlasmap', levelId: 'upper' });

    const target = await deleteLevel(store, 'upper');
    presentLevelInsteadOf(view, 'upper', target!);

    expect(target).toBe('ground');
    expect(store.getState().levels?.map((level) => level.id)).toEqual(['ground', 'roof']);
    expect(store.getState().viewedLevel).toBe('ground');
    expect(presentedSceneOf(device).get()?.levelId).toBe('ground');
  });

  it('leaves the view and the players on another level where they are', async () => {
    const { app } = createInMemoryApp();
    const store = createViewAtlasStore(app, `level-deletion-${Math.random()}`);
    store.setState({ persistenceEnabled: false, levels: LEVELS, viewedLevel: 'roof' });

    expect(await deleteLevel(store, 'upper')).toBe('ground');
    expect(store.getState().viewedLevel).toBe('roof');
  });
});
