// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { featureAt, featureIndex, difficultAt, difficultCells } from '../../../src/app/mapFeatures/featureIndex';
import { mapFeatureList, MAX_FEATURE_CORNERS, MAX_FEATURE_NAME, MAX_MAP_FEATURES, readTerrain, terrainWith } from '../../../src/app/mapFeatures/mapFeatures';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { withLevelDeleted } from '../../../src/app/levels/levelEdits';
import { objectsMovedWithMap } from '../../../src/app/grid/mapStretchObjects';
import { createAtlasStorage, migrateMapFile } from '../../../src/app/services/MapPersistence';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { MapFeature } from '../../../src/app/types/mapFeatureTypes';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'cellar', name: 'Cellar', elevation: { bottom: -10, top: 0 }, background: null },
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
];

const square = (x: number, y: number, side: number): MapFeature['polygon'] => [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }];
const feature = (id: string, extra: Partial<MapFeature> = {}): MapFeature => ({ id, kind: 'map-feature', name: id, polygon: square(0, 0, 100), ...extra });

function sceneStore(features: Record<string, MapFeature> = {}, levels?: SceneLevel[]): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `map-features-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false,
    ...(levels && { levels, viewedLevel: 'ground' }),
    objects: { ...store.getState().objects, mapFeatures: features },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

afterEach(() => { vi.useRealTimers(); });

describe('reading map features', () => {
  it('reads areas only, a name cut to its limit, terrain only as the rules write it, at most the cap', () => {
    const list = mapFeatureList({
      rubble: feature('rubble', { name: `  ${'R'.repeat(MAX_FEATURE_NAME + 20)}  `, terrain: { difficult: true, cover: 'half' } }),
      odd: { ...feature('odd'), name: 7, terrain: { difficult: 'yes', cover: 'most' } } as unknown as MapFeature,
      line: feature('line', { polygon: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }] }),
      spiky: feature('spiky', { polygon: Array.from({ length: MAX_FEATURE_CORNERS + 1 }, (_, i) => ({ x: Math.cos(i), y: Math.sin(i) })) }),
      broken: 'no' as unknown as MapFeature,
    });
    expect(list.map((entry) => entry.id)).toEqual(['rubble', 'odd']);
    expect(list[0]!.name).toHaveLength(MAX_FEATURE_NAME);
    expect(list[0]!.terrain).toEqual({ difficult: true, cover: 'half' });
    expect(list[1]).toEqual({ id: 'odd', kind: 'map-feature', name: '', polygon: square(0, 0, 100) });
    const many = Object.fromEntries(Array.from({ length: MAX_MAP_FEATURES + 3 }, (_, i) => [`f${i}`, feature(`f${i}`)]));
    expect(mapFeatureList(many)).toHaveLength(MAX_MAP_FEATURES);
    expect(mapFeatureList(many)).toBe(mapFeatureList(many));
  });

  it('lays terrain changes over terrain, and leaves none once nothing is left', () => {
    expect(readTerrain({ cover: 'total', future: 1 })).toEqual({ cover: 'total' });
    expect(readTerrain({})).toBeUndefined();
    expect(terrainWith(undefined, { difficult: true })).toEqual({ difficult: true });
    expect(terrainWith({ difficult: true, cover: 'half' }, { cover: undefined })).toEqual({ difficult: true });
    expect(terrainWith({ difficult: true }, { difficult: undefined })).toBeUndefined();
  });

  it('finds the topmost feature under a point through its index, small and large ones alike', () => {
    const list = mapFeatureList({
      hall: feature('hall', { polygon: square(0, 0, 5000) }),
      pool: feature('pool', { polygon: square(300, 300, 100), terrain: { difficult: true } }),
      statue: feature('statue', { polygon: square(320, 320, 20) }),
    });
    const index = featureIndex(list);
    expect(featureAt(index, { x: 330, y: 330 })?.id).toBe('statue');
    expect(featureAt(index, { x: 350, y: 390 })?.id).toBe('pool');
    expect(featureAt(index, { x: 2000, y: 2000 })?.id).toBe('hall');
    expect(featureAt(index, { x: 6000, y: 10 })).toBeNull();
    expect(difficultAt(index, { x: 330, y: 330 })).toBe(true);
    expect(difficultAt(index, { x: 2000, y: 2000 })).toBe(false);
    expect(difficultCells(mapFeatureList({ hall: feature('hall') }))).toBeNull();
  });
});

describe('map features in the store', () => {
  it('are added, changed and removed, each one undo step, a field given as undefined removed', () => {
    const store = sceneStore();
    const [id] = store.getState().addMapFeatures([{ name: 'Rubble', polygon: square(0, 0, 70), terrain: { difficult: true } }]);
    store.getState().updateMapFeature(id!, { name: 'Loose rubble' });
    store.getState().updateMapFeature(id!, { terrain: undefined });
    expect(store.getState().objects.mapFeatures![id!]).toEqual({ id, kind: 'map-feature', name: 'Loose rubble', polygon: square(0, 0, 70) });
    store.getState().deleteMapFeature(id!);
    expect(store.getState().objects.mapFeatures).toEqual({});
    const history = getHistoryStore(store)!.getState();
    expect(history.pastStates).toHaveLength(4);
    history.undo();
    expect(store.getState().objects.mapFeatures![id!]!.name).toBe('Loose rubble');
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.mapFeatures![id!]!.terrain).toEqual({ difficult: true });
  });

  it('adds many in one step, and no more than a level holds', () => {
    const full = Object.fromEntries(Array.from({ length: MAX_MAP_FEATURES - 1 }, (_, i) => [`f${i}`, feature(`f${i}`)]));
    const store = sceneStore(full);
    const ids = store.getState().addMapFeatures([{ name: 'A', polygon: square(0, 0, 10) }, { name: 'B', polygon: square(0, 0, 10) }]);
    expect(ids).toHaveLength(1);
    expect(getHistoryStore(store)!.getState().pastStates).toHaveLength(1);
  });

  it('stand on the level shown unless their data names one, and the view reads only its level\'s', () => {
    const store = sceneStore({ old: feature('old') }, LEVELS);
    const [shown, below] = store.getState().addMapFeatures([{ name: 'Shown', polygon: square(0, 0, 10) }, { name: 'Below', polygon: square(0, 0, 10), level: 'cellar' }]);
    expect(store.getState().objects.mapFeatures![shown!]!.level).toBe('ground');
    expect(store.getState().objects.mapFeatures![below!]!.level).toBe('cellar');
    // Unset is the first level
    expect(Object.keys(levelObjects(store.getState()).mapFeatures ?? {})).toEqual([shown]);
    expect(Object.keys(levelObjects({ ...store.getState(), viewedLevel: 'cellar' }).mapFeatures ?? {}).sort()).toEqual([below, 'old'].sort());
  });

  it('go with their level when it is deleted, or move to the level that takes its objects', () => {
    const store = sceneStore({ a: feature('a', { level: 'ground' }), b: feature('b', { level: 'cellar' }) }, LEVELS);
    expect(Object.keys(withLevelDeleted(store.getState(), 'ground', null).objects.mapFeatures ?? {})).toEqual(['b']);
    expect(withLevelDeleted(store.getState(), 'ground', 'cellar').objects.mapFeatures!.a!.level).toBe('cellar');
  });

  it('move with the map', () => {
    const store = sceneStore({ a: feature('a') });
    const moved = objectsMovedWithMap(store.getState().objects, (point) => ({ x: point.x * 2, y: point.y }));
    expect(moved.mapFeatures!.a!.polygon.map((point) => point.x)).toEqual([0, 200, 200, 0]);
  });
});

describe('map features in the scene file', () => {
  it('are kept as the file holds them, unknown entries and fields included', () => {
    const odd = { future: true };
    const file = migrateMapFile({ objects: { tokens: {}, mapFeatures: { a: { ...feature('a'), glow: 3 }, odd } } });
    expect(file.objects.mapFeatures).toEqual({ a: { ...feature('a'), glow: 3 }, odd });
    expect(migrateMapFile({ objects: { tokens: {}, mapFeatures: 'broken' } }).objects.mapFeatures).toBeUndefined();
  });

  it('survive a save and a load unchanged, at the version every Atlas reads', async () => {
    vi.useFakeTimers();
    const path = 'maps/cave.atlasmap';
    const { app, files } = createInMemoryApp({ files: { [path]: '{}' } });
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    const storage = createAtlasStorage<{ mapPath: string }, { objects: { tokens: object; mapFeatures: Record<string, MapFeature> } }>(app, { getState: () => ({ mapPath: path }) });
    const features = { rubble: feature('rubble', { terrain: { difficult: true, cover: 'half' } }) };
    await storage.setItem('atlas', { state: { objects: { tokens: {}, mapFeatures: features } }, version: 4 });
    await storage.flush();
    expect(JSON.parse(files.get(path)!).version).toBe(4);
    const read = await storage.getItem('atlas');
    expect(read?.state.objects.mapFeatures).toEqual(features);
  });
});
