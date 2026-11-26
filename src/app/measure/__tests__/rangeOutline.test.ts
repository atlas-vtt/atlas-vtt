import { describe, expect, it } from 'vitest';
import { axialToPixel, createHexLayout, isHexGridType } from '../../grid/hexGeometry';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { DiagonalRule } from '../../types/collectionSettingsTypes';
import type { Point } from '../../types/visionTypes';
import { pointInPolygon } from '../../vision/visibility';
import { MAX_RANGE_CELLS, outlinePointAt, rangeOutline, type RangeOutline } from '../rangeOutline';
import { distanceBetweenTokens, type PlacedToken, type TokenGrid } from '../tokenDistance';
import { FLAT, POINTY, SQUARE } from './areaTestKit';

const GRID: TokenGrid = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const RULES: readonly DiagonalRule[] = ['equidistant', 'alternating', 'manhattan', 'euclidean'];
const cellsBy = (diagonalRule: DiagonalRule): MeasurementSettings => (
  { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule, rangeBands: [], coneAngle: 90 }
);

/** A token of `cells` × `cells` whose footprint starts at the cell (col, row) of `grid`. */
function token(col: number, row: number, cells = 1, grid: TokenGrid = GRID): PlacedToken & { size: number } {
  return { x: (grid.offsetX ?? 0) + (col + cells / 2) * grid.size, y: (grid.offsetY ?? 0) + (row + cells / 2) * grid.size, size: (cells + 1) / 2 };
}

function loopsOf(outline: RangeOutline | null): readonly (readonly Point[])[] {
  if (outline?.kind !== 'cells') throw new Error(`Expected an outline of cells, got ${outline?.kind ?? 'none'}`);
  return outline.loops;
}

const inside = (outline: RangeOutline | null, point: Point): boolean => loopsOf(outline).reduce((within, loop) => within !== pointInPolygon(point, [...loop]), false);

/** The area a closed loop holds, by the shoelace formula. */
function areaOf(loop: readonly Point[]): number {
  return Math.abs(loop.reduce((sum, a, i) => {
    const b = loop[(i + 1) % loop.length]!;
    return sum + a.x * b.y - b.x * a.y;
  }, 0)) / 2;
}

describe('rangeOutline on a square grid', () => {
  it('is the square the rules mean under equidistant diagonals', () => {
    const outline = rangeOutline(token(3, 3), 2, GRID, 'equidistant');
    expect(outline?.centre).toEqual({ x: 245, y: 245 });
    expect(loopsOf(outline)).toEqual([[{ x: 70, y: 70 }, { x: 420, y: 70 }, { x: 420, y: 420 }, { x: 70, y: 420 }]]);
    // Around a large token: the same two cells past each of its edges.
    expect(loopsOf(rangeOutline(token(3, 3, 2), 2, GRID, 'equidistant'))).toEqual([[{ x: 70, y: 70 }, { x: 490, y: 70 }, { x: 490, y: 490 }, { x: 70, y: 490 }]]);
  });

  it('holds the cells each rule counts within two cells: 25, 21, 13 and 13', () => {
    const cells = RULES.map((rule) => {
      const loops = loopsOf(rangeOutline(token(5, 5), 2, GRID, rule));
      expect(loops).toHaveLength(1);
      return areaOf(loops[0]!) / (70 * 70);
    });
    expect(cells).toEqual([25, 21, 13, 13]);
  });

  it('steps along the cells, with a corner only where the outline turns', () => {
    // Manhattan, one cell: a plus of five cells has twelve corners.
    expect(loopsOf(rangeOutline(token(5, 5), 1, GRID, 'manhattan'))[0]).toHaveLength(12);
    // Alternating, two cells: the five by five square without its four corner cells.
    expect(loopsOf(rangeOutline(token(5, 5), 2, GRID, 'alternating'))[0]).toHaveLength(12);
  });

  it.each(RULES)('holds exactly the cells a token is within reach on, by the %s rule, for footprints of every size', (rule) => {
    const settings = cellsBy(rule);
    for (const grid of [GRID, SQUARE]) {
      for (const cells of [1, 2, 3, 4]) {
        for (const reach of [1, 2.5 - 1e-6, 3, 6 + 1e-6, 7.5 - 1e-6]) {
          const origin = token(10, 10, cells, grid);
          const outline = rangeOutline(origin, reach, grid, rule);
          for (let col = 0; col < 24; col++) {
            for (let row = 0; row < 24; row++) {
              const other = token(col, row, 1, grid);
              const within = distanceBetweenTokens(origin, other, grid, settings) <= reach;
              expect(inside(outline, other), `${rule} ${cells} cells, reach ${reach}, cell ${col},${row}`).toBe(within);
            }
          }
        }
      }
    }
  });

  it('reads a point as the cell it lies in', () => {
    const outline = rangeOutline({ x: 3 * 70 + 61, y: 3 * 70 + 4 }, 2, GRID, 'alternating');
    expect(outline).toEqual(rangeOutline(token(3, 3), 2, GRID, 'alternating'));
    expect(outline?.centre).toEqual({ x: 245, y: 245 });
  });
});

