import { afterEach, describe, expect, it, vi } from 'vitest';
import { Notice } from 'obsidian';
import { createInMemoryApp } from '../../mocks/inMemoryVault';
import { createAtlasStorage } from '../../../src/app/services/MapPersistence';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { deleteLevel, moveLevel } from '../../../src/app/react/components/levels/levelEditing';
import { withLevelDeleted, withLevelsReordered, type LevelScene } from '../../../src/app/levels/levelEdits';
import * as levelEdits from '../../../src/app/levels/levelEdits';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';

vi.mock('obsidian', async (importOriginal) => ({ ...(await importOriginal<typeof import('obsidian')>()), Notice: vi.fn() }));
vi.mock('../../../src/app/ui/confirmDialog', () => ({ chooseAction: vi.fn(async () => 'move') }));

const MAP_PATH = 'maps/tower.atlasmap';
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: 'ground.png' },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'upper.png' },
  { id: 'roof', name: 'Roof', elevation: { bottom: 20, top: 30 }, background: 'roof.png' },
];

/** The objects a new scene's file holds (`newSceneFile`, the Universal VTT import): no walls, lights or sounds. */
const NEW_SCENE_OBJECTS = { tokens: { rogue: { id: 'rogue', kind: 'token', x: 1, y: 2, imagePath: 'rogue.png', level: 'upper' } }, fog: {}, pins: {}, texts: {}, drawings: {} };

afterEach(() => vi.restoreAllMocks());

function sceneWithoutSounds(): LevelScene {
  // Typed as always holding every kind; a file need not
  return { levels: LEVELS, background: 'ground.png', exploredMask: null, objects: NEW_SCENE_OBJECTS as unknown as LevelScene['objects'] };
}

function storeOn(scene: LevelScene): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `level-edit-failures-${Math.random()}`);
  store.setState({ persistenceEnabled: false, ...scene, viewedLevel: 'upper' });
  return store;
}

describe('a scene file that leaves out kinds of objects it holds none of', () => {
  it('is read with an empty record of every kind', async () => {
    const { app } = createInMemoryApp({ files: { [MAP_PATH]: JSON.stringify({ version: 5, state: { version: 5, levels: LEVELS, background: 'ground.png', objects: NEW_SCENE_OBJECTS } }) } });
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    const storage = createAtlasStorage(app, { getState: () => ({ mapPath: MAP_PATH }) });

    const read = await storage.getItem('atlas');

    const objects = (read?.state as { objects: Record<string, unknown> }).objects;
    expect(objects).toMatchObject({ walls: {}, lights: {}, audios: {}, tokens: NEW_SCENE_OBJECTS.tokens });
  });

  it('can still lose a level, or have its levels reordered past the first', () => {
    const deleted = withLevelDeleted(sceneWithoutSounds(), 'upper', 'ground');
    const reordered = withLevelsReordered(sceneWithoutSounds(), ['upper', 'ground', 'roof']);

    expect(deleted.levels?.map((level) => level.id)).toEqual(['ground', 'roof']);
    expect(deleted.objects.tokens.rogue?.level).toBe('ground');
    expect(deleted.objects).not.toHaveProperty('audios.rogue');
    expect(reordered.levels?.map((level) => level.id)).toEqual(['upper', 'ground', 'roof']);
  });

  it('can still lose a level from the Scene levels page', async () => {
    const store = storeOn(sceneWithoutSounds());

    expect(await deleteLevel(store, 'upper')).toBe('ground');
    expect(store.getState().levels?.map((level) => level.id)).toEqual(['ground', 'roof']);
  });
});

describe('a level edit that fails', () => {
  it('tells the GM, leaves the scene as it was and is no deletion', async () => {
    const store = storeOn({ levels: LEVELS, background: 'ground.png', exploredMask: null, objects: createViewAtlasStore(createInMemoryApp().app, 'empty').getState().objects });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(levelEdits, 'withLevelDeleted').mockImplementation(() => { throw new Error('broken scene'); });
    vi.spyOn(levelEdits, 'withLevelsReordered').mockImplementation(() => { throw new Error('broken scene'); });

    expect(await deleteLevel(store, 'upper')).toBeNull();
    expect(() => moveLevel(store, 'roof', -1)).not.toThrow();

    expect(store.getState().levels).toBe(LEVELS);
    expect(store.getState().viewedLevel).toBe('upper');
    expect(vi.mocked(Notice).mock.calls.map(([message]) => message)).toEqual([
      'Upper could not be changed. The scene is as it was.',
      'Roof could not be changed. The scene is as it was.',
    ]);
  });
});
