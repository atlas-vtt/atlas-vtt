import { describe, expect, it } from 'vitest';
import { objectsMovedWithMap } from '../../../src/app/grid/mapStretchObjects';
import { objectsAfterLevelEdit } from '../../../src/app/levels/levelMembershipEdits';
import { levelObjects } from '../../../src/app/levels/levelObjects';
import { measureList } from '../../../src/app/measure/keptMeasures';
import { DEFAULT_MEASURE_TOOL, MAX_MEASURES, type KeptMeasure, type MeasureInput } from '../../../src/app/measure/measureTypes';
import { migrateMapFile } from '../../../src/app/services/MapPersistence';
import { createViewAtlasStore, type ViewAtlasStore } from '../../../src/app/storeFactory';
import { getHistoryStore } from '../../../src/app/stores/history';
import type { SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const LEVELS: SceneLevel[] = [
  { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: null },
  { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: null },
];
const RULER: MeasureInput = { shape: 'ruler', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }, { x: 70, y: 140 }] };
const CIRCLE: MeasureInput = { shape: 'circle', points: [{ x: 35, y: 35 }, { x: 175, y: 35 }], color: '#aa3300' };

interface Setup {
  store: ViewAtlasStore;
  steps: () => number;
  undo: () => void;
  redo: () => void;
  ids: () => string[];
}

