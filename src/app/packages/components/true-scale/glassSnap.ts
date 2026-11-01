import { isHexGridType } from '../../../grid/hexGeometry';
import type { GridState } from '../../../types/gridTypes';
import type { Size } from '../../../types/playerFrame';

interface Point {
  x: number;
  y: number;
}

/**
 * Where the glass of `size` dragged to `centre` lands: on a square grid its top-left corner on the
 * nearest grid intersection, so the TV shows whole cells from its edge; `free` (Alt held), a hex
 * grid, whose cells meet in no straight edge, or no grid at all leaves it where it was dragged.
 */
export function snapGlassCentre(centre: Point, size: Size, grid: GridState | null | undefined, free: boolean): Point {
  if (free || !grid?.enabled || isHexGridType(grid.type) || !(grid.size > 0)) return centre;
  const cell = grid.size;
  const snap = (corner: number, offset: number): number => offset + Math.round((corner - offset) / cell) * cell;
  return {
    x: snap(centre.x - size.width / 2, grid.offsetX || 0) + size.width / 2,
    y: snap(centre.y - size.height / 2, grid.offsetY || 0) + size.height / 2,
  };
}
