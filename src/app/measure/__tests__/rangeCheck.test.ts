import { describe, expect, it } from 'vitest';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import { rangeCheckLine, rangeCheckPair, rangeCheckText } from '../rangeCheck';
import type { PlacedToken, TokenGrid } from '../tokenDistance';

const GRID: TokenGrid = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const FEET: MeasurementSettings = { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule: 'alternating', rangeBands: [], coneAngle: 90 };

/** A token of `cells` × `cells` whose footprint starts at the cell (col, row), `feetUp` feet off the floor. */
function token(col: number, row: number, cells = 1, feetUp = 0): PlacedToken {
  return { x: (col + cells / 2) * 70, y: (row + cells / 2) * 70, size: (cells + 1) / 2, ...(feetUp !== 0 && { elevation: feetUp }) };
}

describe('rangeCheckPair', () => {
  const tokens = { hero: token(0, 0), goblin: token(4, 0), ogre: token(6, 2, 2) };

  it('runs from the one selected token to the hovered one', () => {
    expect(rangeCheckPair(['hero'], 'goblin', tokens)).toEqual({ from: tokens.hero, to: tokens.goblin });
    expect(rangeCheckPair(['ogre'], 'hero', tokens)).toEqual({ from: tokens.ogre, to: tokens.hero });
  });

  it('is none without a hover, over the selected token itself, or with more or fewer than one selected', () => {
    expect(rangeCheckPair(['hero'], null, tokens)).toBeNull();
    expect(rangeCheckPair(['hero'], 'hero', tokens)).toBeNull();
    expect(rangeCheckPair([], 'goblin', tokens)).toBeNull();
    expect(rangeCheckPair(['hero', 'ogre'], 'goblin', tokens)).toBeNull();
  });

  it('is none where the selection or the hover is no token of the level shown', () => {
    expect(rangeCheckPair(['pin-1'], 'goblin', tokens)).toBeNull();
    expect(rangeCheckPair(['hero'], 'gone', tokens)).toBeNull();
  });
});

describe('rangeCheckLine', () => {
  it('runs along the line between the centres, from one token\'s edge to the other\'s', () => {
    expect(rangeCheckLine(token(0, 0), token(4, 0), GRID)).toEqual({ from: { x: 70, y: 35 }, to: { x: 280, y: 35 } });
    // Large tokens are left at their own edges: 2×2 on the cells 2..3 and 6..7.
    expect(rangeCheckLine(token(2, 6, 2), token(6, 6, 2), GRID)).toEqual({ from: { x: 280, y: 490 }, to: { x: 420, y: 490 } });
  });

  it('has no line between tokens whose spaces touch or overlap', () => {
    expect(rangeCheckLine(token(0, 0), token(1, 0), GRID)).toBeNull();
    expect(rangeCheckLine(token(0, 0), token(0, 0), GRID)).toBeNull();
    expect(rangeCheckLine(token(2, 2, 3), token(3, 3), GRID)).toBeNull();
    expect(rangeCheckLine({ x: Number.NaN, y: 0, size: 1 }, token(3, 3), GRID)).toBeNull();
  });

  it('leaves each end on its token\'s edge, whatever the direction', () => {
    const from = token(1, 1);
    const to = token(5, 4, 2);
    const line = rangeCheckLine(from, to, GRID)!;
    expect(Math.hypot(line.from.x - from.x, line.from.y - from.y)).toBeCloseTo(35, 9);
    expect(Math.hypot(line.to.x - to.x, line.to.y - to.y)).toBeCloseTo(70, 9);
    // Both ends lie on the line between the centres.
    const cross = (point: { x: number; y: number }): number => (point.x - from.x) * (to.y - from.y) - (point.y - from.y) * (to.x - from.x);
    expect(cross(line.from)).toBeCloseTo(0, 6);
    expect(cross(line.to)).toBeCloseTo(0, 6);
  });
});

describe('rangeCheckText', () => {
  it('reads the distance between the two spaces by the map\'s rule, in its unit', () => {
    expect(rangeCheckText(token(0, 0), token(1, 0), GRID, FEET)).toBe('5ft');
    expect(rangeCheckText(token(0, 0), token(3, 2), GRID, FEET)).toBe('20ft');
    expect(rangeCheckText(token(0, 0), token(3, 2), GRID, { ...FEET, diagonalRule: 'equidistant' })).toBe('15ft');
    // From a large token's edge.
    expect(rangeCheckText(token(4, 4, 3), token(9, 5), GRID, FEET)).toBe('15ft');
  });

  it('counts the height between the two', () => {
    expect(rangeCheckText(token(0, 0), token(4, 0, 1, 20), GRID, FEET)).toBe('30ft');
  });

  it('reads a band\'s name where the map measures in bands', () => {
    const bands: MeasurementSettings = { ...FEET, mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 2 }, { name: 'Far', maxSquares: 6 }, { name: 'Very Far', maxSquares: 7 }] };
    expect(rangeCheckText(token(0, 0), token(2, 0), GRID, bands)).toBe('Close');
    expect(rangeCheckText(token(0, 0), token(5, 0), GRID, bands)).toBe('Far');
    expect(rangeCheckText(token(0, 0), token(12, 0), GRID, bands)).toBe('Very Far');
  });
});
