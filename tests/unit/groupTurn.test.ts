import { describe, expect, it } from 'vitest';
import { snapTokenCenter } from '../../src/app/grid/gridPlacement';
import { createHexLayout, nearestHexCenter } from '../../src/app/grid/hexGeometry';
import {
  formationMiddle, gridPivot, orbit, pointerTurn, snapTurn, turnLabel, turnPoints, turnTokens, turnedFacing, type Point, type TokenAtStart,
} from '../../src/app/pixi/selection/groupTurn';

const CELL = 70;
/** The middle of the square cell holding the point, on a grid whose lines run through 0. */
const squareCell = (point: Point): Point => ({ x: (Math.floor(point.x / CELL) + 0.5) * CELL, y: (Math.floor(point.y / CELL) + 0.5) * CELL });
const snapOnSquares = (point: Point, size: number): Point => snapTokenCenter(point, size, 'square', CELL, squareCell);

describe('pointerTurn', () => {
  const centre = { x: 100, y: 100 };

  it('reads a quarter turn clockwise on screen as +90°, as a token turns', () => {
    expect(pointerTurn(centre, { x: 100, y: 0 }, { x: 200, y: 100 })).toBeCloseTo(90);
    expect(pointerTurn(centre, { x: 100, y: 0 }, { x: 0, y: 100 })).toBeCloseTo(-90);
  });

  it('stays within a half turn either way across the seam behind the centre', () => {
    expect(pointerTurn(centre, { x: 0, y: 99 }, { x: 0, y: 101 })).toBeCloseTo(-1.15, 1);
    expect(pointerTurn(centre, { x: 0, y: 101 }, { x: 0, y: 99 })).toBeCloseTo(1.15, 1);
  });
});

describe('snapTurn', () => {
  it('snaps to 15°, or 45° with Shift, as a single token turns', () => {
    expect(snapTurn(37, false)).toBe(30);
    expect(snapTurn(38, false)).toBe(45);
    expect(snapTurn(37, true)).toBe(45);
    expect(snapTurn(-67, true)).toBe(-45);
  });

  it('gives no negative zero and turns a half turn one way', () => {
    expect(Object.is(snapTurn(-3, false), 0)).toBe(true);
    expect(snapTurn(-179, false)).toBe(180);
  });
});

describe('turning a group', () => {
  const centre = { x: 0, y: 0 };

  it('orbits a place about the centre, landing on whole pixels after a quarter turn', () => {
    expect(orbit({ x: 70, y: 0 }, centre, 90)).toEqual({ x: 0, y: 70 });
    expect(orbit({ x: 70, y: 0 }, { x: 35, y: 35 }, 180)).toEqual({ x: 0, y: 70 });
  });

  it('turns every facing by the same angle, kept within one turn', () => {
    expect(turnedFacing(undefined, 45)).toBe(45);
    expect(turnedFacing(330, 45)).toBe(15);
    expect(turnedFacing(10, -30)).toBe(340);
  });

  it('moves each token round the centre and faces it as much further round', () => {
    const tokens: TokenAtStart[] = [
      { id: 'a', x: -70, y: 0, rotation: 0 },
      { id: 'b', x: 70, y: 0, rotation: 90 },
    ];
    expect(turnTokens(tokens, centre, 90)).toEqual([
      { id: 'a', x: 0, y: -70, rotation: 90 },
      { id: 'b', x: 0, y: 70, rotation: 180 },
    ]);
  });

  it('turns the points of a drawing with the group', () => {
    expect(turnPoints([{ x: 10, y: 0 }, { x: 0, y: 10 }], centre, -90)).toEqual([{ x: 0, y: -10 }, { x: 10, y: 0 }]);
  });

  it('turning back by the same angle puts every token where it was', () => {
    const tokens: TokenAtStart[] = [{ id: 'a', x: 123, y: -45, rotation: 15 }];
    const [there] = turnTokens(tokens, { x: 7, y: 9 }, 135);
    const [back] = turnTokens([there!], { x: 7, y: 9 }, -135);
    expect(back!.x).toBeCloseTo(123, 9);
    expect(back!.y).toBeCloseTo(-45, 9);
    expect(back!.rotation).toBe(15);
  });

  it('labels the angle in whole degrees with a true minus sign', () => {
    expect(turnLabel(45)).toBe('45°');
    expect(turnLabel(-15)).toBe('−15°');
  });
});

