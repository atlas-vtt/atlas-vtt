import type { GridState } from '../types/gridTypes';
import type { GridOptions } from './gridTypes';
import { parseGridColor } from './gridContrastColor';
import { cellNumberStyleOfGrid } from './cellNumbering';

/** The store keeps the grid colour as a CSS hex string and its alpha as `opacity`; the GridSystem wants a number and `alpha`. */
export function toGridOptions(grid: GridState): GridOptions {
  return {
    size: grid.size,
    offsetX: grid.offsetX,
    offsetY: grid.offsetY,
    color: parseGridColor(grid.color),
    alpha: grid.opacity,
    enabled: grid.enabled,
    ...(grid.type !== undefined ? { type: grid.type } : {}),
    ...(grid.lineType !== undefined ? { lineType: grid.lineType } : {}),
    ...(grid.lineWidth !== undefined ? { lineWidth: grid.lineWidth } : {}),
    ...(grid.scale !== undefined ? { scale: grid.scale } : {}),
    ...(grid.mapScale !== undefined ? { mapScale: grid.mapScale } : {}),
    cellNumbers: cellNumberStyleOfGrid(grid),
  };
}
