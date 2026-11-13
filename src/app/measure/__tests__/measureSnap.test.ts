import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../grid/gridDistance';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { Point } from '../../types/visionTypes';
import { cellCentreAt, cellOutline, lengthInCells } from '../measureGrid';
import { measureLabelText } from '../measureLabelText';
import { snapAreaEnd, snapAreaOrigin, snapRulerPoint } from '../measureSnap';
import { FLAT, GRIDS, POINTY, seeded, SQUARE } from './areaTestKit';

const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 };
/** A grid with offsets and a cell size that are no round numbers, far from the map's corner. */
const AWKWARD: GridGeometry = { type: 'square', size: 71.3, offsetX: 3.7, offsetY: -12.9 };

const distance = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y);

describe('snapRulerPoint', () => {
  it('snaps to the centre of the cell the point lies in', () => {
    expect(snapRulerPoint({ type: 'square', size: 70, offsetX: 0, offsetY: 0 }, { x: 139, y: 71 })).toEqual({ x: 105, y: 105 });
    for (const [, grid] of GRIDS) expect(snapRulerPoint(grid, { x: 333, y: 417 })).toEqual(cellCentreAt(grid, { x: 333, y: 417 }));
  });

  it('leaves the point where it is without a grid to snap to, and when placed freely', () => {
    expect(snapRulerPoint(null, { x: 139, y: 71 })).toEqual({ x: 139, y: 71 });
    expect(snapRulerPoint(SQUARE, { x: 139, y: 71 }, true)).toEqual({ x: 139, y: 71 });
  });
});

describe('snapAreaOrigin', () => {
  it('snaps to a cell\'s centre, its corners and the middles of its edges on a square grid', () => {
    const grid: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
    expect(snapAreaOrigin(grid, { x: 100, y: 110 })).toEqual({ x: 105, y: 105 });
    expect(snapAreaOrigin(grid, { x: 75, y: 132 })).toEqual({ x: 70, y: 140 });
    expect(snapAreaOrigin(grid, { x: 99, y: 132 })).toEqual({ x: 105, y: 140 });
    expect(snapAreaOrigin(grid, { x: 75, y: 99 })).toEqual({ x: 70, y: 105 });
  });

  it('snaps to the nearest of every such place', () => {
    const random = seeded(3);
    for (let i = 0; i < 300; i++) {
      const point = { x: random() * 2000 - 1000, y: random() * 2000 - 1000 };
      const centre = cellCentreAt(AWKWARD, point);
      const half = AWKWARD.size / 2;
      const places = [-1, 0, 1].flatMap((column) => [-1, 0, 1].map((row) => ({ x: centre.x + column * half, y: centre.y + row * half })));
      const nearest = Math.min(...places.map((place) => distance(place, point)));
      expect(distance(snapAreaOrigin(AWKWARD, point), point)).toBeCloseTo(nearest, 9);
    }
  });

  it('snaps to the nearest of a hex\'s centre and the corners of the hexes around', () => {
    const random = seeded(5);
    for (const grid of [POINTY, FLAT]) {
      for (let i = 0; i < 300; i++) {
        const point = { x: random() * 2000 - 1000, y: random() * 2000 - 1000 };
        const centres = [-1, 0, 1].flatMap((column) => [-1, 0, 1].map((row) => cellCentreAt(grid, { x: point.x + column * grid.size, y: point.y + row * grid.size })));
        const places = centres.flatMap((centre) => [centre, ...cellOutline(grid, centre)]);
        const nearest = Math.min(...places.map((place) => distance(place, point)));
        expect(distance(snapAreaOrigin(grid, point), point)).toBeCloseTo(nearest, 9);
      }
    }
  });

  it('leaves the point where it is without a grid to snap to, and when placed freely', () => {
    expect(snapAreaOrigin(null, { x: 99, y: 132 })).toEqual({ x: 99, y: 132 });
    expect(snapAreaOrigin(POINTY, { x: 99, y: 132 }, true)).toEqual({ x: 99, y: 132 });
  });
});

describe('snapAreaEnd', () => {
  it('makes a circle of four squares read 20 ft in every direction', () => {
    for (const grid of [AWKWARD, { ...AWKWARD, offsetX: 91_234.5, offsetY: 77_001.25 }]) {
      const origin = snapAreaOrigin(grid, { x: grid.offsetX! + 1000, y: grid.offsetY! + 700 });
      for (let degrees = 0; degrees < 360; degrees += 1) {
        const pointer = { x: origin.x + 4.2 * grid.size * Math.cos((degrees * Math.PI) / 180), y: origin.y + 4.2 * grid.size * Math.sin((degrees * Math.PI) / 180) };
        const end = snapAreaEnd(grid, origin, pointer);
        expect(lengthInCells(distance(origin, end), grid.size)).toBe(4);
        expect(measureLabelText({ shape: 'circle', points: [origin, end] }, grid, FEET)).toBe('20ft');
        // It still points where the pointer does.
        expect(Math.atan2(end.y - origin.y, end.x - origin.x)).toBeCloseTo(Math.atan2(pointer.y - origin.y, pointer.x - origin.x), 9);
      }
    }
  });

  it('snaps the size to whole cells, never the end to a cell', () => {
    const end = snapAreaEnd(SQUARE, { x: 0, y: 0 }, { x: 100, y: 100 });
    expect(distance({ x: 0, y: 0 }, end)).toBeCloseTo(140, 9);
    expect(end.x).toBeCloseTo(end.y, 9);
    expect(distance({ x: 0, y: 0 }, snapAreaEnd(POINTY, { x: 0, y: 0 }, { x: 180, y: 0 }))).toBeCloseTo(210, 9);
  });

  it('is at least one cell long', () => {
    expect(snapAreaEnd(SQUARE, { x: 10, y: 10 }, { x: 13, y: 10 })).toEqual({ x: 80, y: 10 });
  });

  it('stays on the origin while the pointer has not left it', () => {
    expect(snapAreaEnd(SQUARE, { x: 10, y: 10 }, { x: 10, y: 10 })).toEqual({ x: 10, y: 10 });
  });

  it('leaves the end where it is without a grid to snap to, and when placed freely', () => {
    expect(snapAreaEnd(null, { x: 0, y: 0 }, { x: 100, y: 3 })).toEqual({ x: 100, y: 3 });
    expect(snapAreaEnd(SQUARE, { x: 0, y: 0 }, { x: 100, y: 3 }, true)).toEqual({ x: 100, y: 3 });
  });
});

describe('lengthInCells', () => {
  it('takes a length within a millionth of whole cells as whole, and no other', () => {
    expect(lengthInCells(279.99999999999994, 70)).toBe(4);
    expect(lengthInCells(280.00000000000006, 70)).toBe(4);
    expect(lengthInCells(105, 70)).toBe(1.5);
    expect(lengthInCells(280.01, 70)).toBeCloseTo(4.000142857, 8);
  });
});
