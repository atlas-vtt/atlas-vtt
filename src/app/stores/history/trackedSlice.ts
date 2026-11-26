import { UNDO_DEPTHS, type UndoBranch } from '../stateBranches';

/** Maximum number of undo steps kept per map. */
export const HISTORY_LIMIT = 50;

/** The tracked state: the branches the store declares undoable (`stateBranches.ts`), by reference; a store without one leaves it out. */
export type HistorySnapshot = { readonly [K in UndoBranch]?: unknown };

/**
 * One undo step: the tracked state before and after one GM write or one outermost transaction.
 * Once undone or redone, the step holds the state that undo or redo found and left.
 */
export interface HistoryStep {
  readonly before: HistorySnapshot;
  readonly after: HistorySnapshot;
}

export const TRACKED_BRANCHES = Object.keys(UNDO_DEPTHS) as readonly UndoBranch[];

/** The tracked branches of a state, by reference. */
export function trackedSliceOf(state: HistorySnapshot): HistorySnapshot {
  const slice: Partial<Record<UndoBranch, unknown>> = {};
  for (const branch of TRACKED_BRANCHES) slice[branch] = state[branch];
  return slice;
}

/**
 * Whether two slices hold the same references on every branch. Immer keeps the objects of
 * unchanged branches, so this tells a write that changed tracked state from one that did not.
 */
export function sameTrackedSlice(a: HistorySnapshot, b: HistorySnapshot): boolean {
  for (const branch of TRACKED_BRANCHES) if (a[branch] !== b[branch]) return false;
  return true;
}
