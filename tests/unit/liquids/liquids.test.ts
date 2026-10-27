// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_LIQUID_COLORS, liquidList, liquidMovedWithMap, MAX_LIQUID_CORNERS, MAX_LIQUIDS, readFlow } from '../../../src/app/liquids/liquids';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { withLevelDeleted } from '../../../src/app/levels/levelEdits';
import { objectsMovedWithMap } from '../../../src/app/grid/mapStretchObjects';
import { createAtlasStorage, migrateMapFile } from '../../../src/app/services/MapPersistence';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { LiquidSurface, LiquidSurfaceInput } from '../../../src/app/types/liquidTypes';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'cellar', name: 'Cellar', elevation: { bottom: -10, top: 0 }, background: null },
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
];

const COLORS = { surface: '#336699', deep: '#112233', glint: '#ffffff' };
const square = (x: number, y: number, side: number): LiquidSurface['polygon'] => [{ x, y }, { x: x + side, y }, { x: x + side, y: y + side }, { x, y: y + side }];
const pool = (id: string, extra: Partial<LiquidSurface> = {}): LiquidSurface => ({ id, kind: 'liquid', liquid: 'water', polygon: square(0, 0, 100), colors: COLORS, ...extra });
const input = (extra: Partial<LiquidSurfaceInput> = {}): LiquidSurfaceInput => ({ liquid: 'lava', polygon: square(0, 0, 70), colors: COLORS, ...extra });

function sceneStore(liquids: Record<string, LiquidSurface> = {}, levels?: SceneLevel[]): ViewAtlasStore {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `liquids-${Math.random()}`);
  store.setState({
    persistenceEnabled: false, mapLoaded: true, isMapLoading: false,
    ...(levels && { levels, viewedLevel: 'ground' }),
    objects: { ...store.getState().objects, liquids },
  });
  getHistoryStore(store)?.getState().clear();
  return store;
}

afterEach(() => { vi.useRealTimers(); });

describe('reading liquid surfaces', () => {
  it('reads areas of a known kind only, at most the cap, and the same list for the same record', () => {
    const record = {
      a: pool('a'),
      line: pool('line', { polygon: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 0 }] }),
      many: pool('many', { polygon: Array.from({ length: MAX_LIQUID_CORNERS + 1 }, (_, i) => ({ x: Math.cos(i), y: Math.sin(i) })) }),
      oil: { ...pool('oil'), liquid: 'oil' },
      odd: { future: true },
      nan: pool('nan', { polygon: [{ x: 0, y: 0 }, { x: NaN, y: 0 }, { x: 0, y: 10 }] }),
    } as unknown as Record<string, LiquidSurface>;
    const list = liquidList(record);
    expect(list.map((surface) => surface.id)).toEqual(['a']);
    expect(liquidList(record)).toBe(list);
    const full = Object.fromEntries(Array.from({ length: MAX_LIQUIDS + 5 }, (_, i) => [`p${i}`, pool(`p${i}`)]));
    expect(liquidList(full)).toHaveLength(MAX_LIQUIDS);
    expect(liquidList(undefined)).toEqual([]);
  });

  it('reads colours as #rrggbb or the kind\'s own, and the flow as a unit vector or none', () => {
    const [read] = liquidList({ a: pool('a', { liquid: 'lava', colors: { surface: '#ABCDEF', deep: 'red', glint: 7 as unknown as string }, flow: { x: 3, y: 4 } }) });
    expect(read!.colors).toEqual({ surface: '#abcdef', deep: DEFAULT_LIQUID_COLORS.lava.deep, glint: DEFAULT_LIQUID_COLORS.lava.glint });
    expect(read!.flow).toEqual({ x: 0.6, y: 0.8 });
    const [still] = liquidList({ b: pool('b', { flow: { x: 0, y: 0 } }) });
    expect(still!.flow).toBeUndefined();
    const [none] = liquidList({ c: { ...pool('c'), colors: undefined } as unknown as LiquidSurface });
    expect(none!.colors).toEqual(DEFAULT_LIQUID_COLORS.water);
    expect(readFlow({ x: Infinity, y: 1 })).toBeUndefined();
  });
});

