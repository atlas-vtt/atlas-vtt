import { expect } from 'vitest';
import { create, type StoreApi } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import { getHistoryStore, withHistory, type HistorySnapshot, type HistoryState } from '../../src/app/stores/history';
import { changedRec, changeList, hasIndexKeys, recOf, slotOf, type CollectionName, type Entry, type HistoryModel, type ModelState, type Value } from './historyModel';

/** The store the model is held against: the history on immer, as the view store composes it. */
export interface RealState {
  objects: { tokens: Record<string, object>; lightZones?: Record<string, object> };
  grid: object | null;
  background: string | null;
  widgetValues: Record<string, number>;
  exploredEdits: number;
  /** A field the history does not track. */
  notTracked: number;
  apply: (recipe: (draft: Draft<RealState>) => void) => void;
}

export type WholeBranch = 'grid' | 'background' | 'edits';
/** A write of Atlas itself made outside a transaction: what it left in one entity or whole branch. */
export interface OwnWrite { readonly where: CollectionName | WholeBranch; readonly key: string; readonly value: unknown }
export interface Real { store: StoreApi<RealState>; history: () => HistoryState; own: OwnWrite[] }

export function createReal(): Real {
  const store = create<RealState>()(withHistory(immer<RealState>((set) => ({
    objects: { tokens: {} }, grid: null, background: null, widgetValues: {}, exploredEdits: 0, notTracked: 0, apply: (recipe) => set(recipe),
  }))));
  const history = getHistoryStore(store)!;
  return { store, history: () => history.getState(), own: [] };
}

const TRACKED = ['objects', 'grid', 'background', 'widgetValues', 'exploredEdits'] as const;
export const trackedRefs = (state: RealState): unknown[] => TRACKED.map((branch) => state[branch]);

const recordOf = (state: RealState, name: CollectionName): Record<string, Value> | undefined =>
  name === 'tokens' ? state.objects.tokens : name === 'zones' ? state.objects.lightZones : state.widgetValues;
export const realEntries = (state: RealState, name: CollectionName): Entry[] | null => {
  const record = recordOf(state, name);
  return record ? Object.keys(record).map((key) => [key, record[key]!] as const) : null;
};
const WHOLE: Record<WholeBranch, { real: (state: RealState) => unknown; model: (state: ModelState) => unknown }> = {
  grid: { real: (state) => state.grid, model: (state) => state.grid },
  background: { real: (state) => state.background, model: (state) => state.background },
  edits: { real: (state) => state.exploredEdits, model: (state) => state.edits },
};
export const realSlot = (state: RealState, where: CollectionName | WholeBranch, key: string): unknown =>
  where in WHOLE ? WHOLE[where as WholeBranch].real(state) : slotOf(realEntries(state, where as CollectionName) ?? [], key);

function expectEntries(actual: readonly Entry[] | null, wanted: readonly Entry[] | null, label: string): void {
  expect(actual?.map(([key]) => key) ?? null, `P0 ${label} keys`).toEqual(wanted?.map(([key]) => key) ?? null);
  actual?.forEach(([key, value], i) => expect(value, `P0 ${label}.${key}`).toBe(wanted![i]![1]));
}

/** P0 and the step counts: the store holds what the model holds, key order and absence included. */
export function verify(model: HistoryModel, real: Real): void {
  const state = real.store.getState();
  for (const name of ['tokens', 'zones', 'widgets'] as const) expectEntries(realEntries(state, name), recOf(model.state, name)?.entries ?? null, name);
  expect(Object.keys(state.objects), 'P0 objects keys').toEqual(model.state.objects.zones ? ['tokens', 'lightZones'] : ['tokens']);
  for (const branch of Object.keys(WHOLE) as WholeBranch[]) expect(WHOLE[branch].real(state), `P0 ${branch}`).toBe(WHOLE[branch].model(model.state));
  expect([real.history().pastStates.length, real.history().futureStates.length], 'step counts').toEqual([model.undoSteps.length, model.redoSteps.length]);
}

const indexOf = (entries: readonly Entry[], key: string): number => entries.findIndex(([k]) => k === key);