describe.each([['pointy', POINTY], ['flat', FLAT]] as const)('rangeOutline on %s hexes', (_name, grid) => {
  const layout = createHexLayout(isHexGridType(grid.type) ? grid.type : 'hex-vertical', grid.size, grid.offsetX ?? 0, grid.offsetY ?? 0);
  const hexArea = (Math.sqrt(3) / 2) * grid.size * grid.size;
  const on = (q: number, r: number, size = 1): PlacedToken & { size: number } => ({ ...axialToPixel(layout, { q, r }), size });

  it('is the ring of hexes one step around a hex: seven hexes inside eighteen corners', () => {
    const [loop, ...more] = loopsOf(rangeOutline(on(2, 3), 1, grid, 'equidistant'));
    expect(more).toEqual([]);
    expect(loop).toHaveLength(18);
    expect(areaOf(loop!)).toBeCloseTo(7 * hexArea, 6);
  });

  it('holds exactly the hexes a token is within reach on, for a token of one hex and of seven', () => {
    for (const size of [1, 2]) {
      for (const reach of [1, 3 + 1e-6, 4.5 - 1e-6]) {
        const origin = on(0, 0, size);
        const outline = rangeOutline(origin, reach, grid, 'alternating');
        expect(loopsOf(outline)).toHaveLength(1);
        for (let q = -9; q <= 9; q++) {
          for (let r = -9; r <= 9; r++) {
            const other = on(q, r);
            const within = distanceBetweenTokens(origin, other, grid, cellsBy('alternating')) <= reach;
            expect(inside(outline, other), `size ${size}, reach ${reach}, hex ${q},${r}`).toBe(within);
          }
        }
      }
    }
  });
});

describe('rangeOutline where no cells are counted', () => {
  const free: TokenGrid = { ...GRID, snapToGrid: false };

  it('is the circle that far from the token\'s edge where tokens stand anywhere, and around a point as it is', () => {
    expect(rangeOutline({ x: 100, y: 90, size: 1 }, 6, free, 'equidistant')).toEqual({ kind: 'circle', centre: { x: 100, y: 90 }, radius: 35 + 6 * 70 });
    expect(rangeOutline({ x: 100, y: 90, size: 2 }, 6, free, 'manhattan')).toEqual({ kind: 'circle', centre: { x: 100, y: 90 }, radius: 105 + 6 * 70 });
    expect(rangeOutline({ x: 100, y: 90 }, 6, free, 'equidistant')).toEqual({ kind: 'circle', centre: { x: 100, y: 90 }, radius: 6 * 70 });
  });

  it('holds exactly the tokens within reach, edge to edge', () => {
    const origin = { x: 300, y: 300, size: 1.5 };
    const outline = rangeOutline(origin, 3, free, 'equidistant');
    if (outline?.kind !== 'circle') throw new Error('Expected a circle');
    for (let x = 0; x <= 900; x += 37) {
      for (let y = 0; y <= 900; y += 41) {
        const other = { x, y, size: 1 };
        // The other token is in reach when its near edge is: its centre lies its own radius further out.
        const nearEdge = Math.hypot(x - origin.x, y - origin.y) - 35;
        expect(nearEdge <= outline.radius, `${x},${y}`).toBe(distanceBetweenTokens(origin, other, free, cellsBy('equidistant')) <= 3);
      }
    }
  });

  it('draws a reach of more cells than are worth counting as a circle around the token\'s space', () => {
    const reach = Math.ceil(Math.sqrt(MAX_RANGE_CELLS) / 2) + 1;
    expect(rangeOutline(token(3, 3), reach, GRID, 'equidistant')).toEqual({ kind: 'circle', centre: { x: 245, y: 245 }, radius: 35 + reach * 70 });
    expect(rangeOutline({ x: 250, y: 250 }, reach, GRID, 'equidistant')).toEqual({ kind: 'circle', centre: { x: 245, y: 245 }, radius: 35 + reach * 70 });
    expect(rangeOutline({ ...axialToPixel(createHexLayout('hex-vertical', 70, 0, 0), { q: 0, r: 0 }), size: 1 }, 80, { ...POINTY, offsetX: 0, offsetY: 0 }, 'equidistant')?.kind).toBe('circle');
  });

  it('has no outline for a reach, a place or a grid that is none', () => {
    expect(rangeOutline(token(3, 3), 0, GRID, 'equidistant')).toBeNull();
    expect(rangeOutline(token(3, 3), Number.NaN, GRID, 'equidistant')).toBeNull();
    expect(rangeOutline(token(3, 3), Infinity, GRID, 'equidistant')).toBeNull();
    expect(rangeOutline({ x: Number.NaN, y: 0, size: 1 }, 2, GRID, 'equidistant')).toBeNull();
    expect(rangeOutline(token(3, 3), 2, { ...GRID, size: 0 }, 'equidistant')).toBeNull();
  });
});

describe('outlinePointAt', () => {
  it('lies on a circle in the direction asked for', () => {
    const circle: RangeOutline = { kind: 'circle', centre: { x: 10, y: 20 }, radius: 100 };
    expect(outlinePointAt(circle, 0)).toEqual({ x: 110, y: 20 });
    const up = outlinePointAt(circle, -Math.PI / 2);
    expect(up.x).toBeCloseTo(10, 9);
    expect(up.y).toBeCloseTo(-80, 9);
  });

  it('lies on the outline of cells that way, at its farthest crossing', () => {
    const square = rangeOutline(token(3, 3), 2, GRID, 'equidistant')!;
    expect(outlinePointAt(square, 0)).toEqual({ x: 420, y: 245 });
    const up = outlinePointAt(square, -Math.PI / 2);
    expect(up.x).toBeCloseTo(245, 9);
    expect(up.y).toBeCloseTo(70, 9);
    // Towards a corner of the plus, the ray leaves through the arm's side.
    const plus = rangeOutline(token(3, 3), 1, GRID, 'manhattan')!;
    const diagonal = outlinePointAt(plus, -Math.PI / 4);
    expect(diagonal.x).toBeCloseTo(280, 9);
    expect(diagonal.y).toBeCloseTo(210, 9);
  });
});