function setup(levels?: SceneLevel[], viewed?: string): Setup {
  const { app } = createInMemoryApp({ files: {} });
  const store = createViewAtlasStore(app, `measures-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath('maps/measures.atlasmap');
  if (levels) store.setState({ levels, viewedLevel: viewed ?? null });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  return {
    store,
    steps: () => history.getState().pastStates.length,
    undo: () => history.getState().undo(),
    redo: () => history.getState().redo(),
    ids: () => Object.keys(store.getState().objects.measures ?? {}),
  };
}

describe('kept measurements in the store', () => {
  it('are scene objects: kept, changed and deleted with one undo step each', () => {
    const { store, steps, undo, redo, ids } = setup();
    expect(store.getState().objects.measures).toBeUndefined();

    const id = store.getState().addMeasure(CIRCLE)!;
    expect(store.getState().objects.measures![id]).toEqual({ id, kind: 'measure', ...CIRCLE });
    expect(steps()).toBe(1);

    store.getState().updateMeasure(id, { hidden: true, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] });
    expect(store.getState().objects.measures![id]).toMatchObject({ hidden: true, points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] });
    expect(steps()).toBe(2);

    store.getState().deleteMeasure(id);
    expect(ids()).toEqual([]);
    expect(steps()).toBe(3);

    undo();
    expect(measureList(store.getState().objects.measures)).toHaveLength(1);
    undo();
    expect(store.getState().objects.measures![id]).toEqual({ id, kind: 'measure', ...CIRCLE });
    undo();
    expect(store.getState().objects.measures).toBeUndefined();
    redo();
    expect(store.getState().objects.measures![id]).toEqual({ id, kind: 'measure', ...CIRCLE });
  });

  it('removes a field changed to undefined', () => {
    const { store } = setup();
    const id = store.getState().addMeasure({ ...CIRCLE, hidden: true, by: 'player-1' })!;
    store.getState().updateMeasure(id, { color: undefined, hidden: undefined });
    expect(store.getState().objects.measures![id]).toEqual({ id, kind: 'measure', shape: 'circle', points: CIRCLE.points, by: 'player-1' });
  });

  it('keeps the order they were made in', () => {
    const { store } = setup();
    const first = store.getState().addMeasure(RULER)!;
    const second = store.getState().addMeasure(CIRCLE)!;
    expect(measureList(store.getState().objects.measures).map(({ id }) => id)).toEqual([first, second]);
  });

  it('puts a measurement on the level shown, or on the level its data names', () => {
    const { store } = setup(LEVELS, 'upper');
    const shown = store.getState().addMeasure(RULER)!;
    const named = store.getState().addMeasure({ ...CIRCLE, level: 'ground' })!;
    expect(store.getState().objects.measures![shown]!.level).toBe('upper');
    expect(store.getState().objects.measures![named]!.level).toBe('ground');
    expect(measureList(levelObjects(store.getState()).measures).map(({ id }) => id)).toEqual([shown]);

    const flat = setup();
    const id = flat.store.getState().addMeasure(RULER)!;
    expect(flat.store.getState().objects.measures![id]).not.toHaveProperty('level');
  });

  it('clears the level shown in one undo step, and leaves the other levels theirs', () => {
    const { store, steps, undo, ids } = setup(LEVELS, 'upper');
    const low = store.getState().addMeasure({ ...RULER, level: 'ground' })!;
    store.getState().addMeasure(RULER);
    store.getState().addMeasure(CIRCLE);
    const before = steps();

    store.getState().clearMeasures();
    expect(ids()).toEqual([low]);
    expect(steps()).toBe(before + 1);

    undo();
    expect(ids()).toHaveLength(3);

    store.getState().setViewedLevel('ground');
    store.getState().clearMeasures();
    expect(ids()).toHaveLength(2);
    expect(ids()).not.toContain(low);
  });

  it('clears everything in a scene without levels, and is no undo step where there is nothing to clear', () => {
    const { store, steps, ids } = setup();
    store.getState().clearMeasures();
    expect(steps()).toBe(0);
    expect(store.getState().objects.measures).toBeUndefined();

    store.getState().addMeasure(RULER);
    store.getState().addMeasure(CIRCLE);
    store.getState().clearMeasures();
    expect(ids()).toEqual([]);
    expect(steps()).toBe(3);
    store.getState().clearMeasures();
    expect(steps()).toBe(3);
  });

  it('keeps no more than a level holds, and counts each level on its own', () => {
    const { store, steps } = setup(LEVELS, 'upper');
    const full: Record<string, KeptMeasure> = {};
    for (let index = 0; index < MAX_MEASURES; index++) full[`m${index}`] = { id: `m${index}`, kind: 'measure', ...RULER, level: 'upper' };
    store.setState({ objects: { ...store.getState().objects, measures: full } });
    getHistoryStore(store)!.getState().clear();

    expect(store.getState().addMeasure(RULER)).toBeNull();
    expect(steps()).toBe(0);
    expect(store.getState().addMeasure({ ...RULER, level: 'ground' })).not.toBeNull();
  });

  it('replaces whatever stands in their place that is no record', () => {
    const { store } = setup();
    store.setState({ objects: { ...store.getState().objects, measures: 'none' as never } });
    const id = store.getState().addMeasure(RULER)!;
    expect(Object.keys(store.getState().objects.measures!)).toEqual([id]);
  });
});

describe('the measure tool\'s choices and popover', () => {
  it('start as a ruler that fades, shown to players, in the accent colour, and change one choice at a time without an undo step', () => {
    const { store, steps } = setup();
    expect(store.getState().measureTool).toEqual(DEFAULT_MEASURE_TOOL);
    expect(DEFAULT_MEASURE_TOOL).toEqual({ mode: 'ruler', keep: false, players: true, color: null, lineWidth: 1, effect: null });
    store.getState().setMeasureTool({ mode: 'cone', keep: true });
    store.getState().setMeasureTool({ color: '#3366ff' });
    store.getState().setMeasureTool({ effect: 'fire' });
    expect(store.getState().measureTool).toEqual({ mode: 'cone', keep: true, players: true, color: '#3366ff', lineWidth: 1, effect: 'fire' });
    expect(steps()).toBe(0);
  });

  it('closes the popover when its measurement is deleted or cleared, not when another goes', () => {
    const { store } = setup();
    const kept = store.getState().addMeasure(RULER)!;
    const other = store.getState().addMeasure(CIRCLE)!;
    store.getState().openMeasurePopover(kept);
    store.getState().deleteMeasure(other);
    expect(store.getState().measurePopover).toBe(kept);
    store.getState().deleteMeasure(kept);
    expect(store.getState().measurePopover).toBeNull();

    const again = store.getState().addMeasure(RULER)!;
    store.getState().openMeasurePopover(again);
    store.getState().clearMeasures();
    expect(store.getState().measurePopover).toBeNull();

    store.getState().openMeasurePopover(again);
    store.getState().closeMeasurePopover();
    expect(store.getState().measurePopover).toBeNull();
  });

  it('closes the popover when the view shows another level, and keeps it through a clear of another level', () => {
    const { store } = setup(LEVELS, 'upper');
    const low = store.getState().addMeasure({ ...RULER, level: 'ground' })!;
    store.getState().openMeasurePopover(low);
    store.getState().clearMeasures();
    expect(store.getState().measurePopover).toBe(low);
    store.getState().setViewedLevel('ground');
    expect(store.getState().measurePopover).toBeNull();
  });
});

describe('kept measurements with the rest of the scene', () => {
  const kept = (id: string, level?: string): KeptMeasure => ({ id, kind: 'measure', ...RULER, ...(level && { level }) });

  it('go with their level when it is deleted, and stay where another level changes', () => {
    const { store } = setup(LEVELS, 'upper');
    const objects = { ...store.getState().objects, measures: { low: kept('low'), high: kept('high', 'upper'), junk: 4 as never } };
    const withoutUpper = objectsAfterLevelEdit(objects, LEVELS, { rewrite: (id) => (id === 'upper' ? null : id), explicit: false });
    expect(Object.keys(withoutUpper.measures!)).toEqual(['low', 'junk']);
    expect(withoutUpper.measures!.low).toBe(objects.measures.low);

    const merged = objectsAfterLevelEdit(objects, LEVELS, { rewrite: () => 'ground', explicit: true });
    expect(merged.measures!.high).toMatchObject({ level: 'ground' });
    expect(merged.measures!.low).toMatchObject({ level: 'ground' });

    const untouched = objectsAfterLevelEdit(objects, LEVELS, { rewrite: (id) => id, explicit: false });
    expect(untouched).toBe(objects);
  });

  it('follow the map when it is drawn another way: every point, on the level that moved only', () => {
    const { store } = setup();
    const objects = { ...store.getState().objects, measures: { low: kept('low'), high: kept('high', 'upper'), junk: 4 as never } };
    const move = (point: { x: number; y: number }): { x: number; y: number } => ({ x: point.x + 5, y: point.y * 2 });

    const all = objectsMovedWithMap(objects, move);
    expect(all.measures!.low!.points).toEqual([{ x: 5, y: 0 }, { x: 75, y: 0 }, { x: 75, y: 280 }]);
    expect(all.measures!.high!.points).toEqual(all.measures!.low!.points);
    expect(all.measures!.junk).toBe(4);

    const upperOnly = objectsMovedWithMap(objects, move, (object) => (object as KeptMeasure).level === 'upper');
    expect(upperOnly.measures!.low).toBe(objects.measures.low);
    expect(upperOnly.measures!.high!.points[0]).toEqual({ x: 5, y: 0 });
  });

  it('survive a map file as they came, with fields and entries this Atlas cannot read', () => {
    const measures = {
      a: { ...kept('a'), color: '#aa3300', origin: { tokenIds: ['t1'], unseenAtStart: true }, follows: 't1', effect: { kind: 'fire' } },
      odd: { id: 'odd', kind: 'measure', shape: 'spiral', points: [] },
      junk: 4,
    };
    const loaded = migrateMapFile({ schema: 'atlas-map', version: 4, objects: { tokens: {}, measures } });
    expect(loaded.objects.measures).toBe(measures);
    expect(JSON.parse(JSON.stringify(loaded.objects.measures))).toEqual(measures);
    expect(measureList(loaded.objects.measures).map(({ id }) => id)).toEqual(['a']);

    expect(migrateMapFile({ schema: 'atlas-map', version: 4, objects: { tokens: {} } }).objects.measures).toBeUndefined();
    expect(migrateMapFile({ schema: 'atlas-map', version: 4, objects: { tokens: {}, measures: [kept('a')] } }).objects.measures).toBeUndefined();
  });

  it('are written back unchanged by a store that changes one of them', () => {
    const { store } = setup();
    const foreign = { ...kept('a'), follows: 't1' };
    store.setState({ objects: { ...store.getState().objects, measures: { a: foreign, odd: { id: 'odd', shape: 'spiral' } as never } } });
    store.getState().updateMeasure('a', { color: '#112233' });
    expect(store.getState().objects.measures).toEqual({ a: { ...foreign, color: '#112233' }, odd: { id: 'odd', shape: 'spiral' } });
  });
});
