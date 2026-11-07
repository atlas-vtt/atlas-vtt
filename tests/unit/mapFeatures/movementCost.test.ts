import { describe, expect, it } from 'vitest';
import { movementCostInCells, type DifficultCells, type MovementRules } from '../../../src/app/grid/movementCost';
import type { GridGeometry } from '../../../src/app/grid/gridDistance';
import { axialToPixel, createHexLayout, pixelToAxial } from '../../../src/app/grid/hexGeometry';
import type { DiagonalRule } from '../../../src/app/types/collectionSettingsTypes';
import { difficultCells, featureIndex, featureAt } from '../../../src/app/mapFeatures/featureIndex';
import { mapFeatureList } from '../../../src/app/mapFeatures/mapFeatures';
import { dragPathCells } from '../../../src/app/online/marks/RemoteDrags';
import { resolveMeasurementSettings } from '../../../src/app/grid/measurementFormat';

const SIZE = 70;
const SQUARE: GridGeometry = { type: 'square', size: SIZE, offsetX: 0, offsetY: 0 };
/** The centre of cell (col, row). */
const cell = (col: number, row: number): { x: number; y: number } => ({ x: (col + 0.5) * SIZE, y: (row + 0.5) * SIZE });
/** Difficult terrain on the cells listed as "col,row". */
const cells = (...listed: string[]): DifficultCells => {
  const set = new Set(listed);
  return (centre) => set.has(`${Math.floor(centre.x / SIZE)},${Math.floor(centre.y / SIZE)}`);
};
const rules = (diagonalRule: DiagonalRule, difficult: DifficultCells | null, difficultTerrain: 'double' | 'none' = 'double'): MovementRules => ({ diagonalRule, difficultTerrain, difficult });

describe('the cost of a move on a square grid', () => {
  it('counts every cell entered in difficult terrain twice, the cell left from never', () => {
    const path = [cell(0, 0), cell(4, 0)];
    expect(movementCostInCells(SQUARE, path, rules('equidistant', cells('0,0', '2,0', '3,0')))).toBe(6);
    expect(movementCostInCells(SQUARE, path, rules('equidistant', cells('0,0', '2,0', '3,0'), 'none'))).toBe(4);
    expect(movementCostInCells(SQUARE, path, rules('equidistant', null))).toBe(4);
  });

  it('prices a diagonal into difficult terrain as the diagonal rule prices it, counted over the whole path', () => {
    const diagonal = [cell(0, 0), cell(3, 3)];
    // 5-10-5: the second diagonal costs 2, and twice that in difficult terrain
    expect(movementCostInCells(SQUARE, diagonal, rules('alternating', null))).toBe(4);
    expect(movementCostInCells(SQUARE, diagonal, rules('alternating', cells('2,2')))).toBe(6);
    expect(movementCostInCells(SQUARE, diagonal, rules('alternating', cells('1,1')))).toBe(5);
    // A waypoint does not restart the count: the diagonal after it is the second
    expect(movementCostInCells(SQUARE, [cell(0, 0), cell(1, 1), cell(2, 2)], rules('alternating', cells('2,2')))).toBe(3 + 2);
    expect(movementCostInCells(SQUARE, diagonal, rules('equidistant', cells('1,1', '2,2')))).toBe(5);
    expect(movementCostInCells(SQUARE, diagonal, rules('euclidean', cells('1,1', '2,2', '3,3')))).toBeCloseTo(2 * 3 * Math.SQRT2);
  });

  it('walks a line with as many diagonal steps as the distance counts', () => {
    // Two right, one down: one diagonal and one straight step, the diagonal half-way
    const path = [cell(0, 0), cell(2, 1)];
    expect(movementCostInCells(SQUARE, path, rules('alternating', cells('1,0', '1,1', '2,1')))).toBe(2 + 2);
  });

  it('counts a step as difficult where any cell of a larger footprint lands in difficult terrain', () => {
    // A Large token (2 × 2) starting at (0, 0) moving right along a strip of difficult terrain one row below it
    const path = [cell(0, 0), cell(3, 0)];
    const strip = cells('1,1', '2,1', '3,1', '4,1');
    expect(movementCostInCells(SQUARE, path, rules('equidistant', strip), 1)).toBe(3);
    expect(movementCostInCells(SQUARE, path, rules('equidistant', strip), 2)).toBe(6);
  });

  it('honours the grid offset', () => {
    const grid: GridGeometry = { ...SQUARE, offsetX: 20, offsetY: 10 };
    const at = (col: number, row: number): { x: number; y: number } => ({ x: 20 + (col + 0.5) * SIZE, y: 10 + (row + 0.5) * SIZE });
    const difficult: DifficultCells = (centre) => Math.floor((centre.x - 20) / SIZE) === 1;
    expect(movementCostInCells(grid, [at(0, 0), at(2, 0)], rules('equidistant', difficult))).toBe(3);
  });
});

describe('the cost of a move on a hex grid', () => {
  it('counts every hex entered in difficult terrain twice', () => {
    const grid: GridGeometry = { type: 'hex-vertical', size: SIZE, offsetX: 0, offsetY: 0 };
    const layout = createHexLayout('hex-vertical', SIZE, 0, 0);
    const hex = (q: number, r: number): { x: number; y: number } => axialToPixel(layout, { q, r });
    const difficult: DifficultCells = (centre) => {
      const { q, r } = pixelToAxial(layout, centre);
      return r === 0 && (q === 2 || q === 3);
    };
    expect(movementCostInCells(grid, [hex(0, 0), hex(4, 0)], rules('alternating', difficult))).toBe(6);
    expect(movementCostInCells(grid, [hex(0, 0), hex(0, 4)], rules('alternating', difficult))).toBe(4);
  });
});

describe('difficult terrain from map features', () => {
  it('lies where a feature marked difficult covers the cell\'s centre', () => {
    const list = mapFeatureList({
      rubble: { id: 'rubble', kind: 'map-feature', name: 'Rubble', polygon: [{ x: 70, y: 0 }, { x: 210, y: 0 }, { x: 210, y: 70 }, { x: 70, y: 70 }], terrain: { difficult: true } },
      statue: { id: 'statue', kind: 'map-feature', name: 'Statue', polygon: [{ x: 280, y: 0 }, { x: 350, y: 0 }, { x: 350, y: 70 }, { x: 280, y: 70 }] },
    });
    expect(featureAt(featureIndex(list), cell(4, 0))?.id).toBe('statue');
    expect(movementCostInCells(SQUARE, [cell(0, 0), cell(5, 0)], rules('equidistant', difficultCells(list)))).toBe(7);
  });

  it('costs the GM\'s view of a player\'s drag the same', () => {
    const measurement = { ...resolveMeasurementSettings({ unitType: 'feet', unitDistance: 5, measurementMode: 'metric', difficultTerrain: 'double' }, null) };
    expect(dragPathCells({ grid: SQUARE, measurement, difficult: cells('1,0') }, [cell(0, 0), cell(2, 0)], 1, true)).toBe(3);
    expect(dragPathCells({ grid: SQUARE, measurement }, [cell(0, 0), cell(2, 0)], 1, true)).toBe(2);
  });
});
