import type { StateCreator, StoreApi, StoreMutatorIdentifier } from 'zustand';
import { createHistory, type HistoryState } from './historyStore';
import { trackedSliceOf, type HistorySnapshot } from './trackedSlice';

type Write<T, U> = Omit<T, keyof U> & U;

declare module 'zustand/vanilla' {
  interface StoreMutators<S, A> {
    'atlas/history': Write<S, { temporal: A }>;
  }
}

type WithHistory = <
  T extends HistorySnapshot,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  config: StateCreator<T, [...Mps, ['atlas/history', unknown]], Mcs>,
) => StateCreator<T, Mps, [['atlas/history', StoreApi<HistoryState>], ...Mcs]>;

/** What the middleware needs of zustand's `set` and store, whatever the state. */
type SetState = (partial: unknown, replace?: boolean) => void;
interface HistoryApi {
  setState: SetState;
  temporal?: StoreApi<HistoryState>;
}
type Creator = (set: SetState, get: () => HistorySnapshot, api: HistoryApi) => unknown;

const historyMiddleware = (config: Creator): Creator => (set, get, api) => {
  // Undo and redo write with zustand's own `set`, below every other middleware: such a write
  // is never recorded and never saved by itself (the next recorded write saves its result).
  const history = createHistory({ read: () => trackedSliceOf(get()), write: (slice) => set(slice) });
  api.temporal = history.store;
  const setState = api.setState;
  api.setState = (partial, replace) => history.record(() => setState(partial, replace));
  return config((partial, replace) => history.record(() => set(partial, replace)), get, api);
};

/**
 * Atlas's undo history, outermost on a store whose state holds the tracked branches
 * (`objects`, `grid`, `background`, `widgetValues`, `exploredEdits`). Adds `store.temporal`.
 * The cast is zustand's pattern for a middleware that adds a mutator: the implementation
 * is typed for any state, the export for the state of the store it is given.
 */
export const withHistory = historyMiddleware as unknown as WithHistory;
