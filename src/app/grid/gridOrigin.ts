/**
 * A grid repeats itself, so its origin can be moved by whole repeats without changing a single line. The drawers and
 * lattices step from the origin one cell at a time; with an origin far from the map (1e40 and up) a step no longer
 * changes the float, and the loop never ends. Moving the origin next to zero first keeps every step exact.
 */
import { createHexLayout, type HexLayout } from './hexGeometry';

const SQRT3 = Math.sqrt(3);

/** `value` moved by whole `period`s into [0, period); `%` on floats is exact, whatever their size. */
export function withinPeriod(value: number, period: number): number {
  if (!(period > 0) || !Number.isFinite(value)) return value;
  const rest = value % period;
  return rest < 0 ? rest + period : rest;
}

/** A square grid's offset, moved next to zero. */
export function squareOffset(offset: number, size: number): number {
  return withinPeriod(offset, size);
}

/**
 * `layout` with its origin moved next to zero by whole repeats of the hex lattice: one cell along its lines, and two
 * lines (whose half-cell stagger then lines up again) across them.
 */
export function hexLayoutNearZero(layout: HexLayout): HexLayout {
  const along = layout.size;
  const across = SQRT3 * layout.size;
  const [periodX, periodY] = layout.orientation === 'pointy' ? [along, across] : [across, along];
  return { ...layout, originX: withinPeriod(layout.originX, periodX), originY: withinPeriod(layout.originY, periodY) };
}

/**
 * A saved grid's offsets with any that lie farther than `limit` from zero moved next to it, by whole repeats of its
 * lattice, so the grid draws the same; a grid without a usable size gets 0, since it draws nothing anyway.
 */
export function offsetsWithin(grid: { type?: string; size: number; offsetX: number; offsetY: number }, limit: number): { offsetX: number; offsetY: number } {
  const { offsetX, offsetY } = grid;
  if (Math.abs(offsetX) <= limit && Math.abs(offsetY) <= limit) return { offsetX, offsetY };
  if (!Number.isFinite(grid.size) || grid.size <= 0) return { offsetX: 0, offsetY: 0 };
  if (grid.type === 'hex-horizontal' || grid.type === 'hex-vertical') {
    const near = hexLayoutNearZero(createHexLayout(grid.type, grid.size, offsetX, offsetY));
    return { offsetX: near.originX, offsetY: near.originY };
  }
  return { offsetX: squareOffset(offsetX, grid.size), offsetY: squareOffset(offsetY, grid.size) };
}
