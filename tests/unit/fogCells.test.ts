import { describe, expect, it } from 'vitest';
import { CellStroke, cellShapes, cellsOnSegment, hasCells, type FogCell } from '../../src/app/fog/fogCells';
import type { GridGeometry } from '../../src/app/grid/gridDistance';
import type { Point } from '../../src/app/types/visionTypes';

const TENS: GridGeometry = { type: 'square', size: 10, offsetX: 0, offsetY: 0 };
const POINTY: GridGeometry = { type: 'hex-vertical', size: 70, offsetX: 0, offsetY: 0 };
const FLAT: GridGeometry = { type: 'hex-horizontal', size: 70, offsetX: 0, offsetY: 0 };
/** A 70 px hex's circumradius, and its area. */
const RADIUS = 70 / Math.sqrt(3);
const HEX_AREA = (Math.sqrt(3) / 2) * 70 * 70;

const cell = (i: number, j: number): FogCell => ({ i, j });
const names = (cells: readonly FogCell[]): string[] => cells.map(({ i, j }) => `${i},${j}`);
const outlines = (grid: GridGeometry, cells: readonly FogCell[]): Point[][] => cellShapes(grid, cells).map((shape) => shape.points);

/** The area an outline encloses, whichever way round it runs. */
function areaOf(points: readonly Point[]): number {
  let twice = 0;
  points.forEach((a, index) => {
    const b = points[(index + 1) % points.length]!;
    twice += a.x * b.y - b.x * a.y;
  });
  return Math.abs(twice) / 2;
}

function expectClose(points: readonly Point[], expected: ReadonlyArray<readonly [number, number]>): void {
  expect(points).toHaveLength(expected.length);
  expected.forEach(([x, y], index) => {
    expect(points[index]!.x).toBeCloseTo(x, 9);
    expect(points[index]!.y).toBeCloseTo(y, 9);
  });
}

describe('the cells a drag passes', () => {
  it('are every square along the line, however far the pointer went in one move', () => {
    expect(names(cellsOnSegment(TENS, { x: 5, y: 5 }, { x: 35, y: 5 }))).toEqual(['0,0', '1,0', '2,0', '3,0']);
    expect(names(cellsOnSegment(TENS, { x: 5, y: 35 }, { x: 5, y: 5 }))).toEqual(['0,3', '0,2', '0,1', '0,0']);
    expect(names(cellsOnSegment(TENS, { x: 7, y: 7 }, { x: 8, y: 3 }))).toEqual(['0,0']);
    // The line rises from row 0 to row 1 at x = 19.3, just before the third column: it clips the square at (1, 1).
    expect(names(cellsOnSegment(TENS, { x: 5, y: 5 }, { x: 25, y: 12 }))).toEqual(['0,0', '1,0', '1,1', '2,1']);
  });

  it('are counted from the grid\'s own corner, to either side of it', () => {
    const shifted: GridGeometry = { type: 'square', size: 10, offsetX: 3, offsetY: 4 };
    expect(names(cellsOnSegment(shifted, { x: 4, y: 5 }, { x: 24, y: 5 }))).toEqual(['0,0', '1,0', '2,0']);
    // Over the grid's left edge at y = 4.3, then over its top edge at x = 3.5.
    expect(names(cellsOnSegment(shifted, { x: 2, y: 5 }, { x: 5, y: 3 }))).toEqual(['-1,0', '0,0', '0,-1']);
    expect(names(cellsOnSegment(TENS, { x: -5, y: 5 }, { x: 5, y: 5 }))).toEqual(['-1,0', '0,0']);
  });

  it('are the hexes along the line on a grid of pointed hexes', () => {
    // Along the first row, through the hexes' upright sides.
    expect(names(cellsOnSegment(POINTY, { x: 10, y: 40 }, { x: 200, y: 40 }))).toEqual(['0,0', '1,0', '2,0']);
    // Straight down at x = 40: out of the first hex through its lower right side, into the hex below and to the right, then into the one below that.
    expect(names(cellsOnSegment(POINTY, { x: 40, y: RADIUS }, { x: 40, y: 4 * RADIUS }))).toEqual(['0,0', '0,1', '-1,2']);
  });

  it('are the hexes along the line on a grid of flat hexes', () => {
    // Down the first column, through the hexes' level sides.
    expect(names(cellsOnSegment(FLAT, { x: 40, y: 10 }, { x: 40, y: 200 }))).toEqual(['0,0', '0,1', '0,2']);
    // To the right at y = 40: the next column stands half a hex lower.
    expect(names(cellsOnSegment(FLAT, { x: RADIUS, y: 40 }, { x: 4 * RADIUS, y: 40 }))).toEqual(['0,0', '1,0', '2,-1']);
  });

  it('are none on a grid without cells, or for a place that is none', () => {
    expect(cellsOnSegment({ size: 0 }, { x: 0, y: 0 }, { x: 50, y: 0 })).toEqual([]);
    expect(cellsOnSegment({ size: 10, offsetX: Number.NaN }, { x: 0, y: 0 }, { x: 50, y: 0 })).toEqual([]);
    expect(cellsOnSegment(TENS, { x: Number.NaN, y: 0 }, { x: 50, y: 0 })).toEqual([]);
    expect(hasCells(TENS)).toBe(true);
    expect(hasCells({ size: -5 })).toBe(false);
    expect(hasCells(null)).toBe(false);
  });
});

