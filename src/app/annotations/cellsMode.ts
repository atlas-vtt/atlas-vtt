/** When the Draw tool's Cells mode can work: it fills the cells of the map's grid. */

/** What of a scene's grid says so. */
export interface CellsGridState {
  readonly enabled: boolean;
  /** The grid is shown; only `false` switches it off. */
  readonly visible?: boolean | undefined;
  readonly size: number;
}

/** Whether cells can be filled on a map with this grid: it has one, with a cell size, and the grid is not switched off. */
export function fillsCells(grid: CellsGridState | null | undefined): boolean {
  return !!grid && grid.enabled && grid.visible !== false && Number.isFinite(grid.size) && grid.size > 0;
}
