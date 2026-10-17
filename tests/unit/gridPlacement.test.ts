import { describe, it, expect } from 'vitest';
import { gridOffsetCenteredAt, normaliseGridOffset, resizedTokenCenter, snapTokenCenter } from '../../src/app/grid/gridPlacement';
import { axialToPixel, createHexLayout, hexCellExtent, hexCircumradius, nearestHexCenter } from '../../src/app/grid/hexGeometry';
import type { HexGridType } from '../../src/app/grid/hexGeometry';
import { freehandCellSize, FREEHAND_CELL_SCREEN_SIZE } from '../../src/app/pixi/FreehandGridPreview';

const HEX_TYPES: HexGridType[] = ['hex-vertical', 'hex-horizontal'];

describe('gridOffsetCenteredAt', () => {
  it('puts square grid lines half a cell around the point', () => {
    expect(gridOffsetCenteredAt('square', 80, { x: 500, y: 300 })).toEqual({ offsetX: 460, offsetY: 260 });
  });

  it.each(HEX_TYPES)('centres a %s hex on the point', (type) => {
    const point = { x: 431.5, y: 287.25 };
    const { offsetX, offsetY } = gridOffsetCenteredAt(type, 64, point);
    const center = nearestHexCenter(createHexLayout(type, 64, offsetX, offsetY), point);
    expect(center.x).toBeCloseTo(point.x, 9);
    expect(center.y).toBeCloseTo(point.y, 9);
  });
});

describe('normaliseGridOffset', () => {
  it('wraps square offsets into one cell', () => {
    const normalised = normaliseGridOffset('square', 80, 460, -30);
    expect(normalised.offsetX).toBeCloseTo(60, 9);
    expect(normalised.offsetY).toBeCloseTo(50, 9);
  });

  it.each(HEX_TYPES)('keeps every %s hex centre in place', (type) => {
    const size = 57;
    const point = { x: 812.3, y: 604.9 };
    const centred = gridOffsetCenteredAt(type, size, point);
    const { offsetX, offsetY } = normaliseGridOffset(type, size, centred.offsetX, centred.offsetY);
    const layout = createHexLayout(type, size, offsetX, offsetY);
    const extent = hexCellExtent(layout);

    const center = nearestHexCenter(layout, point);
    expect(center.x).toBeCloseTo(point.x, 9);
    expect(center.y).toBeCloseTo(point.y, 9);
    // Hex (0, 0) now contains the world origin.
    expect(Math.abs(offsetX + extent.width / 2)).toBeLessThanOrEqual(extent.width);
    expect(Math.abs(offsetY + extent.height / 2)).toBeLessThanOrEqual(extent.height);
  });
});

describe('freehandCellSize', () => {
  it('turns the fixed on-screen preview cell into world units at the current zoom', () => {
    expect(freehandCellSize(1)).toBe(FREEHAND_CELL_SCREEN_SIZE);
    expect(freehandCellSize(2)).toBe(FREEHAND_CELL_SCREEN_SIZE / 2);
    expect(freehandCellSize(0.5)).toBe(FREEHAND_CELL_SCREEN_SIZE * 2);
  });
});

