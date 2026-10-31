import { describe, expect, it } from 'vitest';
import { createHexLayout } from '../../src/app/grid/hexGeometry';
import { hexLattice } from '../../src/app/grid/hexLattice';
import { squareLattice } from '../../src/app/grid/squareLattice';
import { numberCells, type CellLattice, type CellNumberFormat, type MapRect } from '../../src/app/grid/cellNumbering';
import { numberCellsInRect } from '../../src/app/grid/cellNumbersInRect';

const FORMATS: CellNumberFormat[] = ['column-row', 'sequential', 'letter-number'];

const LATTICES: Array<[string, CellLattice, MapRect]> = [
  ['a square grid', squareLattice(70, 0, 0), { x: 0, y: 0, width: 1500, height: 900 }],
  ['a square grid with an offset and a map edge cutting cells', squareLattice(53, -17, 31), { x: 0, y: 0, width: 1234, height: 777 }],
  ['a flat-top hex grid', hexLattice(createHexLayout('hex-horizontal', 60, 0, 0)), { x: 0, y: 0, width: 1300, height: 820 }],
  ['a flat-top hex grid with an offset', hexLattice(createHexLayout('hex-horizontal', 47, -21, 13)), { x: 0, y: 0, width: 1111, height: 1009 }],
  ['a pointy-top hex grid', hexLattice(createHexLayout('hex-vertical', 60, 0, 0)), { x: 0, y: 0, width: 1300, height: 820 }],
  ['a pointy-top hex grid with an offset', hexLattice(createHexLayout('hex-vertical', 41, 9, -26)), { x: 0, y: 0, width: 977, height: 1203 }],
  ['a hex grid narrower than two hexes', hexLattice(createHexLayout('hex-vertical', 100, 0, 0)), { x: 0, y: 0, width: 140, height: 700 }],
];

/** Parts of the map: its corners (first and last rows), a strip across the middle (staggered lines), the whole map and more. */
function partsOf(map: MapRect): MapRect[] {
  const w = map.width;
  const h = map.height;
  return [
    { x: map.x - 50, y: map.y - 50, width: w / 3, height: h / 3 },
    { x: map.x + (2 * w) / 3, y: map.y + (2 * h) / 3, width: w, height: h },
    { x: map.x + w * 0.21, y: map.y + h * 0.37, width: w * 0.43, height: h * 0.29 },
    { x: map.x, y: map.y + h * 0.4, width: w, height: h * 0.2 },
    { x: map.x + w * 0.45, y: map.y, width: w * 0.1, height: h },
    { x: map.x - w, y: map.y - h, width: 3 * w, height: 3 * h },
  ];
}

function inside(rect: MapRect, point: { x: number; y: number }): boolean {
  return point.x >= rect.x && point.x <= rect.x + rect.width && point.y >= rect.y && point.y <= rect.y + rect.height;
}

describe('numbering a part of the map', () => {
  for (const [name, lattice, map] of LATTICES) {
    for (const format of FORMATS) {
      it(`gives the cells of every part the numbers the whole map gives them (${name}, ${format})`, () => {
        const whole = numberCells(lattice, map, format);
        expect(whole.length).toBeGreaterThan(0);
        for (const part of partsOf(map)) {
          const expected = whole.filter((cell) => inside(part, cell.center));
          const sortByKey = (cells: typeof whole): typeof whole => [...cells].sort((a, b) => a.key.localeCompare(b.key));
          expect(sortByKey(numberCellsInRect(lattice, map, part, format))).toEqual(sortByKey(expected));
        }
      });
    }
  }

  it('places the same cells as the whole map, with the same rows and columns', () => {
    for (const [, lattice, map] of LATTICES) {
      const whole = lattice.cellsOnMap(map);
      const all = lattice.cellsInRect(map, { x: map.x - map.width, y: map.y - map.height, width: 3 * map.width, height: 3 * map.height });
      expect(all).toEqual(whole);
    }
  });

  it('numbers nothing on an empty map', () => {
    const lattice = squareLattice(70, 0, 0);
    expect(numberCellsInRect(lattice, { x: 0, y: 0, width: 0, height: 0 }, { x: 0, y: 0, width: 100, height: 100 }, 'sequential')).toEqual([]);
  });
});
