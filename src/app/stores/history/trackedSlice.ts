/** Maximum number of undo steps kept per map. */
export const HISTORY_LIMIT = 50;

/**
 * The branches undo tracks, by name, and how deep it looks into each for the entities a step
 * changed (`towards`): 0 puts the branch back whole, 1 entry by entry, 2 collection by collection
 * and entity by entity. The store declares them (`stores/stateBranches.ts`).
 */
export type UndoDepths = Readonly<Record<string, 0 | 1 | 2>>;

/** The tracked state: the branches of the store's `UndoDepths`, by reference; a store without one leaves it out. */
export type HistorySnapshot = Readonly<Record<string, unknown>>;

/**
 * One undo step: the tracked state before and after one GM write or one outermost transaction.
 * Once undone or redone, the step holds the state that undo or redo found and left.
 */
export interface HistoryStep {
  readonly before: HistorySnapshot;
  readonly after: HistorySnapshot;
}

/** The tracked branches of a state, by reference. */
export function trackedSliceOf(state: HistorySnapshot, depths: UndoDepths): HistorySnapshot {
  const slice: Record<string, unknown> = {};
  for (const branch of Object.keys(depths)) slice[branch] = state[branch];
  return slice;
}

/**
 * Whether two slices hold the same references on every branch. Immer keeps the objects of
 * unchanged branches, so this tells a write that changed tracked state from one that did not.
 */
export function sameTrackedSlice(a: HistorySnapshot, b: HistorySnapshot): boolean {
  const branches = Object.keys(a);
  return branches.length === Object.keys(b).length && branches.every((branch) => a[branch] === b[branch]);
}
