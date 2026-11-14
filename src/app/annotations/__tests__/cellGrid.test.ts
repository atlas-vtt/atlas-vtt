import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../grid/gridDistance';
import { axialToPixel, createHexLayout, hexVertices, pixelToAxial, type HexGridType } from '../../grid/hexGeometry';
import { axialKey } from '../../grid/hexLattice';
import type { Point } from '../../types/visionTypes';
import { cellGrid, cellsCrossed, type CellGrid } from '../cellGrid';
import { sampled, seeded } from './annotationKit';

const GRIDS: readonly GridGeometry[] = [
  { type: 'square', size: 70, offsetX: 0, offsetY: 0 },
  { type: 'square', size: 33.5, offsetX: 12.25, offsetY: -7.75 },
  { type: 'hex-vertical', size: 70, offsetX: 0, offsetY: 0 },
  { type: 'hex-vertical', size: 51.3, offsetX: -20.4, offsetY: 9.1 },
  { type: 'hex-horizontal', size: 70, offsetX: 0, offsetY: 0 },
  { type: 'hex-horizontal', size: 46.7, offsetX: 17.9, offsetY: -31.2 },
];
const nameOf = (grid: GridGeometry): string => `${grid.type} ${grid.size} px at (${grid.offsetX}, ${grid.offsetY})`;
const isHex = (grid: GridGeometry): grid is GridGeometry & { type: HexGridType } => grid.type !== 'square';

/** The key of the cell `point` lies in, by the grid's own rule for a point, without the lattice. */
function keyAt(grid: GridGeometry, point: Point): string {
  if (isHex(grid)) return axialKey(pixelToAxial(createHexLayout(grid.type, grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0), point));
  return `${Math.floor((point.x - (grid.offsetX ?? 0)) / grid.size)},${Math.floor((point.y - (grid.offsetY ?? 0)) / grid.size)}`;
}

/** How far inside the convex `outline` a point lies: negative outside it. */
function depthIn(outline: readonly Point[], point: Point): number {
  let turn = 0;
  for (let i = 0; i < outline.length; i++) turn += outline[i]!.x * outline[(i + 1) % outline.length]!.y - outline[(i + 1) % outline.length]!.x * outline[i]!.y;
  let depth = Infinity;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const side = Math.sign(turn) * ((b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)) / Math.hypot(b.x - a.x, b.y - a.y);
    depth = Math.min(depth, side);
  }
  return depth;
}

const cells = (grid: GridGeometry): CellGrid => cellGrid(grid)!;

