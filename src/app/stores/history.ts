import type { StoreApi } from 'zustand';
import type { HistoryState } from './history/historyStore';

export { HISTORY_LIMIT, type HistorySnapshot, type HistoryStep } from './history/trackedSlice';
export type { HistoryState } from './history/historyStore';
export { withHistory } from './history/historyMiddleware';

/** Anything store-shaped; the bound zustand store and plain `StoreApi` both qualify. */
export type HistoryHost = Pick<StoreApi<unknown>, 'getState'>;

type HistoryCapableStore = HistoryHost & { temporal?: StoreApi<HistoryState> };

/** Returns the history store attached to a view store, or null for stores without one. */
export function getHistoryStore(store: HistoryHost): StoreApi<HistoryState> | null {
  return (store as HistoryCapableStore).temporal ?? null;
}

export function beginHistoryTransaction(store: HistoryHost): void {
  getHistoryStore(store)?.getState().beginTransaction();
}

export function endHistoryTransaction(store: HistoryHost): void {
  getHistoryStore(store)?.getState().endTransaction();
}

export function discardHistoryTransaction(store: HistoryHost): void {
  getHistoryStore(store)?.getState().discardTransaction();
}

export function abandonHistoryTransaction(store: HistoryHost): void {
  getHistoryStore(store)?.getState().abandonTransaction();
}

export function runHistoryTransaction<T>(store: HistoryHost, fn: () => T): T {
  const history = getHistoryStore(store);
  return history ? history.getState().transaction(fn) : fn();
}

export function runUntracked<T>(store: HistoryHost, fn: () => T): T {
  const history = getHistoryStore(store);
  return history ? history.getState().untracked(fn) : fn();
}
