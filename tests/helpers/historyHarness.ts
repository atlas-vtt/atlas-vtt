import { createHash } from 'node:crypto';
import { create, type StateCreator, type StoreApi } from 'zustand';
import { persist, subscribeWithSelector, type PersistStorage, type StorageValue } from 'zustand/middleware';
import { immer } from 'zustand/middleware/immer';
import type { Draft } from 'immer';
import { temporal as oracleTemporal } from '../oracles/historyBaseline/zundo';
import { createHistoryOptions, getHistoryStore as oracleHistoryStore } from '../oracles/historyBaseline/history';
import { forgetExploredEdits as oracleForget } from '../oracles/historyBaseline/exploredEditHistory';
import { getHistoryStore, withHistory } from '../../src/app/stores/history';
import { forgetExploredEdits } from '../../src/app/stores/exploredEditHistory';
import type { Collection, HistoryOp, ListenerKind, WriteOp } from '../oracles/historyBaseline/traceGenerator';

/** Old and new undo histories on the same store composition as the view store (`storeFactory.ts`). */

type Entity = { readonly v: number };
type Entities = Record<string, Entity>;
export interface ParityState {
  objects: { tokens: Entities; walls: Entities; lightZones?: Entities };
  grid: { size: number } | null;
  background: string | null;
  widgetValues: Record<string, number>;
  exploredEdits: number;
  /** A field the history does not track. */
  note: number;
  apply: (recipe: (draft: Draft<ParityState>) => void) => void;
}
export type ParityStore = StoreApi<ParityState>;

/** What both histories offer, whichever implementation holds it. */
export interface HistoryLike {
  pastStates: readonly unknown[];
  futureStates: readonly unknown[];
  isTracking: boolean;
  undo(): void;
  redo(): void;
  clear(): void;
  pause(): void;
  resume(): void;
  beginTransaction(): void;
  endTransaction(): void;
  abandonTransaction(): void;
  discardTransaction(): void;
  untracked<T>(fn: () => T): T;
}

export type Implementation = 'oracle' | 'new';
/** The oracle's middleware; the harness imports it in this one place. */
export type OracleTemporal = typeof oracleTemporal;

export interface ParityRun {
  store: ParityStore;
  history: () => HistoryLike;
  /** The explored memory forgetting its edits, as the matching implementation does it. */
  forget: () => void;
  /** What persist handed its storage, one entry per `setItem`. */
  payloads: string[];
  /** The stack lengths a listener saw, one entry per notification. */
  observations: string[];
  /** The open transaction levels, counted the way both histories count them. */
  depth: number;
  /** `objects` when the last outermost transaction began, for writes that put it back. */
  saved: ParityState['objects'];
}

