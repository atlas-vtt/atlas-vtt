import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../grid/gridDistance';
import { FLAT, GRIDS, POINTY, seeded, SQUARE } from '../../measure/__tests__/areaTestKit';
import { cellCentreAt, cellOutline } from '../../measure/measureGrid';
import { snapDrawPoint, snapStampPoint } from '../drawSnap';
import { distance } from './annotationKit';

const PLAIN: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };

describe('snapDrawPoint', () => {
  it('snaps to a cell\'s corners, its centre and the middles of its edges', () => {
    expect(snapDrawPoint(PLAIN, { x: 100, y: 110 })).toEqual({ x: 105, y: 105 });
    expect(snapDrawPoint(PLAIN, { x: 75, y: 132 })).toEqual({ x: 70, y: 140 });
    expect(snapDrawPoint(PLAIN, { x: 99, y: 132 })).toEqual({ x: 105, y: 140 });
  });

  it('snaps to the nearest of those places on a square grid, and of a hex\'s centre and corners on a hex grid', () => {
    const random = seeded(19);
    for (const [, grid] of GRIDS) {
      for (let i = 0; i < 200; i++) {
        const point = { x: random() * 1600 - 800, y: random() * 1600 - 800 };
        const centres = [-1, 0, 1].flatMap((column) => [-1, 0, 1].map((row) => cellCentreAt(grid, { x: point.x + column * grid.size, y: point.y + row * grid.size })));
        const places = centres.flatMap((centre) => {
          const corners = cellOutline(grid, centre);
          const middles = grid === SQUARE ? corners.map((corner, c) => ({ x: (corner.x + corners[(c + 1) % 4]!.x) / 2, y: (corner.y + corners[(c + 1) % 4]!.y) / 2 })) : [];
          return [centre, ...corners, ...middles];
        });
        expect(distance(snapDrawPoint(grid, point), point)).toBeCloseTo(Math.min(...places.map((place) => distance(place, point))), 9);
      }
    }
  });

  it('leaves a point where it is without a grid to snap to, and when placed freely', () => {
    expect(snapDrawPoint(null, { x: 139, y: 71 })).toEqual({ x: 139, y: 71 });
    expect(snapDrawPoint(PLAIN, { x: 139, y: 71 }, true)).toEqual({ x: 139, y: 71 });
  });
});

describe('snapStampPoint', () => {
  it('puts a stamp on the centre of the cell under it', () => {
    expect(snapStampPoint(PLAIN, { x: 139, y: 71 })).toEqual({ x: 105, y: 105 });
    for (const grid of [SQUARE, POINTY, FLAT]) {
      expect(snapStampPoint(grid, { x: 333, y: 417 })).toEqual(cellCentreAt(grid, { x: 333, y: 417 }));
      expect(snapStampPoint(grid, { x: 333, y: 417 }, false, grid.size * 3)).toEqual(cellCentreAt(grid, { x: 333, y: 417 }));
      expect(snapStampPoint(grid, { x: 333, y: 417 }, false, grid.size / 2)).toEqual(cellCentreAt(grid, { x: 333, y: 417 }));
    }
  });

  it('puts a stamp two cells wide where four cells meet, so it covers whole cells', () => {
    expect(snapStampPoint(PLAIN, { x: 139, y: 71 }, false, 140)).toEqual({ x: 140, y: 70 });
    const random = seeded(2);
    for (let i = 0; i < 100; i++) {
      const point = { x: random() * 1600 - 800, y: random() * 1600 - 800 };
      const nearest = Math.min(...cellOutline(SQUARE, cellCentreAt(SQUARE, point)).map((corner) => distance(corner, point)));
      expect(distance(snapStampPoint(SQUARE, point, false, 140), point)).toBeCloseTo(nearest, 9);
    }
    // A hex has no such place: a stamp of any size sits on a hex.
    expect(snapStampPoint(POINTY, { x: 333, y: 417 }, false, 140)).toEqual(cellCentreAt(POINTY, { x: 333, y: 417 }));
  });

  it('leaves a stamp where it is without a grid to snap to, and when placed freely', () => {
    expect(snapStampPoint(null, { x: 139, y: 71 }, false, 140)).toEqual({ x: 139, y: 71 });
    expect(snapStampPoint(PLAIN, { x: 139, y: 71 }, true)).toEqual({ x: 139, y: 71 });
  });
});
