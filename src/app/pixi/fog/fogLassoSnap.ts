import type { GridState } from '../../types/gridTypes';
import { createHexLayout, hexVertices, isHexGridType, nearestHexCenter, type Point } from '../../grid/hexGeometry';

/** Snap fog outlines to grid vertices, independently of token snapping. */
export function snapFogLassoPoint(point: Point, grid: GridState | null, enabled: boolean): Point {
  if (!enabled || !grid?.enabled || !Number.isFinite(grid.size) || grid.size <= 0) return { ...point };
  const { size, offsetX = 0, offsetY = 0 } = grid;
  if (isHexGridType(grid.type)) {
    const layout = createHexLayout(grid.type, size, offsetX, offsetY);
    const vertices = hexVertices(layout, nearestHexCenter(layout, point));
    return vertices.reduce((nearest, vertex) =>
      Math.hypot(vertex.x - point.x, vertex.y - point.y) < Math.hypot(nearest.x - point.x, nearest.y - point.y)
        ? vertex : nearest);
  }
  return {
    x: Math.round((point.x - offsetX) / size) * size + offsetX,
    y: Math.round((point.y - offsetY) / size) * size + offsetY,
  };
}
