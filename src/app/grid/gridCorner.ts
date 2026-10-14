import type { GridState } from '../types/gridTypes';
import type { Point } from '../types/visionTypes';
import { createHexLayout, hexVertices, isHexGridType, nearestHexCenter } from './hexGeometry';

/** The nearest grid intersection, or hex corner, while the scene's snapping is on. */
export function snapToGridCorner(point: Point, grid: GridState | null | undefined): Point {
  if (!grid || !(grid.snapToGrid ?? true) || !Number.isFinite(grid.size) || grid.size <= 0) return point;
  if (!isHexGridType(grid.type)) {
    return {
      x: grid.offsetX + Math.round((point.x - grid.offsetX) / grid.size) * grid.size,
      y: grid.offsetY + Math.round((point.y - grid.offsetY) / grid.size) * grid.size,
    };
  }
  const layout = createHexLayout(grid.type, grid.size, grid.offsetX, grid.offsetY);
  const corners = hexVertices(layout, nearestHexCenter(layout, point));
  return corners.reduce((nearest, corner) =>
    Math.hypot(point.x - corner.x, point.y - corner.y) < Math.hypot(point.x - nearest.x, point.y - nearest.y) ? corner : nearest);
}