/** P1, P2, P3 and P6 for one collection of a step undone or redone from `from` to `to`. */
function checkCollection(name: CollectionName, pre: RealState, post: RealState, from: ModelState, to: ModelState): Set<string> {
  const fromRec = recOf(from, name);
  const toRec = recOf(to, name);
  if (!changedRec(fromRec, toRec)) return new Set();
  const list = changeList(fromRec?.entries ?? [], toRec?.entries ?? []);
  const changed = new Set(list.changes.filter((change) => change.from !== change.to).map((change) => change.key));
  const was = realEntries(pre, name) ?? [];
  const now = realEntries(post, name) ?? [];
  for (const key of new Set([...was, ...now].map(([k]) => k))) {
    if (changed.has(key)) expect(slotOf(now, key), `P2 ${name}.${key}`).toBe(slotOf(toRec?.entries ?? [], key));
    else expect(slotOf(now, key), `P1 ${name}.${key}`).toBe(slotOf(was, key));
  }
  if (!list.reordered) {
    const stayed = (entries: readonly Entry[]): string[] => entries.map(([k]) => k).filter((key) => indexOf(was, key) >= 0 && indexOf(now, key) >= 0);
    expect(stayed(now), `P3 ${name} order`).toEqual(stayed(was));
    const target = toRec?.entries ?? [];
    if (!hasIndexKeys(was) && !hasIndexKeys(now) && !hasIndexKeys(target)) {
      const added = [...changed].filter((key) => indexOf(was, key) < 0 && indexOf(now, key) >= 0).sort((a, b) => indexOf(target, a) - indexOf(target, b));
      added.forEach((key, j) => expect(indexOf(now, key), `P3 ${name}.${key} place`).toBe(Math.min(indexOf(target, key), now.length - added.length + j)));
    }
  }
  if (name === 'zones' && toRec === null && fromRec !== null) {
    expect(post.objects.lightZones === undefined, 'P6 zones').toBe(was.every(([key]) => changed.has(key)));
  }
  return changed;
}

/**
 * Undo or redo on the model and the store, holding the store to the model (P0) and to what the
 * step as applied may and may not touch: P1, P2, P3, P4, P6 and P7.
 */
export function travel(model: HistoryModel, real: Real, direction: 'undo' | 'redo'): boolean {
  const pre = real.store.getState();
  const stack = direction === 'undo' ? real.history().pastStates : real.history().futureStates;
  const own = stack[stack.length - 1];
  const step = model.travel(direction);
  real.history()[direction]();
  verify(model, real);
  if (!step || !own) return false;
  const post = real.store.getState();
  const [from, to] = direction === 'undo' ? [step.after, step.before] : [step.before, step.after];
  const changed = new Map<string, Set<string>>();
  for (const name of ['tokens', 'zones', 'widgets'] as const) changed.set(name, checkCollection(name, pre, post, from, to));
  for (const branch of Object.keys(WHOLE) as WholeBranch[]) {
    const stepped = WHOLE[branch].model(from) !== WHOLE[branch].model(to);
    if (stepped) changed.set(branch, new Set(['']));
    expect(WHOLE[branch].real(post), `${stepped ? 'P2' : 'P1'} ${branch}`).toBe(stepped ? WHOLE[branch].model(to) : WHOLE[branch].real(pre));
  }
  for (const write of real.own) {
    if (realSlot(pre, write.where, write.key) !== write.value || changed.get(write.where)?.has(write.key)) continue;
    expect(realSlot(post, write.where, write.key), `P7 ${write.where}.${write.key}`).toBe(write.value);
  }
  // Where nothing else wrote since, the store gets the step's other side itself.
  const [side, other]: [HistorySnapshot, HistorySnapshot] = direction === 'undo' ? [own.after, own.before] : [own.before, own.after];
  if (TRACKED.every((branch, i) => trackedRefs(pre)[i] === side[branch])) {
    TRACKED.forEach((branch, i) => expect(trackedRefs(post)[i], `P4 ${branch}`).toBe(other[branch]));
  }
  return true;
}

