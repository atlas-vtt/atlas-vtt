import { createStore, type StoreApi } from 'zustand';
import { createAttribution } from './historyActor';
import { restore } from './towards';
import { HISTORY_LIMIT, sameTrackedSlice, type HistorySnapshot, type HistoryStep } from './trackedSlice';

/**
 * Undo/redo API exposed on `store.temporal`.
 *
 * Besides `undo`/`redo`/`pause`/`resume`, it has explicit transactions so a continuous
 * interaction (dragging a token, sliding a vertex, sweeping the eraser) is recorded as
 * exactly one undo step even though the store is written many times while it happens.
 */
export interface HistoryState {
  /** The steps undo takes back, the next one last. */
  pastStates: readonly HistoryStep[];
  /** The steps redo makes again, the next one last. */
  futureStates: readonly HistoryStep[];
  isTracking: boolean;
  undo: () => void;
  redo: () => void;
  clear: () => void;
  pause: () => void;
  resume: () => void;
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
  /** Run `fn` as Atlas itself: nothing it writes becomes an undo step. */
  untracked: <T>(fn: () => T) => T;
}

/** The store a history belongs to, as the history sees it. */
export interface TrackedStore {
  read: () => HistorySnapshot;
  /** Writes below every other middleware: never recorded, never saved by itself. */
  write: (slice: HistorySnapshot) => void;
}

export interface History {
  store: StoreApi<HistoryState>;
  /** Runs one write to the store and records it as a step when it is one. */
  record: (write: () => void) => void;
}

type Stacks = Pick<HistoryState, 'pastStates' | 'futureStates'>;

/**
 * One store's undo history. A step is the tracked state before and after a write of the GM
 * (or an outermost transaction); undo and redo move the store towards a step's other side,
 * so what others wrote since stays.
 *
 * While the GM's work is under way (an open transaction, or a write whose listeners are still
 * running), what it writes belongs to the steps next to the present. `mark` is where those
 * steps last agreed with the store; before the stacks change, what was written since the mark
 * is folded into them, so that undo and redo there take back and bring back exactly the
 * whole state the steps stand for.
 */
export function createHistory(tracked: TrackedStore): History {
  const attribution = createAttribution();
  let depth = 0;
  let start: HistorySnapshot | null = null;
  let mark: HistorySnapshot | null = null;
  let openWrites = 0;
  const store = createStore<HistoryState>()(() => ({
    pastStates: [],
    futureStates: [],
    isTracking: true,
    undo: () => travel('undo'),
    redo: () => travel('redo'),
    clear,
    pause: () => store.setState({ isTracking: false }),
    resume: () => store.setState({ isTracking: true }),
    beginTransaction,
    endTransaction,
    discardTransaction,
    abandonTransaction,
    transaction: (fn) => {
      beginTransaction();
      try {
        return fn();
      } finally {
        endTransaction();
      }
    },
    untracked: (fn) => attribution.asSystem(fn),
  }));
  const get = (): HistoryState => store.getState();
  const setStacks = (stacks: Partial<Stacks>): void => store.setState(stacks);

  /** The stacks with what was written since the mark folded into the steps next to the present. */
  function folded(target: HistorySnapshot): Stacks {
    const { pastStates, futureStates } = get();
    if (!mark || sameTrackedSlice(mark, target)) return { pastStates, futureStates };
    const from = mark;
    mark = target;
    const last = pastStates[pastStates.length - 1];
    const next = futureStates[futureStates.length - 1];
    return {
      pastStates: last ? [...pastStates.slice(0, -1), { before: last.before, after: restore(last.after, from, target) }] : pastStates,
      futureStates: next ? [...futureStates.slice(0, -1), { before: restore(next.before, from, target), after: next.after }] : futureStates,
    };
  }

  /** The GM's work under way is over: what it left in the store belongs to the steps next to the present. */
  function settle(): void {
    if (openWrites > 0 || depth > 0 || !mark) return;
    const stacks = folded(tracked.read());
    if (stacks.pastStates !== get().pastStates || stacks.futureStates !== get().futureStates) setStacks(stacks);
    mark = null;
  }

  function push(step: HistoryStep): void {
    const { pastStates } = folded(step.before);
    setStacks({ pastStates: [...pastStates, step].slice(-HISTORY_LIMIT), futureStates: [] });
    if (mark) mark = step.after;
  }

  function record(write: () => void): void {
    const before = tracked.read();
    const ownWork = attribution.current().kind === 'gm' && get().isTracking;
    if (ownWork) {
      mark ??= before;
      openWrites += 1;
    }
    let written = false;
    try {
      write();
      written = true;
    } finally {
      if (written) decide(before);
      if (ownWork) {
        openWrites -= 1;
        settle();
      }
    }
  }

  /** Runs once the write and its listeners are done: a GM write outside transactions is a step when it changed tracked state. */
  function decide(before: HistorySnapshot): void {
    if (!get().isTracking) return;
    const after = tracked.read();
    if (sameTrackedSlice(before, after) || depth > 0 || attribution.current().kind === 'system') return;
    push({ before, after });
  }

  function travel(direction: 'undo' | 'redo'): void {
    const source = direction === 'undo' ? 'pastStates' : 'futureStates';
    const target = direction === 'undo' ? 'futureStates' : 'pastStates';
    if (get()[source].length === 0) return;
    const current = tracked.read();
    const stacks = folded(current);
    const step = stacks[source][stacks[source].length - 1]!;
    setStacks({ ...stacks, [source]: stacks[source].slice(0, -1) });
    const slice = direction === 'undo' ? restore(current, step.after, step.before) : restore(current, step.before, step.after);
    tracked.write(slice);
    setStacks({ [target]: [...get()[target], step] });
    if (mark) mark = slice;
  }

  function beginTransaction(): void {
    if (depth === 0) {
      start = tracked.read();
      mark ??= start;
    }
    depth += 1;
  }

  function endTransaction(): void {
    if (depth === 0) return;
    depth -= 1;
    if (depth > 0) return;
    const begun = start;
    start = null;
    const end = tracked.read();
    if (begun && attribution.current().kind === 'gm' && get().isTracking && !sameTrackedSlice(begun, end)) push({ before: begun, after: end });
    closeTransaction();
  }

  /** Folds what an outermost transaction left in the store into the steps next to the present. */
  function closeTransaction(): void {
    const stacks = folded(tracked.read());
    if (stacks.pastStates !== get().pastStates || stacks.futureStates !== get().futureStates) setStacks(stacks);
    settle();
  }

  function discardTransaction(): void {
    const open = depth > 0;
    depth = 0;
    start = null;
    if (open) closeTransaction();
  }

  function abandonTransaction(): void {
    if (depth === 0) return;
    depth -= 1;
    if (depth > 0) return;
    start = null;
    closeTransaction();
  }

  // A transaction left open when the history is cleared (a map switch) must not
  // swallow the next scene's edits or later record the previous scene as a step.
  function clear(): void {
    depth = 0;
    start = null;
    mark = openWrites > 0 ? tracked.read() : null;
    setStacks({ pastStates: [], futureStates: [] });
  }

  return { store, record };
}