describe('snapTokenCenter', () => {
  const CELL = 70;
  const toCell = (point: { x: number; y: number }): { x: number; y: number } => ({
    x: Math.floor((point.x - 5) / CELL) * CELL + 5 + CELL / 2,
    y: Math.floor((point.y - 5) / CELL) * CELL + 5 + CELL / 2,
  });

  it.each([1, 2, 3])('centres an odd footprint (size %s) on a cell centre', (size) => {
    expect(snapTokenCenter({ x: 150, y: 90 }, size, 'square', CELL, toCell)).toEqual({ x: 180, y: 110 });
  });

  it('keeps Small in the full cell', () => {
    expect(snapTokenCenter({ x: 150, y: 90 }, 0.875, 'square', CELL, toCell)).toEqual(toCell({ x: 150, y: 90 }));
  });

  it('lets Tiny snap to each quarter of an offset square cell', () => {
    for (const x of [22.5, 57.5]) {
      for (const y of [22.5, 57.5]) {
        expect(snapTokenCenter({ x: x + 2, y: y - 2 }, 0.75, 'square', CELL, toCell)).toEqual({ x, y });
      }
    }
  });

  it.each([1.5, 2.5])('centres an even footprint (size %s) on the nearest grid intersection', (size) => {
    expect(snapTokenCenter({ x: 150, y: 90 }, size, 'square', CELL, toCell)).toEqual({ x: 145, y: 75 });
    expect(snapTokenCenter({ x: 190, y: 130 }, size, 'square', CELL, toCell)).toEqual({ x: 215, y: 145 });
  });

  describe.each(HEX_TYPES)('on %s grids', (type) => {
    const layout = createHexLayout(type, 64, 7, 3);
    const toHex = (point: { x: number; y: number }): { x: number; y: number } => nearestHexCenter(layout, point);
    /** Hexes whose centre lies one circumradius from the point: three where the point is a vertex. */
    const hexesMeetingAt = (point: { x: number; y: number }): number => {
      const radius = hexCircumradius(64);
      let count = 0;
      for (let q = -10; q <= 20; q++) {
        for (let r = -10; r <= 20; r++) {
          const center = axialToPixel(layout, { q, r });
          if (Math.abs(Math.hypot(center.x - point.x, center.y - point.y) - radius) < 1e-6) count++;
        }
      }
      return count;
    };
    const points = [{ x: 200, y: 150 }, { x: 251, y: 177 }, { x: 330, y: 402 }];

    it.each([0.75, 0.875, 1, 2])('centres a sub-cell or odd footprint (size %s) on a hex', (size) => {
      for (const point of points) expect(snapTokenCenter(point, size, type, 64, toHex)).toEqual(toHex(point));
    });

    it.each([1.5, 2.5])('centres an even footprint (size %s) on a vertex where three hexes meet, near the point', (size) => {
      for (const point of points) {
        const snapped = snapTokenCenter(point, size, type, 64, toHex);
        expect(hexesMeetingAt(snapped)).toBe(3);
        expect(Math.hypot(snapped.x - point.x, snapped.y - point.y)).toBeLessThanOrEqual(64);
      }
    });

    it.skipIf(type !== 'hex-vertical')('covers the hexes of the usual hex size chart', () => {
      const radius = hexCircumradius(64);
      /** Hexes within `reach` circumradii of the token's snapped centre, counted per row from the top. */
      const rows = (size: number, reach: number): number[] => {
        const center = snapTokenCenter({ x: 400, y: 400 }, size, type, 64, toHex);
        const counts = new Map<number, number>();
        for (let q = -10; q <= 20; q++) {
          for (let r = -10; r <= 20; r++) {
            const hex = axialToPixel(layout, { q, r });
            if (Math.hypot(hex.x - center.x, hex.y - center.y) <= reach * radius + 1e-6) counts.set(r, (counts.get(r) ?? 0) + 1);
          }
        }
        return [...counts.entries()].sort(([a], [b]) => a - b).map(([, count]) => count);
      };
      expect(rows(1, 0)).toEqual([1]); // Medium
      expect(rows(1.5, 1)).toEqual([2, 1]); // Large: 3 hexes
      expect(rows(2, Math.sqrt(3))).toEqual([2, 3, 2]); // Huge: 7 hexes
      expect(rows(2.5, Math.sqrt(7))).toEqual([3, 4, 3, 2]); // Gargantuan: 12 hexes
      expect(rows(3, 2 * Math.sqrt(3))).toEqual([3, 4, 5, 4, 3]); // Colossal: 19 hexes
    });

    it('keeps the hex a resized token starts from, so it stays snapped', () => {
      const grid = { type, size: 64, snapToGrid: true };
      const hex = toHex({ x: 200, y: 150 });
      const large = resizedTokenCenter(hex, 1, 1.5, grid);
      expect(large).toEqual(snapTokenCenter(large, 1.5, type, 64, toHex));
      expect(hexesMeetingAt(large)).toBe(3);
      const huge = resizedTokenCenter(large, 1.5, 2, grid);
      expect(huge.x).toBeCloseTo(hex.x, 9);
      expect(huge.y).toBeCloseTo(hex.y, 9);
    });
  });
});

describe('resizedTokenCenter', () => {
  const grid = { type: 'square' as const, size: 70, snapToGrid: true };

  it.each(['square', ...HEX_TYPES] as const)('keeps Small in its cell and Tiny aligned when resizing on %s', (type) => {
    const center = { x: 35, y: 35 };
    const targetGrid = { ...grid, type };
    expect(resizedTokenCenter(center, 1, 0.875, targetGrid)).toEqual(center);
    const tiny = type === 'square' ? { x: 17.5, y: 17.5 } : center;
    expect(resizedTokenCenter(center, 0.875, 0.75, targetGrid)).toEqual(tiny);
    expect(resizedTokenCenter(tiny, 0.75, 1, targetGrid)).toEqual(center);
    const large = resizedTokenCenter(tiny, 0.75, 1.5, targetGrid);
    expect(large).toEqual(resizedTokenCenter(center, 1, 1.5, targetGrid));
    expect(resizedTokenCenter(large, 1.5, 0.875, targetGrid)).toEqual(center);
  });

  it('grows Tiny from any quarter into the containing cell, with offsets and negative coordinates', () => {
    const offsetGrid = { ...grid, offsetX: 5, offsetY: -80 };
    for (const x of [-47.5, -12.5]) {
      for (const y of [-62.5, -27.5]) {
        for (const size of [0.875, 1]) {
          expect(resizedTokenCenter({ x, y }, 0.75, size, offsetGrid)).toEqual({ x: -30, y: -45 });
        }
      }
    }
  });

  it('keeps the top-left corner, so a Medium token grown to Large moves onto the intersection', () => {
    expect(resizedTokenCenter({ x: 35, y: 35 }, 1, 1.5, grid)).toEqual({ x: 70, y: 70 });
    expect(resizedTokenCenter({ x: 70, y: 70 }, 1.5, 2.5, grid)).toEqual({ x: 140, y: 140 });
    expect(resizedTokenCenter({ x: 140, y: 140 }, 2.5, 1, grid)).toEqual({ x: 35, y: 35 });
  });

  it('keeps the centre without snapping', () => {
    expect(resizedTokenCenter({ x: 35, y: 35 }, 1, 1.5, { ...grid, snapToGrid: false })).toEqual({ x: 35, y: 35 });
    expect(resizedTokenCenter({ x: 35, y: 35 }, 1, 1.5, null)).toEqual({ x: 35, y: 35 });
  });
});
