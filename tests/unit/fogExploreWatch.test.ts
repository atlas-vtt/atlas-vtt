import { describe, expect, it } from 'vitest';
import { FogCoverageCache } from '../../src/app/fog/FogCoverageCache';
import { fogCoverage, type FogCoverage } from '../../src/app/fog/fogCoverage';
import { levelObjects } from '../../src/app/levels/levelObjects';
import { sceneToFile } from '../../src/app/resources/resourceFileFormat';
import type { PersistedMapEnvelope } from '../../src/app/services/MapPersistence';
import { createSnapshot, restoreSnapshot } from '../../src/app/snapshots/sceneSnapshotFormat';
import { createViewAtlasStore, type ViewAtlasState, type ViewAtlasStore } from '../../src/app/storeFactory';
import { exploringTokens, watchFogExplore } from '../../src/app/stores/fogExploreWatch';
import { beginHistoryTransaction, endHistoryTransaction, getHistoryStore } from '../../src/app/stores/history';
import { placeTokens } from '../../src/app/stores/tokenStacking';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import type { TokenInput } from '../../src/app/types/viewState';
import type { WallInput } from '../../src/app/types/wallTypes';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const MAP = { x: 0, y: 0, width: 2100, height: 1400 };
const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const START = { x: 350, y: 350 };
const token = (extra: Partial<TokenInput> = {}): TokenInput => ({ ...START, imagePath: 'token.png', ...extra } as TokenInput);
/** A token of the party: one that sees. */
const hero = (extra: Partial<TokenInput> = {}): TokenInput => token({ vision: { enabled: true }, ...extra });

interface Scene {
  store: ViewAtlasStore;
  fog: () => FogOperation[];
  covers: (x: number, y: number) => boolean;
  place: (id: string) => { x: number; y: number };
  steps: () => number;
  undo: () => void;
  redo: () => void;
  stop: () => void;
  /** A recipe written as the online GM's code writes: straight to the store, around its actions. */
  write: (recipe: (draft: ViewAtlasState) => void) => void;
}

/** A scene whose map lies under fog, watched as a map view watches it; fog clears 2 cells (140 px) around the party unless `distance` is null. */
function scene(distance: number | null = 2): Scene {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-explore-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().coverAllFog(MAP);
  if (distance !== null) store.getState().setFogExplore({ distance });
  const cache = new FogCoverageCache();
  const coverage = (): FogCoverage | null => cache.get(levelObjects(store.getState()).fog);
  const stop = watchFogExplore(store, { coverage, mapRect: () => MAP });
  const history = getHistoryStore(store)!;
  return {
    store,
    fog: () => Object.values(store.getState().objects.fog),
    covers: (x, y) => fogCoverage(levelObjects(store.getState()).fog).covers({ x, y }),
    place: (id) => {
      const { x, y } = store.getState().objects.tokens[id]!;
      return { x, y };
    },
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    redo: () => history.getState().redo(),
    stop,
    write: (recipe) => (store.setState as unknown as (recipe: (draft: ViewAtlasState) => void) => void)(recipe),
  };
}

/** Adds a token without the watch hearing of it, so a test begins with a token that stands in fog. */
function standing(scene: Scene, input: TokenInput): string {
  const id = `tok-${Math.random()}`;
  scene.write((draft) => { draft.objects.tokens[id] = { kind: 'token', ...input, id } as ViewAtlasState['objects']['tokens'][string]; });
  return id;
}

/** A drag as the token renderer runs it: the store follows the pointer, and the drop ends the drag's undo step. */
function drag(scene: Scene, ids: readonly string[], to: { x: number; y: number }): void {
  const { store } = scene;
  beginHistoryTransaction(store);
  store.getState().setTokenPositions(ids.map((id, index) => ({ id, x: (START.x + to.x) / 2 + index * 70, y: (START.y + to.y) / 2 })));
  store.getState().dropTokens(ids.map((id, index) => ({ id, x: to.x + index * 70, y: to.y })));
  endHistoryTransaction(store);
}

