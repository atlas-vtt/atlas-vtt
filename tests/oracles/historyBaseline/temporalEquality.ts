// Frozen from e8b9b280c326ef15d62b4b55651727ac56a449ad src/app/stores/temporalEquality.ts.
export interface TemporalSnapshotLike {
  objects: unknown;
  grid: unknown;
  background: unknown;
  widgetValues: unknown;
  /** How many edits of the explored memory led to the state (`ViewAtlasState.exploredEdits`); stores without one leave it out. */
  exploredEdits?: unknown;
}

/**
 * Hot-path equality for zundo tracked state.
 *
 * We intentionally use reference checks for tracked branches because Immer
 * preserves object identity when fields are unchanged.
 */
export function areTemporalSnapshotsEqual(
  past: TemporalSnapshotLike,
  current: TemporalSnapshotLike,
): boolean {
  return (
    past.objects === current.objects &&
    past.grid === current.grid &&
    past.background === current.background &&
    past.widgetValues === current.widgetValues &&
    past.exploredEdits === current.exploredEdits
  );
}