describe('liquid surfaces in the store', () => {
  it('are added in one undo step and removed in another', () => {
    const store = sceneStore();
    const ids = store.getState().addLiquids([input(), input({ liquid: 'water' })]);
    expect(ids).toHaveLength(2);
    expect(store.getState().objects.liquids![ids[0]!]).toEqual({ id: ids[0], kind: 'liquid', ...input() });
    store.getState().deleteLiquid(ids[0]!);
    expect(Object.keys(store.getState().objects.liquids!)).toEqual([ids[1]]);
    const history = getHistoryStore(store)!.getState();
    expect(history.pastStates).toHaveLength(2);
    history.undo();
    expect(Object.keys(store.getState().objects.liquids!)).toHaveLength(2);
    getHistoryStore(store)!.getState().undo();
    expect(store.getState().objects.liquids).toEqual({});
  });

  it('take no more than a level holds', () => {
    const full = Object.fromEntries(Array.from({ length: MAX_LIQUIDS - 1 }, (_, i) => [`p${i}`, pool(`p${i}`)]));
    const store = sceneStore(full);
    expect(store.getState().addLiquids([input(), input()])).toHaveLength(1);
  });

  it('stand on the level shown unless their data names one, and the view reads only its level\'s', () => {
    const store = sceneStore({ old: pool('old') }, LEVELS);
    const [shown, below] = store.getState().addLiquids([input(), input({ level: 'cellar' })]);
    expect(store.getState().objects.liquids![shown!]!.level).toBe('ground');
    expect(Object.keys(levelObjects(store.getState()).liquids ?? {})).toEqual([shown]);
    expect(Object.keys(levelObjects({ ...store.getState(), viewedLevel: 'cellar' }).liquids ?? {}).sort()).toEqual([below, 'old'].sort());
  });

  it('go with their level when it is deleted, or move to the level that takes its objects', () => {
    const store = sceneStore({ a: pool('a', { level: 'ground' }), b: pool('b', { level: 'cellar' }) }, LEVELS);
    expect(Object.keys(withLevelDeleted(store.getState(), 'ground', null).objects.liquids ?? {})).toEqual(['b']);
    expect(withLevelDeleted(store.getState(), 'ground', 'cellar').objects.liquids!.a!.level).toBe('cellar');
  });

  it('move with the map, flowing the way the map turns them', () => {
    const store = sceneStore({ a: pool('a', { flow: { x: 1, y: 0 } }), still: pool('still') });
    // A quarter turn clockwise on screen about the origin, and twice as wide.
    const moved = objectsMovedWithMap(store.getState().objects, (point) => ({ x: -point.y * 2, y: point.x }));
    expect(moved.liquids!.a!.polygon[1]).toEqual({ x: -0, y: 100 });
    expect(moved.liquids!.a!.flow!.x).toBeCloseTo(0);
    expect(moved.liquids!.a!.flow!.y).toBeCloseTo(1);
    expect(moved.liquids!.still!.flow).toBeUndefined();
    // An entry that cannot be read keeps what it has.
    expect(liquidMovedWithMap({ future: 1 } as Partial<LiquidSurface>, (point) => point)).toEqual({ future: 1 });
  });
});

describe('liquid surfaces in the scene file', () => {
  it('are kept as the file holds them, unknown entries and fields included', () => {
    const odd = { future: true };
    const file = migrateMapFile({ objects: { tokens: {}, liquids: { a: { ...pool('a'), shine: 3 }, odd } } });
    expect(file.objects.liquids).toEqual({ a: { ...pool('a'), shine: 3 }, odd });
    expect(migrateMapFile({ objects: { tokens: {}, liquids: 'broken' } }).objects.liquids).toBeUndefined();
  });

  it('survive a save and a load unchanged, at the version every Atlas reads', async () => {
    vi.useFakeTimers();
    const path = 'maps/lake.atlasmap';
    const { app, files } = createInMemoryApp({ files: { [path]: '{}' } });
    app.vault.getFileByPath = app.vault.getAbstractFileByPath;
    const storage = createAtlasStorage<{ mapPath: string }, { objects: { tokens: object; liquids: Record<string, LiquidSurface> } }>(app, { getState: () => ({ mapPath: path }) });
    const liquids = { lake: pool('lake', { flow: { x: 0, y: 1 } }) };
    await storage.setItem('atlas', { state: { objects: { tokens: {}, liquids } }, version: 4 });
    await storage.flush();
    expect(JSON.parse(files.get(path)!).version).toBe(4);
    const read = await storage.getItem('atlas');
    expect(read?.state.objects.liquids).toEqual(liquids);
  });
});
