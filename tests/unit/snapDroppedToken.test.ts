import { describe, expect, it } from 'vitest';
import { snapDroppedToken } from '../../src/app/clipboard/mapObjectPlacement';
import { GridSystem, type GridOptions, type GridType } from '../../src/app/grid/GridSystem';
import { toGridOptions } from '../../src/app/grid/gridStateOptions';
import type { GridState } from '../../src/app/services/MapPersistence';

/**
 * A dropped token snaps as the GM's drag does (`GridSystem.snapTokenCenter`, #207), on a grid
 * the players see, one that is hidden or switched off, and none at all.
 */
const SIZE = 70;
const OFFSET = { x: 13, y: 29 };
const TYPES: readonly GridType[] = ['square', 'hex-vertical', 'hex-horizontal'];
const TOKEN_SIZES = [0.5, 1, 1.5, 2, 2.5, 3, 4] as const;
const POINTS = [{ x: 300, y: 150 }, { x: 517.3, y: 402.9 }, { x: -40, y: 12 }, { x: 999, y: 1001 }];

/** The GM's own drag: `GridSystem.snapTokenCenter` on a grid with these options, without a canvas. */
function gmSnap(options: GridOptions, point: { x: number; y: number }, tokenSize: number): { x: number; y: number } {
  const grid = Object.create(GridSystem.prototype) as GridSystem & { options: GridOptions };
  grid.options = options;
  return grid.snapTokenCenter(point.x, point.y, tokenSize);
}

function gridState(type: GridType): GridState {
  return { enabled: true, visible: true, type, size: SIZE, offsetX: OFFSET.x, offsetY: OFFSET.y, opacity: 1, snapToGrid: true };
}

describe('snapDroppedToken as the GM drag', () => {
  it.each(TYPES)('lands every token size on the GM drag point (%s)', (type) => {
    for (const tokenSize of TOKEN_SIZES) {
      for (const point of POINTS) {
        const gm = gmSnap(toGridOptions(gridState(type)), point, tokenSize);
        const dropped = snapDroppedToken(gridState(type), point, tokenSize);
        expect(dropped.x).toBeCloseTo(gm.x, 6);
        expect(dropped.y).toBeCloseTo(gm.y, 6);
      }
    }
  });

  it('puts a Large token on a square grid where four cells meet, a Medium or Huge one on a centre', () => {
    for (const point of POINTS) {
      const snapped = snapDroppedToken(gridState('square'), point, 1.5);
      expect((snapped.x - OFFSET.x) / SIZE).toBeCloseTo(Math.round((snapped.x - OFFSET.x) / SIZE), 6);
      expect((snapped.y - OFFSET.y) / SIZE).toBeCloseTo(Math.round((snapped.y - OFFSET.y) / SIZE), 6);
    }
    expect(snapDroppedToken(gridState('square'), { x: 300, y: 150 }, 1)).toEqual({ x: 328, y: 134 });
    expect(snapDroppedToken(gridState('square'), { x: 300, y: 150 }, 2)).toEqual({ x: 328, y: 134 });
  });

  it('does not snap with snap to grid off, or without grid state', () => {
    expect(snapDroppedToken({ ...gridState('square'), snapToGrid: false }, { x: 300.5, y: 150.25 }, 1.5)).toEqual({ x: 300.5, y: 150.25 });
    const point = { x: 301.5, y: 149.25 };
    expect(snapDroppedToken(null, point, 1.5)).toEqual(point);
  });

  const HIDDEN: ReadonlyArray<{ name: string; grid: GridState }> = [
    { name: 'a hidden square grid with an offset', grid: { enabled: true, visible: false, type: 'square', size: 70, offsetX: 23, offsetY: 41, opacity: 1 } },
    { name: 'a switched-off flat hex grid', grid: { enabled: false, type: 'hex-vertical', size: 64, offsetX: 10, offsetY: 7, opacity: 1 } },
    { name: 'a switched-off pointy hex grid', grid: { enabled: false, visible: false, type: 'hex-horizontal', size: 64, offsetX: -5, offsetY: 30, opacity: 1 } },
  ];

  it.each(HIDDEN)('snaps on a grid players do not see as the GM drag does: $name', ({ grid }) => {
    for (const size of [1, 1.5, 2.5]) {
      for (const point of POINTS) {
        const gm = gmSnap({ ...toGridOptions(grid), enabled: true }, point, size);
        const dropped = snapDroppedToken(grid, point, size);
        expect(dropped.x).toBeCloseTo(gm.x, 6);
        expect(dropped.y).toBeCloseTo(gm.y, 6);
      }
    }
  });
});