describe('the fog shapes that cover cells', () => {
  it('are one outline for squares that hang together, without the corners on a straight side', () => {
    expect(outlines(TENS, [cell(0, 0)])).toEqual([[{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]]);
    expect(outlines(TENS, [cell(0, 0), cell(1, 0), cell(2, 0)])).toEqual([[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 0, y: 10 }]]);
    // An L of three.
    expect(outlines(TENS, [cell(0, 0), cell(1, 0), cell(0, 1)])).toEqual([[{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }]]);
    // With the grid's offsets, and a cell named twice counted once.
    expect(outlines({ type: 'square', size: 10, offsetX: 3, offsetY: -4 }, [cell(-1, 0), cell(-1, 0)])).toEqual([[{ x: -7, y: -4 }, { x: 3, y: -4 }, { x: 3, y: 6 }, { x: -7, y: 6 }]]);
  });

  it('are an outline each for pieces apart, and for squares that meet at a corner alone', () => {
    expect(outlines(TENS, [cell(0, 0), cell(3, 0)])).toHaveLength(2);
    expect(outlines(TENS, [cell(0, 0), cell(1, 1)])).toEqual([
      [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }],
    ]);
    // Four squares round an empty one that touch at corners alone: four squares, and the middle stays open.
    const diamond = outlines(TENS, [cell(1, 0), cell(0, 1), cell(2, 1), cell(1, 2)]);
    expect(diamond).toHaveLength(4);
    expect(diamond.every((points) => points.length === 4 && areaOf(points) === 100)).toBe(true);
  });

  it('are the runs of squares along each row where the cells enclose a hole, which one outline cannot leave out', () => {
    const ring = [cell(0, 0), cell(1, 0), cell(2, 0), cell(2, 1), cell(2, 2), cell(1, 2), cell(0, 2), cell(0, 1)];
    expect(outlines(TENS, ring)).toEqual([
      [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 0, y: 10 }],
      [{ x: 0, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }],
      [{ x: 20, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 20 }, { x: 20, y: 20 }],
      [{ x: 0, y: 20 }, { x: 30, y: 20 }, { x: 30, y: 30 }, { x: 0, y: 30 }],
    ]);
    // The hole at (2, 1) touches the open ground at one corner: enclosed all the same.
    const pinched = [cell(1, 1), cell(1, 0), cell(2, 0), cell(3, 0), cell(3, 1), cell(3, 2), cell(2, 2)];
    expect(outlines(TENS, pinched)).toEqual([
      [{ x: 10, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 10 }, { x: 10, y: 10 }],
      [{ x: 10, y: 10 }, { x: 20, y: 10 }, { x: 20, y: 20 }, { x: 10, y: 20 }],
      [{ x: 30, y: 10 }, { x: 40, y: 10 }, { x: 40, y: 20 }, { x: 30, y: 20 }],
      [{ x: 20, y: 20 }, { x: 40, y: 20 }, { x: 40, y: 30 }, { x: 20, y: 30 }],
    ]);
  });

  it('are a hex\'s six corners, for pointed and for flat tops, with the grid\'s offsets', () => {
    // From the corner below and to the right, round by the bottom.
    expectClose(outlines(POINTY, [cell(0, 0)])[0]!, [[70, 1.5 * RADIUS], [35, 2 * RADIUS], [0, 1.5 * RADIUS], [0, RADIUS / 2], [35, 0], [70, RADIUS / 2]]);
    expectClose(outlines({ ...POINTY, offsetX: 10, offsetY: 20 }, [cell(1, 0)])[0]!, [[150, 20 + 1.5 * RADIUS], [115, 20 + 2 * RADIUS], [80, 20 + 1.5 * RADIUS], [80, 20 + RADIUS / 2], [115, 20], [150, 20 + RADIUS / 2]]);
    expectClose(outlines(FLAT, [cell(0, 0)])[0]!, [[1.5 * RADIUS, 70], [RADIUS / 2, 70], [0, 35], [RADIUS / 2, 0], [1.5 * RADIUS, 0], [2 * RADIUS, 35]]);
  });

  it('are one outline for hexes that hang together', () => {
    const pair = outlines(POINTY, [cell(0, 0), cell(1, 0)]);
    expect(pair).toHaveLength(1);
    expect(pair[0]).toHaveLength(10);
    expect(areaOf(pair[0]!)).toBeCloseTo(2 * HEX_AREA, 6);
    const three = outlines(FLAT, [cell(0, 0), cell(1, 0), cell(0, 1)]);
    expect(three).toHaveLength(1);
    expect(three[0]).toHaveLength(12);
    expect(areaOf(three[0]!)).toBeCloseTo(3 * HEX_AREA, 6);
    expect(outlines(POINTY, [cell(0, 0), cell(2, 0)])).toHaveLength(2);
  });

  it('are the single hexes where they enclose one, with the corners they share the same to the last bit', () => {
    const round = [cell(1, 0), cell(1, -1), cell(0, -1), cell(-1, 0), cell(-1, 1), cell(0, 1)];
    for (const grid of [POINTY, FLAT, { ...POINTY, size: 70.35, offsetX: 12.4, offsetY: -3.3 }]) {
      const hexes = outlines(grid, round);
      expect(hexes).toHaveLength(6);
      expect(hexes.every((points) => points.length === 6)).toBe(true);
      // Six corners of the hex in the middle, six where two of the ring meet outside it, twelve of one hex alone.
      const corners = new Set(hexes.flatMap((points) => points.map((point) => `${point.x},${point.y}`)));
      expect(corners.size).toBe(24);
    }
  });

  it('are none for no cells, for a grid without cells, and for what names no cell', () => {
    expect(cellShapes(TENS, [])).toEqual([]);
    expect(cellShapes({ size: 0 }, [cell(0, 0)])).toEqual([]);
    expect(cellShapes(TENS, [cell(0.5, 0), cell(Number.NaN, 1), cell(Number.POSITIVE_INFINITY, 0)])).toEqual([]);
  });
});

