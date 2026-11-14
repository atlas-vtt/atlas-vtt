import { afterEach, describe, expect, it, vi } from 'vitest';
import { fogAreaList, MAX_FOG_AREAS } from '../../src/app/fog/fogAreas';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const MAP = { x: 0, y: 0, width: 1000, height: 1000 };
const HALL = [{ x: 100, y: 100 }, { x: 300, y: 100 }, { x: 300, y: 200 }, { x: 100, y: 200 }];
const CRYPT = [{ x: 500, y: 500 }, { x: 800, y: 500 }, { x: 650, y: 900 }];
const IN_HALL = { x: 200, y: 150 };
const IN_CRYPT = { x: 650, y: 600 };
const ELSEWHERE = { x: 900, y: 100 };

function scene(): { store: ViewAtlasStore; fog: () => Record<string, FogOperation>; covers: (point: { x: number; y: number }) => boolean; steps: () => number; undo: () => void; redo: () => void } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-revealed-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const history = getHistoryStore(store)!;
  return {
    store,
    fog: () => store.getState().objects.fog,
    covers: (point) => fogCoverage(store.getState().objects.fog).covers(point),
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    redo: () => history.getState().redo(),
  };
}
/** The id of the one remembered revealed fog the level holds. */
const only = (store: ViewAtlasStore): string => {
  const areas = fogAreaList(store.getState().objects.fog);
  expect(areas).toHaveLength(1);
  return areas[0]!.id;
};

afterEach(() => vi.useRealTimers());

describe('revealing fog that is remembered', () => {
  it('takes the fog inside each outline away, as a revealing lasso with the mark, after all the fog there is, in one undo step', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(9_000);
    const { store, fog, covers, steps, undo, redo } = scene();
    store.getState().coverAllFog(MAP);
    // A clock set back since: what is revealed must still act after the cover.
    vi.setSystemTime(1_000);
    const before = steps();
    store.getState().revealFogGround([HALL, CRYPT]);
    expect(steps()).toBe(before + 1);
    // In the order they were given, each a tick after the one before.
    const areas = [...fogAreaList(fog())].sort((a, b) => a.timestamp - b.timestamp);
    expect(areas.map((area) => [area.type, area.isErasing, area.timestamp, area.area])).toEqual([['lasso', true, 9_001, {}], ['lasso', true, 9_002, {}]]);
    expect(areas.map((area) => (area.type === 'lasso' ? area.points : []))).toEqual([HALL, CRYPT]);
    expect([covers(IN_HALL), covers(IN_CRYPT), covers(ELSEWHERE)]).toEqual([false, false, true]);
    undo();
    expect(fogAreaList(fog())).toEqual([]);
    expect(covers(IN_HALL)).toBe(true);
    redo();
    expect(fogAreaList(fog())).toHaveLength(2);
  });

  it('keeps an outline of many corners to the last one: what it reveals is what was there', () => {
    const { store, fog } = scene();
    const round = Array.from({ length: 600 }, (_, index) => ({ x: 500 + 200 * Math.cos((index / 600) * 2 * Math.PI), y: 500 + 200 * Math.sin((index / 600) * 2 * Math.PI) }));
    store.getState().revealFogGround([round]);
    expect(fogAreaList(fog())).toEqual([expect.objectContaining({ type: 'lasso', isErasing: true, points: round })]);
  });

  it('passes over outlines that enclose nothing, and writes nothing, and no undo step, for none', () => {
    const { store, fog, steps } = scene();
    store.getState().revealFogGround([[{ x: 0, y: 0 }, { x: 5, y: 5 }], [{ x: 0, y: 0 }, { x: Number.NaN, y: 5 }, { x: 9, y: 0 }]]);
    store.getState().revealFogGround([]);
    expect(fog()).toEqual({});
    expect(steps()).toBe(0);
  });

  it('puts it on the level shown', () => {
    const { store, fog } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'upper' });
    store.getState().revealFogGround([HALL]);
    expect(Object.values(fog())).toEqual([expect.objectContaining({ level: 'upper', area: {} })]);
  });

  it(`reveals plainly once the level holds as many as are read (${MAX_FOG_AREAS})`, () => {
    const { store, fog, covers } = scene();
    const full: Record<string, FogOperation> = {};
    for (let i = 0; i < MAX_FOG_AREAS - 1; i++) full[`a${i}`] = { id: `a${i}`, kind: 'fog', type: 'rectangle', timestamp: i, isErasing: true, x: 1200 + i, y: 0, width: 1, height: 1, area: {} };
    store.setState((state) => ({ objects: { ...state.objects, fog: { cover: { id: 'cover', kind: 'fog', type: 'rectangle', timestamp: -1, isErasing: false, ...MAP }, ...full } } }));
    store.getState().revealFogGround([HALL, CRYPT]);
    expect(fogAreaList(fog())).toHaveLength(MAX_FOG_AREAS);
    const added = Object.values(fog()).slice(-2);
    expect(added.map((operation) => [operation.isErasing, 'area' in operation])).toEqual([[true, true], [true, false]]);
    expect([covers(IN_HALL), covers(IN_CRYPT)]).toEqual([false, false]);
  });
});

