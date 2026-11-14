import { afterEach, describe, expect, it, vi } from 'vitest';
import { fogAreaList, isFogArea, MAX_FOG_AREAS, type FogArea, type FogAreaShape } from '../../src/app/fog/fogAreas';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { abandonHistoryTransaction, beginHistoryTransaction, endHistoryTransaction, getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation } from '../../src/app/types/fogTypes';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const MAP = { x: 0, y: 0, width: 1000, height: 1000 };
const HALL: FogAreaShape = { type: 'rectangle', x: 100, y: 100, width: 200, height: 100 };
const CRYPT: FogAreaShape = { type: 'lasso', points: [{ x: 500, y: 500 }, { x: 800, y: 500 }, { x: 650, y: 900 }] };
const IN_HALL = { x: 200, y: 150 };
const IN_CRYPT = { x: 650, y: 600 };
const ELSEWHERE = { x: 900, y: 100 };

function scene(): { store: ViewAtlasStore; fog: () => Record<string, FogOperation>; covers: (point: { x: number; y: number }) => boolean; steps: () => number; undo: () => void; redo: () => void } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-areas-${Math.random()}`);
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

afterEach(() => vi.useRealTimers());

describe('adding a fog area', () => {
  it('adds a hidden area, named or not, in one undo step each', () => {
    const { store, fog, covers, steps, undo, redo } = scene();
    const hall = store.getState().addFogArea(HALL, '  Hall ')!;
    const crypt = store.getState().addFogArea(CRYPT)!;
    expect(steps()).toBe(2);
    expect(fog()[hall]).toMatchObject({ id: hall, kind: 'fog', type: 'rectangle', isErasing: false, x: 100, y: 100, width: 200, height: 100, area: { name: 'Hall' } });
    expect(fog()[crypt]).toMatchObject({ type: 'lasso', isErasing: false, area: {} });
    expect(fog()[crypt]).not.toHaveProperty('area.name');
    expect(covers(IN_HALL)).toBe(true);
    expect(covers(IN_CRYPT)).toBe(true);
    expect(covers(ELSEWHERE)).toBe(false);
    undo();
    expect(Object.keys(fog())).toEqual([hall]);
    redo();
    expect(Object.keys(fog())).toEqual([hall, crypt]);
  });

  it('adds nothing, and no undo step, for a shape that encloses nothing', () => {
    const { store, fog, steps } = scene();
    expect(store.getState().addFogArea({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] })).toBeNull();
    expect(store.getState().addFogArea({ type: 'rectangle', x: 0, y: 0, width: 0, height: 50 })).toBeNull();
    expect(store.getState().addFogArea({ type: 'lasso', points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 10 }, { x: 5, y: 9 }] })).toBeNull();
    expect(fog()).toEqual({});
    expect(steps()).toBe(0);
  });

  it('puts the area on the level shown, after all the fog there is', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(9_000);
    const { store, fog } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'upper' });
    store.getState().addFogOperation({ type: 'rectangle', isErasing: true, ...MAP });
    // A clock set back since: the area must still hide what was revealed.
    vi.setSystemTime(1_000);
    const id = store.getState().addFogArea(HALL)!;
    expect(fog()[id]).toMatchObject({ level: 'upper', timestamp: 9_001 });
  });

  it(`adds no more areas to a level than are read (${MAX_FOG_AREAS}), and still adds to another level`, () => {
    const { store, steps } = scene();
    const full: Record<string, FogOperation> = {};
    for (let i = 0; i < MAX_FOG_AREAS; i++) {
      full[`a${i}`] = { id: `a${i}`, kind: 'fog', type: 'rectangle', timestamp: i, isErasing: false, x: i * 10, y: 0, width: 5, height: 5, area: {}, level: 'ground' };
    }
    store.setState((state) => ({ levels: LEVELS, viewedLevel: 'ground', objects: { ...state.objects, fog: full } }));
    const before = steps();
    expect(store.getState().addFogArea(HALL)).toBeNull();
    expect(steps()).toBe(before);
    store.getState().setViewedLevel('upper');
    expect(store.getState().addFogArea(HALL)).not.toBeNull();
  });
});

describe('flipping a fog area', () => {
  it('reveals a hidden area and hides it again, each one undo step that undo takes back', () => {
    const { store, fog, covers, steps, undo } = scene();
    store.getState().coverAllFog(MAP);
    const hall = store.getState().addFogArea(HALL)!;
    const hiddenAt = fog()[hall]!.timestamp;
    const before = steps();

    expect(store.getState().flipFogArea(hall)).toBe(true);
    expect(steps()).toBe(before + 1);
    expect(fog()[hall]).toMatchObject({ isErasing: true, area: {} });
    // The area alone is revealed, through the cover that lay over the whole map.
    expect(covers(IN_HALL)).toBe(false);
    expect(covers(ELSEWHERE)).toBe(true);

    expect(store.getState().flipFogArea(hall)).toBe(true);
    expect(covers(IN_HALL)).toBe(true);
    expect(steps()).toBe(before + 2);

    undo();
    expect(covers(IN_HALL)).toBe(false);
    undo();
    expect(fog()[hall]).toMatchObject({ isErasing: false, timestamp: hiddenAt });
    expect(covers(IN_HALL)).toBe(true);
  });

  it('acts after everything there is, whatever the clock says', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(5_000);
    const { store, fog, covers } = scene();
    const hall = store.getState().addFogArea(HALL)!;
    store.getState().flipFogArea(hall);
    // Hidden again by a stroke over it, later.
    vi.setSystemTime(8_000);
    const stroke = store.getState().addFogOperation({ type: 'rectangle', isErasing: false, ...MAP });
    expect(covers(IN_HALL)).toBe(true);
    // A clock set back: the flips must still act after the stroke.
    vi.setSystemTime(100);
    store.getState().flipFogArea(hall);
    expect(fog()[hall]).toMatchObject({ isErasing: false, timestamp: 8_001 });
    store.getState().flipFogArea(hall);
    expect(fog()[hall]).toMatchObject({ isErasing: true, timestamp: 8_002 });
    expect(covers(IN_HALL)).toBe(false);
    expect(covers(ELSEWHERE)).toBe(true);
    expect(fog()[stroke]!.timestamp).toBe(8_000);
  });

  it('does nothing, and leaves no undo step, for an id that is no area of the level shown', () => {
    const { store, fog, steps } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'ground' });
    const plain = store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 10, height: 10 });
    const stroke = store.getState().addFogOperation({ type: 'brush', isErasing: false, points: [{ x: 1, y: 1 }], brushRadius: 4 });
    const hall = store.getState().addFogArea(HALL)!;
    store.getState().setViewedLevel('upper');
    const before = steps();
    const record = fog();
    for (const id of [plain, stroke, hall, 'nothing', 'constructor', '__proto__']) expect(store.getState().flipFogArea(id)).toBe(false);
    expect(fog()).toBe(record);
    expect(steps()).toBe(before);
    store.getState().setViewedLevel('ground');
    expect(store.getState().flipFogArea(hall)).toBe(true);
  });
});

describe('changing a fog area', () => {
  it('names it, renames it and takes its name away, each one undo step', () => {
    const { store, fog, steps, undo } = scene();
    const hall = store.getState().addFogArea(HALL)!;
    const before = steps();
    expect(store.getState().updateFogArea(hall, { name: ' Great hall ' })).toBe(true);
    expect(fog()[hall]).toMatchObject({ area: { name: 'Great hall' } });
    expect(store.getState().updateFogArea(hall, { name: 'Great hall' })).toBe(false);
    expect(steps()).toBe(before + 1);
    for (const blank of ['   ', undefined]) {
      store.getState().updateFogArea(hall, { name: 'Hall' });
      expect(store.getState().updateFogArea(hall, { name: blank })).toBe(true);
      expect(fog()[hall]).not.toHaveProperty('area.name');
      expect(isFogArea(fog()[hall])).toBe(true);
    }
    undo();
    expect(fog()[hall]).toMatchObject({ area: { name: 'Hall' } });
    // Changes that say nothing of the name leave it.
    expect(store.getState().updateFogArea(hall, {})).toBe(false);
    expect(fog()[hall]).toMatchObject({ area: { name: 'Hall' } });
  });

  it('gives a rectangle another corner or size and keeps it a rectangle', () => {
    const { store, fog, covers, steps, undo } = scene();
    const hall = store.getState().addFogArea(HALL, 'Hall')!;
    const { timestamp } = fog()[hall]!;
    const before = steps();
    expect(store.getState().updateFogArea(hall, { x: 400, width: 300 })).toBe(true);
    expect(fog()[hall]).toEqual({ id: hall, kind: 'fog', type: 'rectangle', timestamp, isErasing: false, x: 400, y: 100, width: 300, height: 100, area: { name: 'Hall' } });
    expect(covers(IN_HALL)).toBe(false);
    expect(covers({ x: 650, y: 150 })).toBe(true);
    expect(steps()).toBe(before + 1);
    // The outline it has already is no change.
    expect(store.getState().updateFogArea(hall, { x: 400, y: 100, width: 300, height: 100 })).toBe(false);
    expect(steps()).toBe(before + 1);
    undo();
    expect(fog()[hall]).toMatchObject({ x: 100, width: 200 });
  });

  it('makes the area a lasso when it is given corners, keeping when it acts, what it does and its name', () => {
    const { store, fog, covers } = scene();
    const hall = store.getState().addFogArea(HALL, 'Hall')!;
    store.getState().flipFogArea(hall);
    const { timestamp } = fog()[hall]!;
    const corners = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 0, y: 300 }];
    expect(store.getState().updateFogArea(hall, { points: corners, name: 'Yard' })).toBe(true);
    expect(fog()[hall]).toEqual({ id: hall, kind: 'fog', type: 'lasso', timestamp, isErasing: true, points: corners, area: { name: 'Yard' } });
    store.getState().flipFogArea(hall);
    expect(covers({ x: 50, y: 50 })).toBe(true);
    expect(covers({ x: 250, y: 150 })).toBe(false);
  });

  it('takes in an offset an older file holds, and keeps fields it does not know', () => {
    const { store, fog } = scene();
    const stored = { id: 'old', kind: 'fog', type: 'rectangle', timestamp: 4, isErasing: false, x: 10, y: 20, width: 30, height: 40, offsetX: 100, offsetY: 200, area: { name: 'Old', tint: 'red' }, later: true } as unknown as FogOperation;
    store.setState((state) => ({ objects: { ...state.objects, fog: { old: stored } } }));
    expect(store.getState().updateFogArea('old', { width: 50 })).toBe(true);
    expect(fog().old).toEqual({ id: 'old', kind: 'fog', type: 'rectangle', timestamp: 4, isErasing: false, x: 110, y: 220, width: 50, height: 40, area: { name: 'Old', tint: 'red' }, later: true });
    expect(store.getState().updateFogArea('old', { name: '' })).toBe(true);
    expect(fog().old).toMatchObject({ area: { tint: 'red' }, later: true });
    expect(fog().old).not.toHaveProperty('area.name');
  });

  it('refuses an outline that encloses nothing, a rectangle\'s fields on a lasso, and an id that is no area', () => {
    const { store, fog, steps } = scene();
    const hall = store.getState().addFogArea(HALL)!;
    const crypt = store.getState().addFogArea(CRYPT)!;
    const plain = store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 10, height: 10 });
    const before = steps();
    const record = fog();
    expect(store.getState().updateFogArea(hall, { points: [{ x: 0, y: 0 }, { x: 5, y: 5 }] })).toBe(false);
    expect(store.getState().updateFogArea(hall, { width: 0 })).toBe(false);
    expect(store.getState().updateFogArea(hall, { x: Number.NaN })).toBe(false);
    expect(store.getState().updateFogArea(crypt, { x: 5, width: 40 })).toBe(false);
    expect(store.getState().updateFogArea(plain, { name: 'Not an area' })).toBe(false);
    expect(store.getState().updateFogArea('nothing', { name: 'x' })).toBe(false);
    expect(fog()).toBe(record);
    expect(steps()).toBe(before);
  });
});

describe('deleting fog areas', () => {
  it('deletes the areas named, of the level shown, in one undo step', () => {
    const { store, fog, steps, undo } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'ground' });
    const plain = store.getState().addFogOperation({ type: 'rectangle', isErasing: false, x: 0, y: 0, width: 10, height: 10 });
    const hall = store.getState().addFogArea(HALL)!;
    const crypt = store.getState().addFogArea(CRYPT)!;
    store.getState().setViewedLevel('upper');
    const above = store.getState().addFogArea(HALL)!;
    store.getState().setViewedLevel('ground');
    const before = steps();
    store.getState().deleteFogAreas([hall, crypt, plain, above, 'nothing']);
    expect(Object.keys(fog())).toEqual([plain, above]);
    expect(steps()).toBe(before + 1);
    undo();
    expect(Object.keys(fog()).sort()).toEqual([plain, hall, crypt, above].sort());
    // Nothing to delete leaves no step.
    store.getState().deleteFogAreas([plain, above]);
    expect(steps()).toBe(before);
  });
});

describe('the whole map and its areas', () => {
  it('keeps the areas when all is revealed, each revealed, in the one undo step', () => {
    const { store, fog, covers, steps, undo } = scene();
    const hall = store.getState().addFogArea(HALL, 'Hall')!;
    const crypt = store.getState().addFogArea(CRYPT)!;
    store.getState().flipFogArea(crypt);
    store.getState().coverAllFog(MAP);
    const before = steps();
    store.getState().clearFog();
    expect(steps()).toBe(before + 1);
    expect(fogAreaList(fog()).map((area) => [area.id, area.isErasing])).toEqual([[hall, true], [crypt, true]].sort());
    expect(Object.keys(fog())).toHaveLength(2);
    expect(covers(IN_HALL)).toBe(false);
    expect(covers(ELSEWHERE)).toBe(false);
    // Revealed already: nothing to do, and no step.
    store.getState().clearFog();
    expect(steps()).toBe(before + 1);
    undo();
    expect(Object.keys(fog())).toHaveLength(3);
    expect(fog()[hall]).toMatchObject({ isErasing: false });
  });

  it('hides the areas with the map when all is covered, so each is one click from revealed', () => {
    const { store, fog, covers, steps, undo } = scene();
    const hall = store.getState().addFogArea(HALL)!;
    store.getState().flipFogArea(hall);
    const before = steps();
    store.getState().coverAllFog(MAP);
    expect(steps()).toBe(before + 1);
    expect(fog()[hall]).toMatchObject({ isErasing: false });
    expect(covers(IN_HALL)).toBe(true);
    store.getState().flipFogArea(hall);
    expect(covers(IN_HALL)).toBe(false);
    expect(covers(ELSEWHERE)).toBe(true);
    undo();
    undo();
    expect(fog()[hall]).toMatchObject({ isErasing: true });
    expect(covers(ELSEWHERE)).toBe(false);
  });

  it('leaves the areas of other levels as they are', () => {
    const { store, fog } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'ground' });
    const below = store.getState().addFogArea(HALL)!;
    store.getState().setViewedLevel('upper');
    const above = store.getState().addFogArea(HALL)!;
    store.getState().clearFog();
    expect(fog()[below]).toMatchObject({ isErasing: false });
    expect(fog()[above]).toMatchObject({ isErasing: true });
    store.getState().setViewedLevel('ground');
    store.getState().flipFogArea(below);
    store.getState().setViewedLevel('upper');
    store.getState().coverAllFog(MAP);
    expect(fog()[below]).toMatchObject({ isErasing: true });
    expect(fog()[above]).toMatchObject({ isErasing: false });
  });
});

describe('a gesture on a fog area', () => {
  it('is one undo step however often it reshapes the area', () => {
    const { store, fog, steps, undo } = scene();
    const hall = store.getState().addFogArea(HALL)!;
    const before = steps();
    beginHistoryTransaction(store);
    for (const width of [210, 260, 300]) store.getState().updateFogArea(hall, { width });
    endHistoryTransaction(store);
    expect(fog()[hall]).toMatchObject({ width: 300 });
    expect(steps()).toBe(before + 1);
    undo();
    expect(fog()[hall]).toMatchObject({ width: 200 });
  });

  it('selects an area without an undo step', () => {
    const { store, steps } = scene();
    const hall = store.getState().addFogArea(HALL)!;
    const before = steps();
    store.getState().selectFogArea(hall);
    expect(store.getState().fogAreaSelected).toBe(hall);
    store.getState().selectFogArea(null);
    expect(store.getState().fogAreaSelected).toBeNull();
    expect(steps()).toBe(before);
  });
});