describe('a drag over cells', () => {
  it('gathers the cells it passes and says when it reached another', () => {
    const stroke = new CellStroke();
    expect(stroke.active).toBe(false);
    stroke.begin(TENS, { x: 5, y: 5 });
    expect(stroke.active).toBe(true);
    expect(stroke.shapes()).toHaveLength(1);
    expect(stroke.extend({ x: 8, y: 2 })).toBe(false);
    // The same shapes while no cell came.
    const before = stroke.shapes();
    expect(stroke.shapes()).toBe(before);
    expect(stroke.extend({ x: 28, y: 2 })).toBe(true);
    // Back over cells already passed: nothing new.
    expect(stroke.extend({ x: 5, y: 5 })).toBe(false);
    expect(stroke.extend({ x: Number.NaN, y: 5 })).toBe(false);
    const shapes = stroke.finish();
    expect(shapes.map((shape) => shape.points)).toEqual([[{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 10 }, { x: 0, y: 10 }]]);
    expect(stroke.active).toBe(false);
    expect(stroke.shapes()).toEqual([]);
    expect(stroke.extend({ x: 50, y: 50 })).toBe(false);
  });

  it('begins none on a grid without cells, and leaves nothing when it is dropped', () => {
    const stroke = new CellStroke();
    stroke.begin({ size: 0 }, { x: 5, y: 5 });
    expect(stroke.active).toBe(false);
    stroke.begin(TENS, { x: 5, y: 5 });
    stroke.cancel();
    expect(stroke.active).toBe(false);
    expect(stroke.finish()).toEqual([]);
  });
});
