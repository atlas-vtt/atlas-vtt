import { expect, it } from 'vitest';
import { create, type StoreApi } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { getHistoryStore, runUntracked, withHistory } from '../../src/app/stores/history';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { createInMemoryApp } from '../mocks/inMemoryVault';

// What recording an undo step costs on a map of 20,000 walls. The budget holds with VITE_PERF_STRICT=1;
// otherwise the test catches only a slowdown of ten times.
const STRICT = import.meta.env.VITE_PERF_STRICT === '1';
const WALLS = 20_000;
const WARM_UP = 200;
const MEASURED = 1_000;
/** The slow-path undo at 20,000 walls took about 12 ms on an Apple M4 Pro (headless Chromium); ten times that catches a regression. */
const SLOW_UNDO_CATCHER_MS = 120;

interface Stats { median: number; p95: number; max: number }
function stats(values: number[]): Stats {
  const sorted = [...values].sort((a, b) => a - b);
  return { median: sorted[Math.floor(sorted.length / 2)]!, p95: sorted[Math.ceil(sorted.length * 0.95) - 1]!, max: sorted[sorted.length - 1]! };
}
const round = ({ median, p95, max }: Stats): Stats => ({ median: +median.toFixed(4), p95: +p95.toFixed(4), max: +max.toFixed(4) });

function walls(): Record<string, WallSegment> {
  const record: Record<string, WallSegment> = {};
  for (let i = 0; i < WALLS; i++) {
    const door = i % 10 === 0;
    record[`w${i}`] = { id: `w${i}`, kind: 'wall', type: door ? 'door' : 'solid', ...(door ? { closed: true } : {}), p1: { x: i, y: 0 }, p2: { x: i, y: 70 } } as WallSegment;
  }
  return record;
}

interface MapState { objects: { walls: Record<string, WallSegment> }; grid: null; background: null; widgetValues: Record<string, number>; exploredEdits: number }

/** Two states of the map, a door closed and open: each write swaps the walls collection, so the write itself costs nothing. */
function doorStates(): MapState['objects'][] {
  const closed = walls();
  const open = { ...closed, w0: { ...closed.w0!, closed: false } };
  return [{ walls: open }, { walls: closed }];
}

/** Each measured write, and their mean from one timing of all of them (the clock counts in tenths of a millisecond). */
function timeWrites(store: StoreApi<MapState>, states: MapState['objects'][]): { times: number[]; mean: number } {
  for (let i = 0; i < WARM_UP; i++) store.setState({ objects: states[i % 2]! });
  const times: number[] = [];
  const begun = performance.now();
  for (let i = 0; i < MEASURED; i++) {
    const objects = states[i % 2]!;
    const start = performance.now();
    store.setState({ objects });
    times.push(performance.now() - start);
  }
  return { times, mean: (performance.now() - begun) / MEASURED };
}

const initial = (states: MapState['objects'][]): MapState => ({ objects: states[1]!, grid: null, background: null, widgetValues: {}, exploredEdits: 0 });

it('records a door toggle on 20,000 walls within the budget', () => {
  const states = doorStates();
  const recorded = create<MapState>()(withHistory(immer<MapState>(() => initial(states))));
  const plain = create<MapState>()(immer<MapState>(() => initial(states)));
  const measured = timeWrites(recorded, states);
  const unrecorded = timeWrites(plain, states);
  const withSteps = stats(measured.times);
  const baseline = stats(unrecorded.times);
  const overhead = { median: withSteps.median - baseline.median, p95: withSteps.p95 - baseline.p95, max: withSteps.max - baseline.max };
  const history = getHistoryStore(recorded)!.getState();
  console.log(JSON.stringify({
    recording: round(withSteps), baseline: round(baseline), overhead: round(overhead),
    meanRecording: +measured.mean.toFixed(5), meanBaseline: +unrecorded.mean.toFixed(5), steps: history.pastStates.length,
    userAgent: navigator.userAgent, cores: navigator.hardwareConcurrency,
  }));
  expect(history.pastStates).toHaveLength(50);
  expect(withSteps.p95).toBeLessThanOrEqual(STRICT ? 1 : 10);
});

it('reports a door toggle end to end, undo and redo on 20,000 walls, and what the steps keep alive', () => {
  const { app } = createInMemoryApp();
  const store = createViewAtlasStore(app, `history-perf-${Math.random()}`);
  store.setState({ persistenceEnabled: false, objects: { ...store.getState().objects, walls: walls() } });
  const history = getHistoryStore(store)!;
  history.getState().clear();
  const measure = (fn: () => void): number => { const start = performance.now(); fn(); return performance.now() - start; };

  const toggles: number[] = [];
  for (let i = 0; i < 50; i++) toggles.push(measure(() => store.getState().toggleDoor('w0')));
  const retained = new Set(history.getState().pastStates.flatMap((step) => [step.before.objects, step.after.objects])).size;

  const fast: number[] = [];
  const slow: number[] = [];
  const open: number[] = [];
  for (let i = 0; i < 20; i++) {
    store.getState().toggleDoor('w0');
    fast.push(measure(() => history.getState().undo()) + measure(() => history.getState().redo()));
    store.getState().toggleDoor('w0');
    runUntracked(store, () => store.getState().toggleDoor('w10'));
    slow.push(measure(() => history.getState().undo()));
    history.getState().redo();
    history.getState().beginTransaction();
    store.getState().toggleDoor('w20');
    open.push(measure(() => history.getState().undo()));
    history.getState().endTransaction();
  }
  const report = { toggleEndToEnd: round(stats(toggles)), undoRedoFast: round(stats(fast)), undoSlow: round(stats(slow)), undoInTransaction: round(stats(open)), retainedObjectsAfter50Toggles: retained };
  console.log(JSON.stringify(report));
  expect(stats(slow).median).toBeLessThan(SLOW_UNDO_CATCHER_MS);
  expect(stats(open).median).toBeLessThan(SLOW_UNDO_CATCHER_MS);
});
