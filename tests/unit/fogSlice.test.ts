import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FOG_TOOL, FOG_BRUSH_SIZES } from '../../src/app/fog/fogToolChoices';
import { fogCoverage } from '../../src/app/fog/fogCoverage';
import { createViewAtlasStore, type ViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore } from '../../src/app/stores/history';
import type { FogOperation, FogOperationInput } from '../../src/app/types/fogTypes';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const MAP = { x: 0, y: 0, width: 700, height: 420 };
const rect = (x: number, isErasing = false): FogOperationInput => ({ type: 'rectangle', isErasing, x, y: 0, width: 100, height: 100 });

function scene(): { store: ViewAtlasStore; fog: () => FogOperation[]; steps: () => number; undo: () => void; redo: () => void } {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `fog-slice-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  const history = getHistoryStore(store)!;
  return {
    store,
    fog: () => Object.values(store.getState().objects.fog),
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    redo: () => history.getState().redo(),
  };
}

afterEach(() => vi.useRealTimers());

describe('the fog actions of the view store', () => {
  it('covers the whole map with one rectangle, in one undo step', () => {
    const { store, fog, steps, undo, redo } = scene();
    expect(store.getState().coverAllFog(MAP)).toBe(true);
    expect(fog()).toHaveLength(1);
    expect(fog()[0]).toMatchObject({ kind: 'fog', type: 'rectangle', isErasing: false, ...MAP });
    expect(steps()).toBe(1);
    undo();
    expect(fog()).toEqual([]);
    redo();
    expect(fog()).toHaveLength(1);
  });

  it('covers nothing, and leaves no undo step, where the scene has no map', () => {
    const { store, fog, steps } = scene();
    for (const none of [null, { ...MAP, width: 0 }, { ...MAP, height: -5 }, { ...MAP, x: Number.NaN }, { ...MAP, width: Infinity }]) {
      expect(store.getState().coverAllFog(none)).toBe(false);
    }
    expect(fog()).toEqual([]);
    expect(steps()).toBe(0);
  });

  it('covers what was revealed before, whatever the clock says', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(5_000);
    const { store } = scene();
    store.getState().addFogOperation(rect(0));
    store.getState().addFogOperation(rect(0, true));
    // A clock set back since: the cover must still act after the reveal.
    vi.setSystemTime(1_000);
    store.getState().coverAllFog(MAP);
    const coverage = fogCoverage(store.getState().objects.fog);
    expect(coverage.covers({ x: 50, y: 50 })).toBe(true);
    expect(coverage.covers({ x: 650, y: 400 })).toBe(true);
  });

  it('reveals all by removing the fog of the level shown, in one undo step that brings it back', () => {
    const { store, fog, steps, undo } = scene();
    store.getState().addFogOperation(rect(0));
    store.getState().coverAllFog(MAP);
    const before = steps();
    store.getState().clearFog();
    expect(fog()).toEqual([]);
    expect(steps()).toBe(before + 1);
    undo();
    expect(fog()).toHaveLength(2);
  });

  it('covers and reveals the level shown alone', () => {
    const { store, fog } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'ground' });
    store.getState().coverAllFog(MAP);
    store.getState().setViewedLevel('upper');
    store.getState().coverAllFog(MAP);
    expect(fog().map((operation) => operation.level)).toEqual(['ground', 'upper']);
    store.getState().clearFog();
    expect(fog().map((operation) => operation.level)).toEqual(['ground']);
  });

  it('adds several operations in one undo step, acting in the order given and after the fog there is', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(9_000);
    const { store, fog, steps, undo } = scene();
    store.getState().addFogOperation(rect(0));
    vi.setSystemTime(2_000);
    const before = steps();
    const ids = store.getState().addFogOperations([rect(0, true), rect(50), rect(300)]);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
    expect(steps()).toBe(before + 1);
    const added = ids.map((id) => store.getState().objects.fog[id]!);
    expect(added.map((operation) => operation.timestamp)).toEqual([9_001, 9_002, 9_003]);
    expect(added.map((operation) => operation.isErasing)).toEqual([true, false, false]);
    const coverage = fogCoverage(store.getState().objects.fog);
    // Revealed, then hidden again from 50 on.
    expect(coverage.covers({ x: 25, y: 50 })).toBe(false);
    expect(coverage.covers({ x: 75, y: 50 })).toBe(true);
    expect(coverage.covers({ x: 350, y: 50 })).toBe(true);
    undo();
    expect(fog()).toHaveLength(1);
  });

  it('adds a single operation after all the fog there is, whatever the clock says', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(5_000);
    const { store, steps, undo } = scene();
    // Covered and flipped in the same millisecond: the stamps run ahead of the clock.
    store.getState().coverAllFog(MAP);
    store.getState().addFogOperations([rect(0, true), rect(200, true), rect(400, true)]);
    const newest = Math.max(...Object.values(store.getState().objects.fog).map((operation) => operation.timestamp));
    expect(newest).toBeGreaterThan(5_000);
    // A stroke right after hides again what was just revealed: it must not sort before the reveal.
    const id = store.getState().addFogOperation(rect(0));
    expect(store.getState().objects.fog[id]!.timestamp).toBe(newest + 1);
    expect(fogCoverage(store.getState().objects.fog).covers({ x: 50, y: 50 })).toBe(true);
    expect(steps()).toBe(3);
    undo();
    expect(fogCoverage(store.getState().objects.fog).covers({ x: 50, y: 50 })).toBe(false);
    // With the clock ahead of every stamp, it is the clock's time.
    vi.setSystemTime(9_000);
    const later = store.getState().addFogOperation(rect(0));
    expect(store.getState().objects.fog[later]!.timestamp).toBe(9_000);
  });

  it('acts on a record that holds an entry that is no operation: a file is kept as it came', () => {
    const broken = (): ReturnType<typeof scene> => {
      const made = scene();
      // What a damaged file may hold: nothing, a number, a text.
      const entries: Record<string, unknown> = { none: null, number: 7, text: 'fog' };
      made.store.setState((state) => ({ objects: { ...state.objects, fog: { ...(entries as Record<string, FogOperation>), ...state.objects.fog } } }));
      return made;
    };
    const ids = (store: ViewAtlasStore): string[] => Object.keys(store.getState().objects.fog);

    // Reveal all clears them with the rest, in one undo step that brings them back.
    const cleared = broken();
    cleared.store.getState().addFogOperation(rect(0));
    cleared.store.getState().clearFog();
    expect(ids(cleared.store)).toEqual([]);
    cleared.undo();
    expect(ids(cleared.store)).toHaveLength(4);

    // Cover all and a stroke are added beside them.
    const covered = broken();
    expect(covered.store.getState().coverAllFog(MAP)).toBe(true);
    expect(ids(covered.store).slice(0, 3)).toEqual(['none', 'number', 'text']);
    expect(covered.fog()[3]).toMatchObject({ type: 'rectangle', ...MAP });
    const added = broken();
    expect(added.store.getState().addFogOperations([rect(0), rect(200)])).toHaveLength(2);
    expect(typeof added.store.getState().addFogOperation(rect(400))).toBe('string');
    expect(ids(added.store)).toHaveLength(6);
    // Areas are counted, flipped and made past them.
    expect(added.store.getState().addFogArea({ type: 'rectangle', x: 0, y: 0, width: 50, height: 50 })).not.toBeNull();
    expect(added.store.getState().flipFogArea('none')).toBe(false);
  });

  it('adds nothing, and no undo step, for an empty list', () => {
    const { store, steps } = scene();
    expect(store.getState().addFogOperations([])).toEqual([]);
    expect(steps()).toBe(0);
  });

  it('puts added operations on the level shown', () => {
    const { store, fog } = scene();
    store.setState({ levels: LEVELS, viewedLevel: 'upper' });
    store.getState().addFogOperations([rect(0), rect(200)]);
    expect(fog().map((operation) => operation.level)).toEqual(['upper', 'upper']);
  });
});

describe('the fog tool\'s choices in the view store', () => {
  it('start with the brush hiding, and are never an undo step', () => {
    const { store, steps } = scene();
    expect(store.getState().fogTool).toEqual(DEFAULT_FOG_TOOL);
    store.getState().setFogTool({ shape: 'lasso' });
    store.getState().setFogTool({ brushSize: 120 });
    expect(store.getState().fogTool).toEqual({ shape: 'lasso', brushSize: 120 });
    expect(steps()).toBe(0);
  });

  it('keep the brush within its limits', () => {
    const { store } = scene();
    store.getState().setFogTool({ brushSize: 5000 });
    expect(store.getState().fogTool.brushSize).toBe(FOG_BRUSH_SIZES.max);
    store.getState().setFogTool({ brushSize: 0 });
    expect(store.getState().fogTool.brushSize).toBe(FOG_BRUSH_SIZES.min);
  });

  it('stay the same object whichever tool is chosen: nothing that reads them is told', () => {
    const { store } = scene();
    store.getState().setFogTool({ shape: 'polygon' });
    const choices = store.getState().fogTool;
    for (const tool of ['fog', 'move', 'eraser', 'fog'] as const) store.getState().setActiveTool(tool);
    expect(store.getState().fogTool).toBe(choices);
  });
});
