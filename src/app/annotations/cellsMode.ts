/** When the Draw tool's Cells mode can work: it fills the cells of the map's grid, shown or hidden. */

/** What of a scene's grid says so. */
export interface CellsGridState {
  readonly enabled: boolean;
  /** The grid is shown; only `false` hides it. */
  readonly visible?: boolean | undefined;
  /** Tokens and drawings snap to it; only `false` switches that off. */
  readonly snapToGrid?: boolean | undefined;
  readonly size: number;
}

/**
 * Whether cells can be filled on a map with this grid: it has one, with a cell size, that is shown
 * or that things snap to. Many GMs hide the grid of a map whose image draws its own lines and keep
 * snapping to it: it is still there, and its cells can be coloured.
 */
export function fillsCells(grid: CellsGridState | null | undefined): boolean {
  return !!grid && grid.enabled && (grid.visible !== false || grid.snapToGrid !== false) && Number.isFinite(grid.size) && grid.size > 0;
}