describe('exploringTokens', () => {
  const state = (tokens: Record<string, TokenInput>, viewedLevel: string | null = null): Parameters<typeof exploringTokens>[0] => ({
    objects: { tokens: Object.fromEntries(Object.entries(tokens).map(([id, input]) => [id, { kind: 'token', ...input, id }])) } as ViewAtlasState['objects'],
    levels: viewedLevel === null ? undefined : LEVELS,
    viewedLevel,
  });

  it('are the tokens on the players\' side: those that see, and those the GM put there', () => {
    const tokens = { sees: hero({ x: 10, y: 20 }), sided: token({ x: 30, y: 40, side: 'players' }), foe: token(), turned: hero({ side: 'opponents' }) };
    expect(exploringTokens(state(tokens), ['sees', 'sided', 'foe', 'turned'])).toEqual([{ x: 10, y: 20 }, { x: 30, y: 40 }]);
  });

  it('leave out hidden tokens, tokens kept beside the map and ids that name none', () => {
    const tokens = { hidden: hero({ isHidden: true }), beside: hero({ offMap: true }), here: hero() };
    expect(exploringTokens(state(tokens), ['hidden', 'beside', 'gone', '__proto__', 'here'])).toEqual([START]);
  });

  it('leave out a token on another level than the one shown', () => {
    const tokens = { below: hero({ level: 'ground' }), unset: hero({ x: 1, y: 2 }), above: hero({ x: 3, y: 4, level: 'upper' }) };
    expect(exploringTokens(state(tokens, 'ground'), ['below', 'unset', 'above'])).toEqual([START, { x: 1, y: 2 }]);
    expect(exploringTokens(state(tokens, 'upper'), ['below', 'unset', 'above'])).toEqual([{ x: 3, y: 4 }]);
  });
});

