import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { drawHexGrid } from '../../src/app/grid/hexGridDrawer';
import { createHexLayout } from '../../src/app/grid/hexGeometry';
import { hexLattice } from '../../src/app/grid/hexLattice';
import { squareLattice } from '../../src/app/grid/squareLattice';
import { drawSquareGrid } from '../../src/app/grid/squareGridDrawer';
import type { GridPath } from '../../src/app/grid/gridLineStyle';

const FAR = 5.53816e87;
const SIZE = 38.52;
const BOUNDS = { minX: -40, minY: -40, maxX: 1040, maxY: 1040 };
const MAP = { x: 0, y: 0, width: 1000, height: 1000 };
const MAX_CALLS = 1_000_000;

/** A path that counts calls and gives up past `MAX_CALLS`, so a runaway draw fails instead of running on. */
function countingPath(): { path: GridPath; calls: () => number } {
  let calls = 0;
  const step = (): GridPath => {
    if (++calls > MAX_CALLS) throw new Error(`more than ${MAX_CALLS} drawing calls`);
    return path;
  };
  const path: GridPath = { moveTo: step, lineTo: step, poly: step };
  return { path, calls: () => calls };
}

/**
 * Runs `work` and stops it after `ms`: a loop whose step no longer changes its float draws nothing and would never
 * return, so a call bound alone cannot catch it. `vm`'s timeout ends any synchronous code on this thread.
 */
function within<T>(ms: number, work: () => T): T {
  return runInNewContext('work()', { work }, { timeout: ms }) as T;
}

describe('a grid whose origin lies far from the map', () => {
  it('draws a square grid in a bounded number of calls, the same lines as next to zero', () => {
    for (const lineType of ['solid', 'dashed', 'dotted'] as const) {
      const far = countingPath();
      within(3000, () => drawSquareGrid(far.path, BOUNDS, SIZE, FAR, -FAR, lineType));
      const near = countingPath();
      drawSquareGrid(near.path, BOUNDS, SIZE, FAR % SIZE, (-FAR % SIZE) + SIZE, lineType);
      expect(far.calls()).toBe(near.calls());
      expect(far.calls()).toBeGreaterThan(0);
    }
  });

  it('draws a hex grid in a bounded number of calls, both orientations', () => {
    for (const type of ['hex-horizontal', 'hex-vertical'] as const) {
      for (const lineType of ['solid', 'dotted'] as const) {
        const far = countingPath();
        within(3000, () => drawHexGrid(far.path, BOUNDS, createHexLayout(type, SIZE, FAR, FAR), lineType));
        expect(far.calls()).toBeGreaterThan(0);
        expect(far.calls()).toBeLessThan(MAX_CALLS);
      }
    }
  });

  it('numbers the cells of square and hex lattices in bounded time', () => {
    const square = within(3000, () => squareLattice(SIZE, FAR, FAR).cellsOnMap(MAP));
    expect(square.length).toBeGreaterThan(0);
    expect(square.length).toBeLessThan(2000);
    for (const type of ['hex-horizontal', 'hex-vertical'] as const) {
      const hexes = within(3000, () => hexLattice(createHexLayout(type, SIZE, -FAR, FAR)).cellsOnMap(MAP));
      expect(hexes.length).toBeGreaterThan(0);
      expect(hexes.length).toBeLessThan(2000);
    }
  });
});
