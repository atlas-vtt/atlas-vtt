/** Maximum number of undo steps kept per map. */
export const HISTORY_LIMIT = 50;

/** The tracked state: `objects`, `grid`, `background`, `widgetValues`, `exploredEdits` (references). */
export type HistorySnapshot = {
  objects: unknown;
  grid: unknown;
  background: unknown;
  widgetValues: unknown;
  /** How many edits of the explored memory led to the state (`ViewAtlasState.exploredEdits`); stores without one leave it out. */
  exploredEdits?: unknown;
};

/**
 * One undo step: the tracked state before and after one GM write or one outermost transaction.
 * Once undone or redone, the step holds the state that undo or redo found and left.
 */
export interface HistoryStep {
  readonly before: HistorySnapshot;
  readonly after: HistorySnapshot;
}

export type TrackedBranch = keyof HistorySnapshot;

export const TRACKED_BRANCHES: readonly TrackedBranch[] = ['objects', 'grid', 'background', 'widgetValues', 'exploredEdits'];

/**
 * How deep undo looks into each branch for the entities a step changed: `objects` holds
 * collections of entities, `widgetValues` one value per widget, the rest are written whole.
 */
export const BRANCH_DEPTH: Readonly<Record<TrackedBranch, number>> = {
  objects: 2,
  grid: 0,
  background: 0,
  widgetValues: 1,
  exploredEdits: 0,
};

/** The tracked branches of a state, by reference. */
export function trackedSliceOf(state: HistorySnapshot): HistorySnapshot {
  return {
    objects: state.objects,
    grid: state.grid,
    background: state.background,
    widgetValues: state.widgetValues,
    exploredEdits: state.exploredEdits,
  };
}

/**
 * Whether two slices hold the same references on every branch. Immer keeps the objects of
 * unchanged branches, so this tells a write that changed tracked state from one that did not.
 */
export function sameTrackedSlice(a: HistorySnapshot, b: HistorySnapshot): boolean {
  return (
    a.objects === b.objects &&
    a.grid === b.grid &&
    a.background === b.background &&
    a.widgetValues === b.widgetValues &&
    a.exploredEdits === b.exploredEdits
  );
}