describe('fog that clears around party tokens', () => {
  it('is revealed where a party token is dropped, in the drag\'s undo step, and undo brings fog and token back together', () => {
    const s = scene();
    const id = standing(s, hero());
    const before = s.steps();
    drag(s, [id], { x: 1050, y: 700 });

    expect(s.steps()).toBe(before + 1);
    expect(s.fog()).toHaveLength(2);
    expect(s.fog()[1]).toMatchObject({ kind: 'fog', type: 'lasso', isErasing: true });
    expect(s.covers(1050, 700)).toBe(false);
    expect(s.covers(1050 + 130, 700)).toBe(false);
    expect(s.covers(1050 + 150, 700)).toBe(true);
    // Nothing along the way: the drag passed here.
    expect(s.covers(700, 525)).toBe(true);

    s.undo();
    expect(s.place(id)).toEqual(START);
    expect(s.fog()).toHaveLength(1);
    expect(s.covers(1050, 700)).toBe(true);
    expect(s.steps()).toBe(before);
  });

  it('writes nothing new on undo or redo: the step brings back what it held', () => {
    const s = scene();
    const id = standing(s, hero());
    drag(s, [id], { x: 1050, y: 700 });
    const revealed = s.fog()[1];

    s.undo();
    s.redo();
    expect(s.place(id)).toEqual({ x: 1050, y: 700 });
    expect(s.fog()).toHaveLength(2);
    expect(s.fog()[1]).toEqual(revealed);
    s.undo();
    // The token is back where fog lies all around it, and stays under it.
    expect(s.fog()).toHaveLength(1);
    s.redo();
    expect(s.fog()).toHaveLength(2);
  });

  it('writes nothing while the option is off, and notes no token as put down', () => {
    const s = scene(null);
    const id = standing(s, hero());
    drag(s, [id], { x: 1050, y: 700 });
    s.store.getState().addTokens([hero({ x: 700, y: 700 })]);
    expect(s.fog()).toHaveLength(1);
    expect(s.store.getState().tokensPutDown).toBeUndefined();
    // Switched on, nothing is revealed until a token is put down.
    s.store.getState().setFogExplore({ distance: 2 });
    expect(s.fog()).toHaveLength(1);
    drag(s, [id], { x: 1400, y: 700 });
    expect(s.fog()).toHaveLength(2);
  });

  it('writes nothing for a token that only moves: a drag under way, re-snapping, a glide', () => {
    const s = scene();
    const id = standing(s, hero());
    s.store.getState().setTokenPositions([{ id, x: 700, y: 700 }]);
    s.store.getState().moveToken(id, 1050, 700);
    expect(s.fog()).toHaveLength(1);
  });

  it('writes nothing for an opponent or a hidden token, and reveals around the party\'s among tokens dropped together', () => {
    const s = scene();
    const foe = standing(s, token());
    const hidden = standing(s, hero({ isHidden: true }));
    drag(s, [foe, hidden], { x: 700, y: 700 });
    expect(s.fog()).toHaveLength(1);

    const sees = standing(s, hero());
    drag(s, [foe, sees], { x: 1050, y: 350 });
    expect(s.fog()).toHaveLength(2);
    // The opponent came down first, the party's token a cell to its right.
    expect(s.covers(1120, 350)).toBe(false);
    expect(s.covers(1050 - 100, 350)).toBe(true);
  });

  it('writes nothing where the token is put down on ground that lies open, and reveals again at the edge of it', () => {
    const s = scene();
    const id = standing(s, hero());
    s.store.getState().addFogOperation({ type: 'rectangle', isErasing: true, x: 700, y: 350, width: 700, height: 700 });
    // Farther than the distance from any fog.
    drag(s, [id], { x: 1050, y: 700 });
    expect(s.fog()).toHaveLength(2);
    drag(s, [id], { x: 1330, y: 700 });
    expect(s.fog()).toHaveLength(3);
    expect(s.covers(1450, 700)).toBe(false);
    expect(s.covers(1480, 700)).toBe(true);
  });

  it('reveals around party tokens dropped together as one piece of fog where they stand together', () => {
    const s = scene();
    const ids = [standing(s, hero()), standing(s, hero()), standing(s, hero())];
    drag(s, ids, { x: 1050, y: 700 });
    expect(s.fog()).toHaveLength(2);
    for (const x of [1050, 1120, 1190]) expect(s.covers(x, 700)).toBe(false);
  });

  it('stops at walls that stop sight', () => {
    const s = scene();
    const room: WallInput[] = [
      { type: 'solid', p1: { x: 980, y: 630 }, p2: { x: 1120, y: 630 } },
      { type: 'solid', p1: { x: 1120, y: 630 }, p2: { x: 1120, y: 770 } },
      { type: 'solid', p1: { x: 1120, y: 770 }, p2: { x: 980, y: 770 } },
      { type: 'solid', p1: { x: 980, y: 770 }, p2: { x: 980, y: 630 } },
    ];
    for (const wall of room) s.store.getState().addWall(wall);
    const id = standing(s, hero());
    drag(s, [id], { x: 1050, y: 700 });
    expect(s.covers(1050, 700)).toBe(false);
    expect(s.covers(1110, 760)).toBe(false);
    // Within the distance, behind the wall.
    expect(s.covers(1150, 700)).toBe(true);
    expect(s.covers(1050, 600)).toBe(true);
  });

  it('reveals around a party token placed on the map, in the step that places it', () => {
    const s = scene();
    const before = s.steps();
    const [id] = s.store.getState().addTokens([hero({ x: 700, y: 700 })]);
    expect(s.steps()).toBe(before + 1);
    expect(s.fog()).toHaveLength(2);
    expect(s.covers(700, 700)).toBe(false);
    s.undo();
    expect(s.store.getState().objects.tokens[id!]).toBeUndefined();
    expect(s.fog()).toHaveLength(1);
  });

  it('reveals nothing around a token added beside the map, and reveals once it is put on the map', () => {
    const s = scene();
    const [id] = s.store.getState().addTokens([hero({ x: -100, y: 100, offMap: true })]);
    expect(s.fog()).toHaveLength(1);
    const before = s.steps();
    s.store.getState().placeOffMapToken(id!, 700, 700);
    expect(s.fog()).toHaveLength(2);
    expect(s.steps()).toBe(before + 1);
  });

  it('reveals where a token is put down by a write around the store\'s actions, as a player\'s move online is, in one undo step', () => {
    const s = scene();
    const id = standing(s, hero());
    const before = s.steps();
    s.write((draft) => placeTokens(draft, [{ id, x: 1050, y: 700 }]));
    expect(s.steps()).toBe(before + 1);
    expect(s.fog()).toHaveLength(2);
    s.undo();
    expect(s.place(id)).toEqual(START);
    expect(s.fog()).toHaveLength(1);
  });

  it('reveals on the level shown only, for tokens that stand on it', () => {
    const s = scene();
    s.store.setState({ levels: LEVELS, viewedLevel: 'upper' });
    s.store.getState().coverAllFog(MAP);
    const below = standing(s, hero({ level: 'ground' }));
    const above = standing(s, hero({ level: 'upper' }));
    const upperFog = (): number => Object.keys(levelObjects(s.store.getState()).fog).length;
    drag(s, [below], { x: 1050, y: 700 });
    expect(upperFog()).toBe(1);
    expect(s.fog()).toHaveLength(2);

    drag(s, [above], { x: 1050, y: 700 });
    expect(upperFog()).toBe(2);
    expect(s.fog().at(-1)).toMatchObject({ isErasing: true, level: 'upper' });
    // The floor below keeps its fog.
    s.store.getState().setViewedLevel('ground');
    expect(s.covers(1050, 700)).toBe(true);
  });

  it('writes nothing while a scene loads, and nothing once the watch has ended', () => {
    const s = scene();
    const id = standing(s, hero());
    s.store.setState({ isMapLoading: true });
    s.store.getState().dropTokens([{ id, x: 700, y: 700 }]);
    s.store.setState({ isMapLoading: false });
    expect(s.fog()).toHaveLength(1);
    s.stop();
    s.store.getState().dropTokens([{ id, x: 1050, y: 700 }]);
    expect(s.fog()).toHaveLength(1);
  });
});