/** A canonical encoding that keeps key order and tells an absent key from one holding `undefined`. */
export function encode(value: unknown): string {
  if (value === undefined) return 'u';
  if (value === null) return 'n';
  if (typeof value === 'number') return `#${value}`;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(encode).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).map((key) => `${JSON.stringify(key)}:${encode(record[key])}`).join(',')}}`;
  }
  return '?';
}

export const trackedOf = (state: ParityState): Record<string, unknown> => ({
  objects: state.objects, grid: state.grid, background: state.background, widgetValues: state.widgetValues, exploredEdits: state.exploredEdits,
});

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

const initialState = (): Omit<ParityState, 'apply'> => ({
  objects: { tokens: {}, walls: {} }, grid: null, background: null, widgetValues: {}, exploredEdits: 0, note: 0,
});

function storage(payloads: string[]): PersistStorage<Partial<ParityState>> {
  return {
    getItem: () => null,
    setItem: (_name, value: StorageValue<Partial<ParityState>>) => { payloads.push(encode(value.state)); },
    removeItem: () => undefined,
  };
}

const persisted = (state: ParityState): Partial<ParityState> => ({
  objects: state.objects, grid: state.grid, background: state.background, widgetValues: state.widgetValues, exploredEdits: state.exploredEdits, note: state.note,
});

/** The view store's stack below the history: selector-aware `subscribe`, persist, immer. */
function inner(payloads: string[]): StateCreator<ParityState, [], [['zustand/subscribeWithSelector', never], ['zustand/persist', Partial<ParityState>], ['zustand/immer', never]]> {
  return subscribeWithSelector(persist(immer<ParityState>((set) => ({
    ...initialState(),
    apply: (recipe) => set(recipe),
  })), { name: 'history-parity', storage: storage(payloads), partialize: persisted }));
}

const stacks = (history: HistoryLike): string => `${history.pastStates.length}/${history.futureStates.length}`;

/** A store with the old history (zundo and the former `history.ts`) or the new one. */
export function createParityRun(implementation: Implementation, temporal: OracleTemporal = oracleTemporal): ParityRun {
  const payloads: string[] = [];
  const observations: string[] = [];
  let store: ParityStore;
  let history: () => HistoryLike;
  let forget: () => void;
  if (implementation === 'oracle') {
    let ref: ParityStore | null = null;
    store = create<ParityState>()(temporal(inner(payloads), createHistoryOptions<ParityState>(() => ref!.getState())));
    ref = store;
    const temporalStore = oracleHistoryStore(store)!;
    history = () => temporalStore.getState();
    forget = () => oracleForget(store);
  } else {
    store = create<ParityState>()(withHistory(inner(payloads)));
    const temporalStore = getHistoryStore(store)!;
    history = () => temporalStore.getState();
    forget = () => forgetExploredEdits(store);
  }
  store.subscribe(() => observations.push(stacks(history())));
  return { store, history, forget, payloads, observations, depth: 0, saved: store.getState().objects };
}

function collectionOf(objects: ParityState['objects'], coll: Collection): Entities | undefined {
  return objects[coll];
}

/** Performs a write; `revert` puts back `objects` as the last outermost transaction found it. */
export function applyWrite(run: ParityRun, write: WriteOp): void {
  const { store } = run;
  const state = store.getState();
  const setObjects = (objects: ParityState['objects']): void => store.setState({ objects });
  switch (write.op) {
    case 'put':
      if (write.via === 'setState') setObjects({ ...state.objects, [write.coll]: { ...collectionOf(state.objects, write.coll), [write.id]: { v: write.v } } });
      else state.apply((draft) => { (draft.objects[write.coll] ??= {})[write.id] = { v: write.v }; });
      return;
    case 'del': {
      if (write.via === 'set') return state.apply((draft) => { delete draft.objects[write.coll]?.[write.id]; });
      const rest = { ...collectionOf(state.objects, write.coll) };
      delete rest[write.id];
      return setObjects({ ...state.objects, [write.coll]: rest });
    }
    case 'readd':
      return state.apply((draft) => {
        const entities = (draft.objects[write.coll] ??= {});
        delete entities[write.id];
        entities[write.id] = { v: write.v };
      });
    case 'dropZones': return state.apply((draft) => { delete draft.objects.lightZones; });
    case 'copyBranch': {
      const entities = collectionOf(state.objects, write.coll);
      return setObjects(entities ? { ...state.objects, [write.coll]: { ...entities } } : { ...state.objects });
    }
    case 'grid': return state.apply((draft) => { draft.grid = write.size === null ? null : { size: write.size }; });
    case 'background': return state.apply((draft) => { draft.background = write.value; });
    case 'widget': return state.apply((draft) => {
      if (write.v === null) delete draft.widgetValues[write.id];
      else draft.widgetValues[write.id] = write.v;
    });
    case 'edits': return state.apply((draft) => { draft.exploredEdits = write.n; });
    case 'note': return state.apply((draft) => { draft.note = write.n; });
    case 'revert': return setObjects(run.saved);
  }
}

function begin(run: ParityRun): void {
  if (run.depth === 0) run.saved = run.store.getState().objects;
  run.history().beginTransaction();
  run.depth += 1;
}
function end(run: ParityRun): void {
  run.history().endTransaction();
  run.depth = Math.max(0, run.depth - 1);
}
function abandon(run: ParityRun): void {
  run.history().abandonTransaction();
  run.depth = Math.max(0, run.depth - 1);
}
function discard(run: ParityRun): void {
  run.history().discardTransaction();
  run.depth = 0;
}

/** What a listener of `kind` does when the notification comes. */
function listen(run: ParityRun, kind: ListenerKind, write: WriteOp): void {
  const { history, store } = run;
  switch (kind) {
    case 'note': return store.getState().apply((draft) => { draft.note += 1; });
    case 'untracked': return void history().untracked(() => applyWrite(run, write));
    case 'cancel': applyWrite(run, write); return abandon(run);
    case 'cancelDeferred': applyWrite(run, write); queueMicrotask(() => abandon(run)); return;
    case 'discard': applyWrite(run, write); return discard(run);
    case 'end': return end(run);
    case 'transaction': begin(run); applyWrite(run, write); return end(run);
    case 'begin': return begin(run);
    case 'forget': run.forget(); queueMicrotask(() => run.forget()); return;
  }
}

/**
 * Whether an op lies outside the compared domain: writes of Atlas itself and writes while the
 * history is paused, outside a transaction, are compared only while both stacks are empty.
 */
function outsideDomain(run: ParityRun, op: HistoryOp): boolean {
  const { pastStates, futureStates, isTracking } = run.history();
  if (run.depth > 0 || (pastStates.length === 0 && futureStates.length === 0)) return false;
  if (op.op === 'untracked') return true;
  if (isTracking) return false;
  if (op.op === 'notify') return typeof op.trigger !== 'string';
  return isWrite(op) && op.op !== 'note';
}

const WRITES = new Set(['put', 'del', 'readd', 'dropZones', 'copyBranch', 'grid', 'background', 'widget', 'edits', 'note', 'revert']);
const isWrite = (op: HistoryOp): op is WriteOp => WRITES.has(op.op);

/** Runs one op and lets the microtasks it queued run; false when it was left out of the domain. */
export async function runOp(run: ParityRun, op: HistoryOp): Promise<boolean> {
  if (outsideDomain(run, op)) return false;
  if (isWrite(op)) applyWrite(run, op);
  else switch (op.op) {
    case 'untracked': run.history().untracked(() => applyWrite(run, op.write)); break;
    case 'untrackedEnd': run.history().untracked(() => end(run)); break;
    case 'begin': begin(run); break;
    case 'end': end(run); break;
    case 'abandon': abandon(run); break;
    case 'discard': discard(run); break;
    case 'undo': run.history().undo(); break;
    case 'redo': run.history().redo(); break;
    case 'clear': run.history().clear(); run.depth = 0; break;
    case 'pause': run.history().pause(); break;
    case 'resume': run.history().resume(); break;
    case 'notify': notify(run, op); break;
  }
  for (let i = 0; i < 4; i++) await Promise.resolve();
  return true;
}

function notify(run: ParityRun, op: Extract<HistoryOp, { op: 'notify' }>): void {
  const { store, history } = run;
  // Inside an undo's or redo's notification the plugin cancels only a gesture under way.
  const listener = typeof op.trigger === 'string' && op.listener === 'cancelDeferred' && run.depth === 0 ? null : op.listener;
  let fired = false;
  const stop = listener === null ? (): void => undefined : store.subscribe(() => {
    if (fired) return;
    fired = true;
    stop();
    listen(run, listener, op.write);
  });
  if (op.trigger === 'undo') history().undo();
  else if (op.trigger === 'redo') history().redo();
  else applyWrite(run, op.trigger);
  stop();
}

/** One line per op: the tracked state, both stack lengths, what was persisted and what listeners saw. */
export function snapshotLine(run: ParityRun, payloadsBefore: number, observationsBefore: number): string {
  return [
    encode(trackedOf(run.store.getState())),
    stacks(run.history()),
    run.payloads.slice(payloadsBefore).join(';'),
    run.observations.slice(observationsBefore).join(','),
  ].join('|');
}

/** Runs `ops` and returns the line after each one. */
export async function traceLines(run: ParityRun, ops: readonly HistoryOp[]): Promise<string[]> {
  const lines: string[] = [];
  for (const op of ops) {
    const payloads = run.payloads.length;
    const observations = run.observations.length;
    const ran = await runOp(run, op);
    lines.push(ran ? snapshotLine(run, payloads, observations) : 'skipped');
  }
  return lines;
}

export const opsDigest = (ops: readonly HistoryOp[]): string => sha256(encode(ops));
export const linesDigest = (lines: readonly string[]): string => sha256(lines.join('\n'));