describe('the cells of a grid', () => {
  it('has none for a grid without a cell size', () => {
    expect(cellGrid({ type: 'square', size: 0, offsetX: 0, offsetY: 0 })).toBeNull();
    expect(cellGrid({ type: 'hex-vertical', size: Number.NaN, offsetX: 0, offsetY: 0 })).toBeNull();
  });

  it.each(GRIDS.map((grid) => [nameOf(grid), grid] as const))('finds the cell a point lies in as the grid itself does: %s', (_name, grid) => {
    const random = seeded(7);
    const grid$ = cells(grid);
    for (let i = 0; i < 400; i++) {
      const point = { x: (random() - 0.5) * 3000, y: (random() - 0.5) * 3000 };
      const cell = grid$.cellAt(point)!;
      expect(cell.key).toBe(keyAt(grid, point));
      // The point lies in the outline it was given (on its edge at worst).
      expect(depthIn(cell.outline, point)).toBeGreaterThan(-1e-6);
      // The same cell is the same object, whoever asks.
      expect(grid$.cellAt({ x: point.x, y: point.y })).toBe(cell);
    }
    expect(grid$.cellAt({ x: Number.NaN, y: 0 })).toBeNull();
    expect(grid$.cellAt({ x: 1e9, y: 0 })).toBeNull();
  });

  it.each(GRIDS.filter(isHex).map((grid) => [nameOf(grid), grid] as const))('gives a hex the corners the grid draws it with: %s', (_name, grid) => {
    const layout = createHexLayout(grid.type, grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0);
    const grid$ = cells(grid);
    for (const [q, r] of [[0, 0], [3, -2], [-5, 4], [11, 7], [-8, -9]] as const) {
      const centre = axialToPixel(layout, { q, r });
      const drawn = hexVertices(layout, centre);
      const { outline } = grid$.cellAt(centre)!;
      expect(outline).toHaveLength(6);
      outline.forEach((corner, index) => {
        expect(corner.x).toBeCloseTo(drawn[index]!.x, 8);
        expect(corner.y).toBeCloseTo(drawn[index]!.y, 8);
      });
    }
  });

  it('gives a square its four corners on the grid\'s lines', () => {
    const { outline } = cells(GRIDS[1]!).cellAt({ x: 12.25 + 33.5 * 2.5, y: -7.75 - 33.5 * 0.5 })!;
    expect(outline).toEqual([{ x: 79.25, y: -41.25 }, { x: 112.75, y: -41.25 }, { x: 112.75, y: -7.75 }, { x: 79.25, y: -7.75 }]);
  });

  it.each(GRIDS.map((grid) => [nameOf(grid), grid] as const))('gives cells that share a corner the very same numbers for it: %s', (_name, grid) => {
    const grid$ = cells(grid);
    const corners = new Map<string, number>();
    const block = grid$.cellsIn(-400, -400, 400, 400);
    expect(block.length).toBeGreaterThan(50);
    for (const { outline } of block) {
      for (const { x, y } of outline) corners.set(`${x},${y}`, (corners.get(`${x},${y}`) ?? 0) + 1);
    }
    // Counted by their exact numbers, a corner is shared by as many cells as meet there (inside the block, away from its rim).
    const meeting = isHex(grid) ? 3 : 4;
    const counts = [...corners.values()];
    expect(Math.max(...counts)).toBe(meeting);
    // Were shared corners worked out apart, corners a rounding error from each other would be counted once each: far more corners than there are.
    const cornersPerCell = isHex(grid) ? 2 : 1;
    expect(corners.size).toBeLessThan(block.length * cornersPerCell * 1.5);
  });

  it.each(GRIDS.map((grid) => [nameOf(grid), grid] as const))('finds every cell a stretch of the pointer\'s way passes through: %s', (_name, grid) => {
    const random = seeded(11);
    const grid$ = cells(grid);
    const step = grid.size / 400;
    for (let i = 0; i < 120; i++) {
      const from = { x: (random() - 0.5) * 1200, y: (random() - 0.5) * 1200 };
      // Short hops as a pointer makes them, and now and then a long one.
      const reach = grid.size * (i % 10 === 0 ? 12 : 2.5);
      const to = { x: from.x + (random() - 0.5) * 2 * reach, y: from.y + (random() - 0.5) * 2 * reach };
      const crossed = cellsCrossed(grid$, from, to);
      const keys = new Set(crossed.map(({ key }) => key));
      expect(keys.size).toBe(crossed.length);
      // The oracle: the cell of every point along the way, by the grid's own rule for a point.
      const walked = new Set(sampled([from, to], step).map((point) => keyAt(grid, point)));
      for (const key of walked) expect(keys.has(key), `${key} walked from (${from.x}, ${from.y}) to (${to.x}, ${to.y})`).toBe(true);
      // And none besides, unless the way only clips it: less of the way lies in it than two steps of the walk.
      for (const cell of crossed) {
        if (walked.has(cell.key)) continue;
        const inside = sampled([from, to], step / 8).filter((point) => depthIn(cell.outline, point) > 0).length * (step / 8);
        expect(inside, `${cell.key} only clipped`).toBeLessThan(2 * step);
      }
    }
  });

  it('takes one cell for a dab, and neither neighbour for a way along a grid line', () => {
    const grid$ = cells(GRIDS[0]!);
    expect(cellsCrossed(grid$, { x: 100, y: 100 }, { x: 100, y: 100 }).map(({ key }) => key)).toEqual(['1,1']);
    // Along the line x = 140 from one cell row into the next: only the cells its two ends lie in.
    expect(cellsCrossed(grid$, { x: 140, y: 80 }, { x: 140, y: 200 }).map(({ key }) => key).sort()).toEqual(['2,1', '2,2']);
    // Through a corner exactly: the two cells it passes through, not the two it touches.
    expect(cellsCrossed(grid$, { x: 100, y: 100 }, { x: 180, y: 180 }).map(({ key }) => key).sort()).toEqual(['1,1', '2,2']);
  });

  it('looks at a long way without listing every cell of the box around it', () => {
    const grid$ = cells({ type: 'square', size: 10, offsetX: 0, offsetY: 0 });
    const started = performance.now();
    const crossed = cellsCrossed(grid$, { x: 5, y: 5 }, { x: 20_005, y: 15_005 });
    // 2,000 columns and 1,500 rows are crossed: a new cell at each line, less the corners it passes through exactly.
    expect(crossed.length).toBeGreaterThan(3000);
    expect(crossed.length).toBeLessThanOrEqual(3501);
    expect(performance.now() - started).toBeLessThan(2000);
  });
});