describe('the scene\'s option that party tokens clear fog', () => {
  const SCENE = 'atlas-vtt/collections/default/Crypt.atlasmap';
  const sceneFile = (state: Record<string, unknown>): string => JSON.stringify({
    version: 4,
    state: { schema: 'atlas-vtt', version: 4, mapPath: SCENE, background: null, grid: null, objects: {}, camera: { x: 0, y: 0, scale: 1 }, ...state },
  });

  async function load(vault: InMemoryApp, content: string): Promise<ViewAtlasStore> {
    vault.files.set(SCENE, content);
    const store = createViewAtlasStore(vault.app, `fog-explore-file-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(SCENE);
    await store.rehydrateFromFile();
    return store;
  }

  /** What the map file would hold of the store, as its storage writes it. */
  function saved(store: ViewAtlasStore): Record<string, unknown> {
    store.setState({ persistenceEnabled: true });
    const state = store.persist.getOptions().partialize!(store.getState()) as object;
    return JSON.parse(JSON.stringify(sceneToFile(state))) as Record<string, unknown>;
  }

  it('is set and switched off without an undo step', async () => {
    const store = await load(createInMemoryApp(), sceneFile({}));
    const history = getHistoryStore(store)!;
    const steps = history.getState().pastStates.length;
    store.getState().setFogExplore({ distance: 6 });
    expect(store.getState().fogExplore).toEqual({ distance: 6 });
    store.getState().setFogExplore({ distance: 500 });
    expect(store.getState().fogExplore).toBeUndefined();
    store.getState().setFogExplore({ distance: 3 });
    store.getState().setFogExplore(null);
    expect(store.getState().fogExplore).toBeUndefined();
    expect(history.getState().pastStates).toHaveLength(steps);
  });

  it('round-trips through the map file, and a scene with it off writes none', async () => {
    const vault = createInMemoryApp();
    const store = await load(vault, sceneFile({}));
    expect(store.getState().fogExplore).toBeUndefined();
    expect(saved(store)).not.toHaveProperty('fogExplore');

    store.getState().setFogExplore({ distance: 6 });
    // The note of the tokens put down last is the view's, never the file's.
    const put = store.getState().addTokens([hero()]);
    expect(store.getState().tokensPutDown).toEqual(put);
    const file = saved(store);
    expect(file.fogExplore).toEqual({ distance: 6 });
    expect(file).not.toHaveProperty('tokensPutDown');
    const reloaded = await load(vault, JSON.stringify({ version: 4, state: file }));
    expect(reloaded.getState().fogExplore).toEqual({ distance: 6 });
  });

  it('reads as off where the file holds what Atlas cannot read', async () => {
    const vault = createInMemoryApp();
    for (const fogExplore of [true, 'on', 4, [4], {}, { distance: '4' }, { distance: 0 }, { distance: 51 }, { distance: null }]) {
      const store = await load(vault, sceneFile({ fogExplore }));
      expect(store.getState().fogExplore).toBeUndefined();
    }
  });

  it('is left behind by the next scene a view loads', async () => {
    const store = await load(createInMemoryApp(), sceneFile({ fogExplore: { distance: 6 } }));
    expect(store.getState().fogExplore).toEqual({ distance: 6 });
    store.getState().clearMapState();
    expect(store.getState().fogExplore).toBeUndefined();
  });

  it('is kept in a snapshot, and a snapshot taken with it off switches it off on restoring', () => {
    const envelope = (state: Record<string, unknown>): PersistedMapEnvelope => ({ version: 4, state: { mapPath: SCENE, ...state } });
    const on = createSnapshot(envelope({ fogExplore: { distance: 6 } }), 'a', 'On', 1);
    const off = createSnapshot(envelope({}), 'b', 'Off', 2);
    expect(on.state.fogExplore).toEqual({ distance: 6 });
    expect(restoreSnapshot(envelope({}), on, SCENE).state?.fogExplore).toEqual({ distance: 6 });
    expect(restoreSnapshot(envelope({ fogExplore: { distance: 3 } }), on, SCENE).state?.fogExplore).toEqual({ distance: 6 });
    expect(restoreSnapshot(envelope({ fogExplore: { distance: 3 } }), off, SCENE).state).not.toHaveProperty('fogExplore');
  });
});
