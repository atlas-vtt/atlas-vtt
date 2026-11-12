/**
 * The tokens in an area. On a grid a token is in it when the area covers one of the cells the
 * token stands on (its footprint, as token placement reads it); without cells (no grid, Snap off,
 * an area too large to count them) when its centre lies in the area.
 */

import type { GridGeometry } from '../grid/gridDistance';
import { snapTokenCenter } from '../grid/gridPlacement';
import { tokenDiameterInCells } from '../pixi/token-renderer/tokenSizing';
import { footprintCells, type PlacementGrid } from '../pixi/tokenPlacement/placementLayout';
import type { TokenEntity } from '../types';
import type { Point } from '../types/visionTypes';
import type { AreaCell } from './measureCells';
import type { MeasureArea } from './measureGeometry';
import { cellCentreAt, cellKeyAt, cellOutline, hexLayoutOf } from './measureGrid';

/** What the rule reads of a token: where it stands, its size and whether it is hidden. */
export type AreaToken = Pick<TokenEntity, 'id' | 'x' | 'y' | 'size' | 'isHidden'>;

/** `grid` as token placement reads it, for a token's footprint. */
export function placementGridOf(grid: GridGeometry): PlacementGrid {
  const cellCentre = (point: Point): Point => cellCentreAt(grid, point);
  return {
    hex: hexLayoutOf(grid) !== null,
    cellSize: grid.size,
    cellCentre,
    snapToken: (point, size) => snapTokenCenter(point, size, grid.type, grid.size, cellCentre),
    cellOutline: (centre) => cellOutline(grid, centre),
  };
}

/**
 * The centres of the cells a token of `size` stands on at `centre`. A token placed freely where
 * cells meet stands wholly on none of them: it counts for the cell its centre is in.
 */
export function cellsStoodOn(centre: Point, size: number, placement: PlacementGrid): Point[] {
  const footprint = footprintCells(centre, size, placement);
  return footprint.length > 0 ? footprint : [placement.cellCentre(centre)];
}

/**
 * The ids of the tokens in `area`, in the order given. `cells` are the cells the area covers
 * (`cellsInArea`, which is null where cells are not counted: then, and without a `grid`, a token's
 * centre decides). `hidden` says whether hidden tokens count; a token at no place never does.
 */
export function tokensInArea(tokens: Iterable<AreaToken>, area: MeasureArea, grid: GridGeometry | null, cells: readonly AreaCell[] | null, hidden = true): string[] {
  const covered = grid && cells ? new Set(cells.map((cell) => cell.key)) : null;
  const placement = grid && covered ? placementGridOf(grid) : null;
  const { bounds } = area;
  const inArea: string[] = [];
  for (const token of tokens) {
    if ((token.isHidden && !hidden) || !Number.isFinite(token.x) || !Number.isFinite(token.y)) continue;
    const centre = { x: token.x, y: token.y };
    if (!grid || !covered || !placement) {
      if (area.contains(centre)) inArea.push(token.id);
      continue;
    }
    const size = token.size || 1;
    // A covered cell lies within a cell of the bounds, and a footprint within half its width of the token.
    const reach = (tokenDiameterInCells(size) / 2 + 2) * grid.size;
    if (centre.x < bounds.minX - reach || centre.x > bounds.maxX + reach || centre.y < bounds.minY - reach || centre.y > bounds.maxY + reach) continue;
    if (cellsStoodOn(centre, size, placement).some((cell) => covered.has(cellKeyAt(grid, cell)))) inArea.push(token.id);
  }
  return inArea;
}