/** A token standing on a square cell: odd footprints on a cell's middle, even ones on a corner. */
const onSquares = (point: Point, size: number): boolean => {
  const snapped = snapOnSquares(point, size);
  return Math.abs(snapped.x - point.x) < 1e-9 && Math.abs(snapped.y - point.y) < 1e-9;
};

/** The box a token of `size` covers about its centre, as the turn reads its footprint. */
const footprint = (point: Point, size: number) => {
  const across = CELL * (2 * size - 1);
  return { x: point.x - across / 2, y: point.y - across / 2, width: across, height: across };
};

describe('the pivot', () => {
  it('lies in the middle of what is turned', () => {
    expect(formationMiddle([footprint({ x: 35, y: 35 }, 1), footprint({ x: 245, y: 35 }, 1)])).toEqual({ x: 140, y: 35 });
    expect(formationMiddle([])).toBeNull();
  });

  it('is the nearer of the closest cell middle and cell corner on a square grid, the closest hex centre on hexes', () => {
    expect(gridPivot({ x: 100, y: 40 }, false, snapOnSquares)).toEqual({ x: 105, y: 35 });
    expect(gridPivot({ x: 136, y: 66 }, false, snapOnSquares)).toEqual({ x: 140, y: 70 });
    const layout = createHexLayout('hex-vertical', CELL, 0, 0);
    const pivot = gridPivot({ x: 136, y: 66 }, true, (point) => nearestHexCenter(layout, point));
    expect(pivot).toEqual(nearestHexCenter(layout, { x: 136, y: 66 }));
  });

  // Formations of every footprint, standing on cells, in rows and columns of both parities
  const formations: Array<Array<{ at: Point; size: number }>> = [
    [{ at: { x: 35, y: 35 }, size: 1 }, { at: { x: 175, y: 35 }, size: 1 }],
    [{ at: { x: 35, y: 35 }, size: 1 }, { at: { x: 105, y: 35 }, size: 1 }],
    [{ at: { x: 35, y: 35 }, size: 1 }, { at: { x: 140, y: 140 }, size: 1.5 }, { at: { x: 315, y: 35 }, size: 2 }],
    [{ at: { x: 140, y: 70 }, size: 1.5 }, { at: { x: 105, y: 245 }, size: 1 }, { at: { x: 385, y: 175 }, size: 1 }],
  ];

  it.each([90, 180, -90])('lands a formation standing on square cells on cells after %i°', (degrees) => {
    for (const formation of formations) {
      const pivot = gridPivot(formationMiddle(formation.map(({ at, size }) => footprint(at, size)))!, false, snapOnSquares);
      for (const { at, size } of formation) expect(onSquares(orbit(at, pivot, degrees), size)).toBe(true);
    }
  });

  it.each([60, 120, 180, -60])('lands hex centres on hex centres after %i°', (degrees) => {
    for (const type of ['hex-vertical', 'hex-horizontal'] as const) {
      const layout = createHexLayout(type, CELL, 12, 7);
      const tokens = [{ x: 40, y: 50 }, { x: 160, y: 90 }, { x: 260, y: 300 }].map((point) => nearestHexCenter(layout, point));
      const pivot = gridPivot({ x: 150, y: 140 }, true, (point) => nearestHexCenter(layout, point));
      for (const token of tokens) {
        const turned = orbit(token, pivot, degrees);
        const centre = nearestHexCenter(layout, turned);
        expect(turned.x).toBeCloseTo(centre.x, 6);
        expect(turned.y).toBeCloseTo(centre.y, 6);
      }
    }
  });

  it('keeps every distance in a formation, so tokens that did not overlap never come to', () => {
    const tokens: TokenAtStart[] = [{ id: 'a', x: 35, y: 35, rotation: 0 }, { id: 'b', x: 105, y: 35, rotation: 0 }, { id: 'c', x: 70, y: 140, rotation: 0 }];
    const gaps = (placed: readonly Point[]): number[] => placed.flatMap((p, i) => placed.slice(i + 1).map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
    for (const degrees of [15, 45, 90, 135]) {
      const turned = turnTokens(tokens, { x: 70, y: 70 }, degrees);
      gaps(turned).forEach((gap, index) => expect(gap).toBeCloseTo(gaps(tokens)[index]!, 9));
    }
  });
});
