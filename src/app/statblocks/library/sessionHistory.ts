/**
 * The history of a template session's draft (§7.8): zundo with the explicit
 * transactions a continuous edit needs. A map's history is its own
 * (`stores/history.ts`), which undoes entity by entity and knows only maps.
 */

import type { StoreApi } from 'zustand';
import type { TemporalState, ZundoOptions } from 'zundo';
import { HISTORY_LIMIT } from '../../stores/history';

/**
 * What a store's history tracks: the part of its state a step holds, and when
 * two such parts count as the same (no step). Equality must be cheap; compare
 * the references Immer keeps for unchanged branches.
 */
export interface HistorySlice<S, T> {
  partialize: (state: S) => T;
  equality: (past: T, current: T) => boolean;
}

/**
 * Undo/redo API exposed on `store.temporal`.
 *
 * On top of zundo's `undo`/`redo`/`pause`/`resume`, it adds explicit
 * transactions so a continuous interaction (dragging a token, sliding a
 * vertex, sweeping the eraser) is recorded as exactly one undo step even
 * though the store is written many times while it happens.
 */
export interface HistoryState<T> extends TemporalState<T> {
  /**
   * Start grouping writes into a single undo step. Nestable: only the
   * outermost `endTransaction` records the step.
   */
  beginTransaction: () => void;
  /** Close the current transaction, recording one step if anything changed. */
  endTransaction: () => void;
  /** Close the current transaction (all levels) without recording a step. */
  discardTransaction: () => void;
  /**
   * Close the innermost transaction without a step of its own: its gesture was cancelled and
   * has put back what it changed. A transaction around it goes on.
   */
  abandonTransaction: () => void;
  /** Run `fn` inside a transaction. */
  transaction: <R>(fn: () => R) => R;
  /** Run `fn` without recording anything (hydration, remote sync, derived state). */
  untracked: <R>(fn: () => R) => R;
}

/** Anything store-shaped; the bound zustand store and plain `StoreApi` both qualify. */
export type HistoryHost = Pick<StoreApi<unknown>, 'getState'>;

type HistoryCapableStore = HistoryHost & { temporal?: StoreApi<HistoryState<unknown>> };

/** Builds the zundo options for a store. `getState` must return the live state of the store the options are attached to. */
export function createHistoryOptions<S, T>(getState: () => S, { partialize, equality }: HistorySlice<S, T>): ZundoOptions<S, T> {
  let transactionDepth = 0;
  let untrackedDepth = 0;
  let transactionStart: T | null = null;

  const isSuppressed = (): boolean => transactionDepth > 0 || untrackedDepth > 0;

  return {
    limit: HISTORY_LIMIT,
    partialize,
    equality,
    handleSet: (recordStep) => (pastState) => {
      if (isSuppressed()) return;
      recordStep(pastState);
    },
    wrapTemporal: (createTemporal) => (set, get, api) => {
      const base = createTemporal(set, get, api);

      const beginTransaction = (): void => {
        if (transactionDepth === 0) {
          transactionStart = partialize(getState());
        }
        transactionDepth += 1;
      };

      const endTransaction = (): void => {
        if (transactionDepth === 0) return;
        transactionDepth -= 1;
        if (transactionDepth > 0) return;

        const start = transactionStart;
        transactionStart = null;
        if (start === null || untrackedDepth > 0 || !get().isTracking) return;
        if (equality(start, partialize(getState()))) return;

        // The tracked slice is a valid Partial<S>; TS cannot prove it for a generic S.
        const step = start as Partial<S>;
        set({
          pastStates: [...get().pastStates, step].slice(-HISTORY_LIMIT),
          futureStates: [],
        });
      };

      const discardTransaction = (): void => {
        transactionDepth = 0;
        transactionStart = null;
      };

      const abandonTransaction = (): void => {
        if (transactionDepth === 0) return;
        transactionDepth -= 1;
        if (transactionDepth === 0) transactionStart = null;
      };

      // A transaction left open when the history is cleared (a map switch) must not
      // swallow the next scene's edits or later record the previous scene as a step.
      const clear = (): void => {
        discardTransaction();
        base.clear();
      };

      const transaction = <R>(fn: () => R): R => {
        beginTransaction();
        try {
          return fn();
        } finally {
          endTransaction();
        }
      };

      const untracked = <R>(fn: () => R): R => {
        untrackedDepth += 1;
        try {
          return fn();
        } finally {
          untrackedDepth -= 1;
        }
      };

      const history = { ...base, clear, beginTransaction, endTransaction, discardTransaction, abandonTransaction, transaction, untracked };
      return history;
    },
  };
}

/** Returns the history store attached to a draft store, or null for stores without one. */
export function getHistoryStore(store: HistoryHost): StoreApi<HistoryState<unknown>> | null {
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
