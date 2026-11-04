// Frozen from e8b9b280c326ef15d62b4b55651727ac56a449ad src/app/stores/history.ts. Only import paths and two comments are adapted.
import type { StoreApi } from 'zustand';
import type { TemporalState, ZundoOptions } from './zundo/types';
import { areTemporalSnapshotsEqual, type TemporalSnapshotLike } from './temporalEquality';

/** Maximum number of undo steps kept per map. */
export const HISTORY_LIMIT = 50;

/** The slice of store state that undo/redo tracks. */
export type HistorySnapshot = TemporalSnapshotLike;

type TrackedSlice<S extends HistorySnapshot> = Pick<S, keyof HistorySnapshot>;

/**
 * Undo/redo API exposed on `store.temporal`.
 *
 * On top of zundo's `undo`/`redo`/`pause`/`resume`, it adds explicit
 * transactions so a continuous interaction (dragging a token, sliding a
 * vertex, sweeping the eraser) is recorded as exactly one undo step even
 * though the store is written many times while it happens.
 */
export interface HistoryState extends TemporalState<HistorySnapshot> {
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
  transaction: <T>(fn: () => T) => T;
  /** Run `fn` without recording anything (hydration, derived state). */
  untracked: <T>(fn: () => T) => T;
}

/** Anything store-shaped; the bound zustand store and plain `StoreApi` both qualify. */
export type HistoryHost = Pick<StoreApi<unknown>, 'getState'>;

type HistoryCapableStore = HistoryHost & { temporal?: StoreApi<HistoryState> };

function partializeHistory<S extends HistorySnapshot>(state: S): TrackedSlice<S> {
  return {
    objects: state.objects,
    grid: state.grid,
    background: state.background,
    widgetValues: state.widgetValues,
    exploredEdits: state.exploredEdits,
  };
}

/**
 * Builds the zundo options for a view store. `getState` must return the
 * live state of the store the options are attached to.
 */
export function createHistoryOptions<S extends HistorySnapshot>(
  getState: () => S,
): ZundoOptions<S, TrackedSlice<S>> {
  let transactionDepth = 0;
  let untrackedDepth = 0;
  let transactionStart: TrackedSlice<S> | null = null;

  const isSuppressed = (): boolean => transactionDepth > 0 || untrackedDepth > 0;

  return {
    limit: HISTORY_LIMIT,
    partialize: partializeHistory,
    equality: areTemporalSnapshotsEqual,
    handleSet: (recordStep) => (pastState) => {
      if (isSuppressed()) return;
      recordStep(pastState);
    },
    wrapTemporal: (createTemporal) => (set, get, api) => {
      const base = createTemporal(set, get, api);

      const beginTransaction = (): void => {
        if (transactionDepth === 0) {
          transactionStart = partializeHistory(getState());
        }
        transactionDepth += 1;
      };

      const endTransaction = (): void => {
        if (transactionDepth === 0) return;
        transactionDepth -= 1;
        if (transactionDepth > 0) return;

        const start = transactionStart;
        transactionStart = null;
        if (!start || untrackedDepth > 0 || !get().isTracking) return;
        if (areTemporalSnapshotsEqual(start, partializeHistory(getState()))) return;

        // A Pick of S is a valid Partial<S>; TS cannot prove it for a generic S.
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

      // A transaction left open when the history is cleared (a map switch) must neither
      // swallow the next scene's edits nor record the previous scene as a step when it ends.
      const clear = (): void => {
        discardTransaction();
        base.clear();
      };

      const transaction = <T>(fn: () => T): T => {
        beginTransaction();
        try {
          return fn();
        } finally {
          endTransaction();
        }
      };

      const untracked = <T>(fn: () => T): T => {
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
