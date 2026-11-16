import { describe, expect, it } from 'vitest';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import { MAX_PLAYER_FRAMES, readPlayerFrames } from '../../src/app/stores/playerFramesSlice';
import { sceneToFile } from '../../src/app/resources/resourceFileFormat';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const SCENE = 'atlas-vtt/collections/default/Crypt.atlasmap';
const FRAME = { centerX: 300, centerY: 400, scale: 1.5, width: 1280, height: 720 };

/** A scene file as Atlas writes it, holding `state` besides an empty map. */
function sceneFile(state: Record<string, unknown>): string {
  return JSON.stringify({
    version: 4,
    state: { schema: 'atlas-vtt', version: 4, mapPath: SCENE, background: null, grid: null, objects: {}, camera: { x: 0, y: 0, scale: 1 }, ...state },
  });
}

async function load(vault: InMemoryApp, content: string): Promise<ReturnType<typeof createViewAtlasStore>> {
  vault.files.set(SCENE, content);
  const store = createViewAtlasStore(vault.app, `player-frames-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath(SCENE);
  await store.rehydrateFromFile();
  return store;
}

/** What the map file would hold of the store, as its storage writes it. */
function saved(store: ReturnType<typeof createViewAtlasStore>): Record<string, unknown> {
  store.setState({ persistenceEnabled: true });
  const state = store.persist.getOptions().partialize!(store.getState()) as object;
  return JSON.parse(JSON.stringify(sceneToFile(state))) as Record<string, unknown>;
}

describe('saved player frames', () => {
  it('are added, moved and removed without an undo step', async () => {
    const store = await load(createInMemoryApp(), sceneFile({}));
    const history = getHistoryStore(store)!;
    const steps = history.getState().pastStates.length;

    store.getState().addPlayerFrame(FRAME);
    store.getState().addPlayerFrame({ ...FRAME, centerX: 900 });
    store.getState().movePlayerFrame(0, { x: 10, y: 20 });
    expect(store.getState().playerFrames).toEqual([{ ...FRAME, centerX: 10, centerY: 20 }, { ...FRAME, centerX: 900 }]);
    store.getState().removePlayerFrame(0);
    store.getState().removePlayerFrame(5);
    expect(store.getState().playerFrames).toEqual([{ ...FRAME, centerX: 900 }]);
    expect(history.getState().pastStates.length).toBe(steps);
  });

  it('round-trip through the map file, and a scene without any writes none', async () => {
    const vault = createInMemoryApp();
    const store = await load(vault, sceneFile({}));
    expect(store.getState().playerFrames).toEqual([]);
    expect(saved(store)).not.toHaveProperty('playerFrames');

    store.getState().addPlayerFrame(FRAME);
    const file = saved(store);
    expect(file.playerFrames).toEqual([FRAME]);

    const reloaded = await load(vault, JSON.stringify({ version: 4, state: file }));
    expect(reloaded.getState().playerFrames).toEqual([FRAME]);
  });

  it('read as none where the file holds what Atlas cannot read', async () => {
    const vault = createInMemoryApp();
    for (const playerFrames of ['frames', { 0: FRAME }, [FRAME, { ...FRAME, centerX: 'left' }], [{ ...FRAME, width: Number.POSITIVE_INFINITY }], [{ centerX: 1, centerY: 2, scale: 1 }]]) {
      const store = await load(vault, sceneFile({ playerFrames }));
      expect(store.getState().playerFrames).toEqual([]);
    }
    expect(readPlayerFrames(JSON.parse('[{"centerX":1,"centerY":2,"scale":1,"width":3,"height":null}]'))).toEqual([]);
  });

  it('are left behind by the next scene a view loads', async () => {
    const vault = createInMemoryApp();
    const store = await load(vault, sceneFile({ playerFrames: [FRAME] }));
    store.getState().clearMapState();
    expect(store.getState().playerFrames).toEqual([]);
  });

  it('stop at as many as a badge numbers', () => {
    const many = Array.from({ length: MAX_PLAYER_FRAMES + 5 }, (_, index) => ({ ...FRAME, centerX: index }));
    expect(readPlayerFrames(many)).toHaveLength(MAX_PLAYER_FRAMES);
  });
});