describe('hiding revealed fog again', () => {
  it('makes it plain fog, after all the fog there is, in one undo step: the same fog is back, and nothing is remembered', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(5_000);
    const { store, fog, covers, steps, undo } = scene();
    store.getState().addFogOperation({ type: 'lasso', isErasing: false, points: HALL });
    const shape = fogCoverage(fog()).shape;
    store.getState().revealFogGround([HALL]);
    const id = only(store);
    // The ground was erased once more since.
    vi.setSystemTime(8_000);
    store.getState().addFogOperation({ type: 'rectangle', isErasing: true, ...MAP });
    vi.setSystemTime(100);
    const before = steps();
    expect(store.getState().hideFogArea(id)).toBe(true);
    expect(fog()[id]).toEqual({ id, kind: 'fog', type: 'lasso', timestamp: 8_001, isErasing: false, points: HALL });
    expect(fogAreaList(fog())).toEqual([]);
    expect(fogCoverage(fog()).shape).toEqual(shape);
    expect([covers(IN_HALL), covers(ELSEWHERE)]).toEqual([true, false]);
    expect(steps()).toBe(before + 1);
    undo();
    expect(fog()[id]).toMatchObject({ isErasing: true, area: {}, timestamp: 5_001 });
    expect(covers(IN_HALL)).toBe(false);
  });

  it('keeps fields it does not know, and does nothing for an id that is none of the level shown', () => {
    const { store, fog, steps } = scene();
    const stored = { id: 'old', kind: 'fog', type: 'rectangle', timestamp: 4, isErasing: true, x: 10, y: 20, width: 30, height: 40, area: { name: 'Old' }, later: true, level: 'ground' } as unknown as FogOperation;
    const painted = { id: 'painted', kind: 'fog', type: 'rectangle', timestamp: 5, isErasing: false, x: 0, y: 0, width: 5, height: 5, area: {}, level: 'ground' } as unknown as FogOperation;
    store.setState((state) => ({ levels: LEVELS, viewedLevel: 'ground', objects: { ...state.objects, fog: { old: stored, painted } } }));
    const plain = store.getState().addFogOperation({ type: 'rectangle', isErasing: true, x: 0, y: 0, width: 10, height: 10 });
    // A mark on fog that paints is no remembered reveal.
    for (const id of [plain, 'painted', 'nothing', '__proto__']) expect(store.getState().hideFogArea(id)).toBe(false);
    store.getState().setViewedLevel('upper');
    const before = steps();
    const record = fog();
    expect(store.getState().hideFogArea('old')).toBe(false);
    expect(store.getState().forgetFogArea('old')).toBe(false);
    expect(fog()).toBe(record);
    expect(steps()).toBe(before);
    store.getState().setViewedLevel('ground');
    expect(store.getState().hideFogArea('old')).toBe(true);
    expect(fog().old).toMatchObject({ type: 'rectangle', isErasing: false, later: true, level: 'ground', x: 10, width: 30 });
    expect(fog().old).not.toHaveProperty('area');
  });
});

describe('forgetting revealed fog', () => {
  it('leaves it revealed and takes its mark, in one undo step that brings the mark back', () => {
    const { store, fog, covers, steps, undo } = scene();
    store.getState().coverAllFog(MAP);
    store.getState().revealFogGround([HALL]);
    const id = only(store);
    const { timestamp } = fog()[id]!;
    const before = steps();
    expect(store.getState().forgetFogArea(id)).toBe(true);
    expect(fog()[id]).toEqual({ id, kind: 'fog', type: 'lasso', timestamp, isErasing: true, points: HALL });
    expect(fogAreaList(fog())).toEqual([]);
    expect([covers(IN_HALL), covers(ELSEWHERE)]).toEqual([false, true]);
    expect(steps()).toBe(before + 1);
    expect(store.getState().forgetFogArea(id)).toBe(false);
    undo();
    expect(only(store)).toBe(id);
  });
});

describe('the whole map and what was revealed on it', () => {
  it('forgets what was revealed when all is covered: it lies under the cover, and the level alone is touched', () => {
    const { store, fog, steps, undo } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'ground' });
    store.getState().revealFogGround([HALL]);
    store.getState().setViewedLevel('upper');
    store.getState().revealFogGround([CRYPT]);
    const before = steps();
    store.getState().coverAllFog(MAP);
    expect(steps()).toBe(before + 1);
    // The upper level's is plain now, and the ground's is as it was.
    const marked = (): Array<string | undefined> => Object.values(fog()).filter((operation) => 'area' in operation).map((operation) => operation.level);
    expect(marked()).toEqual(['ground']);
    expect(fogAreaList(store.getState().objects.fog).map((area) => area.level)).toEqual(['ground']);
    undo();
    expect(marked()).toEqual(['ground', 'upper']);
  });

  it('deletes all fog of the level shown, what was revealed and is remembered with it, in the one undo step', () => {
    const { store, fog, steps, undo } = scene();
    store.getState().coverAllFog(MAP);
    store.getState().revealFogGround([HALL]);
    const before = steps();
    store.getState().clearFog();
    expect(fog()).toEqual({});
    expect(steps()).toBe(before + 1);
    // Nothing left: nothing to do, and no step.
    store.getState().clearFog();
    expect(steps()).toBe(before + 1);
    undo();
    expect(Object.keys(fog())).toHaveLength(2);
    expect(fogAreaList(fog())).toHaveLength(1);
  });
});
