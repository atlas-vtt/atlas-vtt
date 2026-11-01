// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sceneAdoption } from '../../../src/app/services/assetTransfer/sceneAdoption';
import { dropSceneSoundFromJson, linkedMoods, readSceneSound } from '../../../src/app/soundLibrary/sceneSound';
import { createViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import { createSnapshot } from '../../../src/app/snapshots/sceneSnapshotFormat';
import { sceneToFile } from '../../../src/app/resources/resourceFileFormat';
import { vanillaSystemSettings } from '../../../src/app/gameSystems/systemRules';
import type { Mood } from '../../../src/app/sound/soundTypes';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const SCENE = 'atlas-vtt/collections/default/Crypt.atlasmap';

const sceneFile = (state: Record<string, unknown>): string => JSON.stringify({
  version: 4,
  state: { schema: 'atlas-vtt', version: 4, mapPath: SCENE, background: null, grid: null, objects: {}, camera: { x: 0, y: 0, scale: 1 }, ...state },
});

async function load(vault: InMemoryApp, content: string): Promise<ReturnType<typeof createViewAtlasStore>> {
  vault.files.set(SCENE, content);
  const store = createViewAtlasStore(vault.app, `scene-sound-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath(SCENE);
  await store.rehydrateFromFile();
  return store;
}

function saved(store: ReturnType<typeof createViewAtlasStore>): Record<string, unknown> {
  store.setState({ persistenceEnabled: true });
  return store.persist.getOptions().partialize!(store.getState()) as Record<string, unknown>;
}

const mood = (id: string): Mood => ({ id, name: id, order: 1, fadeSeconds: 4, music: 'keep', layers: [] });

describe('reading a scene\'s sound', () => {
  it('takes ids only', () => {
    expect(readSceneSound({ mood: 'a', combatMood: 'b' })).toEqual({ mood: 'a', combatMood: 'b' });
    expect(readSceneSound({ mood: 4, combatMood: 'b' })).toEqual({ combatMood: 'b' });
    expect(readSceneSound({ mood: '' })).toBeNull();
    for (const value of [undefined, null, 'a', 3, [], {}]) expect(readSceneSound(value)).toBeNull();
  });

  it('keeps a key of a later version', () => {
    expect(readSceneSound({ mood: 'a', later: 1 })).toEqual({ mood: 'a', later: 1 });
  });

  it('a link to a mood that is gone reads as no link', () => {
    expect(linkedMoods({ mood: 'gone', combatMood: 'here' }, [mood('here')])).toEqual({ mood: null, combatMood: mood('here') });
    expect(linkedMoods(null, [mood('here')])).toEqual({ mood: null, combatMood: null });
  });
});

describe('the scene file\'s sound', () => {
  it('survives a load and a save, at version 4', async () => {
    const store = await load(createInMemoryApp(), sceneFile({ sound: { mood: 'a', combatMood: 'b' } }));
    expect(store.getState().sound).toEqual({ mood: 'a', combatMood: 'b' });
    const file = saved(store);
    expect(file.sound).toEqual({ mood: 'a', combatMood: 'b' });
    expect(file.version).toBe(4);
    expect((sceneToFile(file) as { sound?: unknown }).sound).toEqual({ mood: 'a', combatMood: 'b' });
  });

  it('a file of the previous format holds none, and saving writes none', async () => {
    const store = await load(createInMemoryApp(), sceneFile({}));
    expect(store.getState().sound).toBeNull();
    expect('sound' in saved(store)).toBe(false);
  });

  it('reads what is no link as none', async () => {
    const store = await load(createInMemoryApp(), sceneFile({ sound: 'tavern' }));
    expect(store.getState().sound).toBeNull();
  });

  it('the setter writes it, and an empty link takes the field away', async () => {
    const store = await load(createInMemoryApp(), sceneFile({}));
    store.getState().setSceneSound({ mood: 'a' });
    expect(saved(store).sound).toEqual({ mood: 'a' });
    store.getState().setSceneSound({});
    expect(store.getState().sound).toBeNull();
    expect('sound' in saved(store)).toBe(false);
  });

  it('the setter reaches the scene\'s file, whose version stays 4', async () => {
    const vault = createInMemoryApp();
    const store = await load(vault, sceneFile({}));
    store.setState({ mapLoaded: true });
    store.getState().setPersistenceEnabled(true);
    store.getState().setSceneSound({ mood: 'a', combatMood: 'b' });
    await store.flushStorage();
    const onDisk = (): { version: number; state: { version: number; sound?: unknown } } => JSON.parse(vault.files.get(SCENE)!) as { version: number; state: { version: number; sound?: unknown } };
    await expect.poll(() => onDisk().state.sound).toBeDefined();
    const file = onDisk();
    expect(file.state.sound).toEqual({ mood: 'a', combatMood: 'b' });
    expect(file.version).toBe(4);
    expect(file.state.version).toBe(4);
    const again = await load(createInMemoryApp(), vault.files.get(SCENE)!);
    expect(again.getState().sound).toEqual({ mood: 'a', combatMood: 'b' });
  });

  it('is never an undo step', async () => {
    const store = await load(createInMemoryApp(), sceneFile({}));
    const history = getHistoryStore(store)!;
    const before = history.getState().pastStates.length;
    store.getState().setSceneSound({ mood: 'a' });
    expect(history.getState().pastStates.length).toBe(before);
  });

  it('stays out of snapshots: it is the scene\'s link, not its state', () => {
    const snapshot = createSnapshot({ version: 4, state: { sound: { mood: 'a' } } as never }, 's', 'S', 1);
    expect('sound' in snapshot.state).toBe(false);
  });
});

describe('a scene joining another collection', () => {
  it('loses its links to moods', () => {
    const file = sceneFile({ sound: { mood: 'a' } });
    const adopted = sceneAdoption('Other', vanillaSystemSettings()).map(file);
    expect((JSON.parse(adopted!) as { state: Record<string, unknown> }).state.sound).toBeUndefined();
  });

  it('drops nothing where there is nothing', () => {
    expect(dropSceneSoundFromJson(sceneFile({}))).toBeNull();
    expect(dropSceneSoundFromJson('[]')).toBeNull();
  });
});
