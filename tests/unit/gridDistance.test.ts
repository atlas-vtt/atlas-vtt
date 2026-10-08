import { describe, it, expect } from 'vitest';
import { pathLengthInCells, type GridGeometry } from '../../src/app/grid/gridDistance';
import { axialToPixel, createHexLayout, type Point } from '../../src/app/grid/hexGeometry';
import { formatDistance, type MeasurementSettings } from '../../src/app/grid/measurementFormat';
import { ALIGNED_GRIDS, pointInCell, snappingGrid, type SnappingGridOptions } from '../helpers/snappingGrid';

const square: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const cell = (col: number, row: number): { x: number; y: number } => ({ x: 35 + col * 70, y: 35 + row * 70 });

describe('pathLengthInCells on square grids', () => {
  it('counts straight moves in cells', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(4, 0)], 'equidistant')).toBe(4);
  });

  it('counts every diagonal as 1 under the equidistant rule', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(3, 3)], 'equidistant')).toBe(3);
    expect(pathLengthInCells(square, [cell(0, 0), cell(4, 2)], 'equidistant')).toBe(4);
  });

  it('alternates diagonals between 1 and 2', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(1, 1)], 'alternating')).toBe(1);
    expect(pathLengthInCells(square, [cell(0, 0), cell(2, 2)], 'alternating')).toBe(3);
    expect(pathLengthInCells(square, [cell(0, 0), cell(3, 3)], 'alternating')).toBe(4);
    expect(pathLengthInCells(square, [cell(0, 0), cell(4, 2)], 'alternating')).toBe(5);
  });

  it('carries the alternating count across waypoints', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(1, 1), cell(2, 2)], 'alternating')).toBe(3);
  });

  it('measures the straight line under the euclidean rule', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(3, 4)], 'euclidean')).toBeCloseTo(5);
  });

  it('adds up the segments of a path', () => {
    expect(pathLengthInCells(square, [cell(0, 0), cell(3, 0), cell(3, 2)], 'equidistant')).toBe(5);
  });

  it('is zero for a single point', () => {
    expect(pathLengthInCells(square, [cell(2, 2)], 'equidistant')).toBe(0);
  });
});

describe('pathLengthInCells on a grid aligned to a map', () => {
  const SPAN = 40;

  /** Every distinct result of measuring the same path of cell steps from each cell of the map, between the points a token of `tokenSize` snaps to. */
  function everywhere(grid: SnappingGridOptions, steps: readonly (readonly [number, number])[], measure: (points: Point[]) => unknown, tokenSize = 1): unknown[] {
    const snapping = snappingGrid(grid);
    const results = new Set<unknown>();
    for (let col = 0; col < SPAN; col++) {
      for (let row = 0; row < SPAN; row++) {
        results.add(measure(steps.map(([dCol, dRow]) => {
          const point = pointInCell(grid, col + dCol, row + dRow);
          return snapping.snapTokenCenter(point.x, point.y, tokenSize);
        })));
      }
    }
    return [...results];
  }

  it.each(ALIGNED_GRIDS)('prices two diagonals as 1 and 2 wherever they are measured (size $size, offset $offsetX/$offsetY)', (grid) => {
    expect(everywhere(grid, [[0, 0], [2, 2]], points => pathLengthInCells(grid, points, 'alternating'))).toEqual([3]);
    expect(everywhere(grid, [[2, 0], [0, 2]], points => pathLengthInCells(grid, points, 'alternating'))).toEqual([3]);
  });

  it.each(ALIGNED_GRIDS)('prices a longer path with a waypoint the same everywhere (size $size)', (grid) => {
    // 3 diagonals, 2 straight, 1 more diagonal: 4 diagonals cost 6, the straights 2.
    expect(everywhere(grid, [[0, 0], [3, 3], [5, 3], [6, 2]], points => pathLengthInCells(grid, points, 'alternating'))).toEqual([8]);
  });

  it.each(ALIGNED_GRIDS)('counts whole cells under the other rules (size $size)', (grid) => {
    expect(everywhere(grid, [[0, 0], [3, 0]], points => pathLengthInCells(grid, points, 'equidistant'))).toEqual([3]);
    expect(everywhere(grid, [[0, 0], [4, 2]], points => pathLengthInCells(grid, points, 'equidistant'))).toEqual([4]);
    expect(everywhere(grid, [[0, 0], [3, 4]], points => pathLengthInCells(grid, points, 'euclidean'))).toEqual([5]);
  });

  it.each(ALIGNED_GRIDS)('measures a token of two cells, which snaps to where cells meet, like any other (size $size)', (grid) => {
    expect(everywhere(grid, [[0, 0], [2, 2]], points => pathLengthInCells(grid, points, 'alternating'), 2)).toEqual([3]);
  });

  it.each(ALIGNED_GRIDS)('labels the same path alike everywhere (size $size)', (grid) => {
    const pathfinder: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 };
    const metres: MeasurementSettings = { ...pathfinder, unitType: 'meters', unitDistance: 1.5, ruleDistance: 1.5, diagonalRule: 'equidistant' };
    expect(everywhere(grid, [[0, 0], [2, 2]], points => formatDistance(pathLengthInCells(grid, points, 'alternating'), pathfinder))).toEqual(['15ft']);
    // Three cells of 1.5 m are 4.5 m: one label, however a half unit is written.
    expect(everywhere(grid, [[0, 0], [3, 0]], points => formatDistance(pathLengthInCells(grid, points, 'equidistant'), metres))).toHaveLength(1);
  });

  it('keeps the part of a cell a path measured without snapping covers', () => {
    const grid = ALIGNED_GRIDS[0]!;
    const from = { x: 10, y: 10 };
    expect(pathLengthInCells(grid, [from, { x: 10 + 2.5 * grid.size, y: 10 }], 'equidistant')).toBeCloseTo(2.5, 12);
    expect(pathLengthInCells(grid, [from, { x: 10 + 1.5 * grid.size, y: 10 + 1.5 * grid.size }], 'alternating')).toBeCloseTo(1.5, 12);
  });
});

describe('pathLengthInCells on hex grids', () => {
  const hex: GridGeometry = { type: 'hex-vertical', size: 60, offsetX: 0, offsetY: 0 };
  const layout = createHexLayout('hex-vertical', 60, 0, 0);

  it('counts hex steps and ignores the diagonal rule', () => {
    const points = [axialToPixel(layout, { q: 0, r: 0 }), axialToPixel(layout, { q: 3, r: -1 })];
    expect(pathLengthInCells(hex, points, 'equidistant')).toBe(3);
    expect(pathLengthInCells(hex, points, 'alternating')).toBe(3);
  });

  it('adds up steps across waypoints', () => {
    const points = [{ q: 0, r: 0 }, { q: 2, r: 0 }, { q: 2, r: 2 }].map(hexCell => axialToPixel(layout, hexCell));
    expect(pathLengthInCells(hex, points, 'euclidean')).toBe(4);
  });
});
