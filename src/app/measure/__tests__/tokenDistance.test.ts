import { describe, expect, it } from 'vitest';
import { cellsByRule, type GridGeometry } from '../../grid/gridDistance';
import { axialToPixel, createHexLayout, type AxialCoord } from '../../grid/hexGeometry';
import type { MeasurementSettings } from '../../grid/measurementFormat';
import type { DiagonalRule } from '../../types/collectionSettingsTypes';
import type { SceneLevel } from '../../types/sceneLevelTypes';
import { distanceBetweenTokens, tokenStandingAt, type PlacedToken, type TokenGrid } from '../tokenDistance';
import { POINTY, seeded } from './areaTestKit';

const GRID: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
const FREE: TokenGrid = { ...GRID, snapToGrid: false };
const RULES: readonly DiagonalRule[] = ['equidistant', 'alternating', 'manhattan', 'euclidean'];
const feet = (diagonalRule: DiagonalRule = 'equidistant'): MeasurementSettings => (
  { mode: 'metric', unitType: 'feet', unitDistance: 5, ruleDistance: 5, diagonalRule, rangeBands: [], coneAngle: 90 }
);

/** A token of `cells` × `cells` whose footprint starts at the cell (col, row), `feetUp` feet off the floor. */
function token(col: number, row: number, cells = 1, feetUp = 0): PlacedToken {
  return { x: (col + cells / 2) * 70, y: (row + cells / 2) * 70, size: (cells + 1) / 2, ...(feetUp !== 0 && { elevation: feetUp }) };
}

const byEveryRule = (a: PlacedToken, b: PlacedToken, grid: TokenGrid = GRID): number[] => RULES.map((rule) => distanceBetweenTokens(a, b, grid, feet(rule)));

describe('distanceBetweenTokens on a square grid', () => {
  it('counts tokens side by side one cell apart, and tokens that share a cell none', () => {
    expect(byEveryRule(token(3, 3), token(4, 3))).toEqual([1, 1, 1, 1]);
    expect(byEveryRule(token(3, 3), token(3, 2))).toEqual([1, 1, 1, 1]);
    expect(byEveryRule(token(3, 3), token(3, 3))).toEqual([0, 0, 0, 0]);
    // A small token under a large one, and two large ones that overlap by a cell.
    expect(byEveryRule(token(2, 2, 3), token(4, 3))).toEqual([0, 0, 0, 0]);
    expect(byEveryRule(token(2, 2, 2), token(3, 3, 2))).toEqual([0, 0, 0, 0]);
  });

  it('prices the way by the diagonal rule', () => {
    expect(byEveryRule(token(0, 0), token(1, 1))).toEqual([1, 1, 2, Math.hypot(1, 1)]);
    expect(byEveryRule(token(0, 0), token(3, 2))).toEqual([3, 4, 5, Math.hypot(3, 2)]);
    expect(byEveryRule(token(3, 2), token(0, 0))).toEqual([3, 4, 5, Math.hypot(3, 2)]);
  });

  it('measures large tokens edge to edge', () => {
    // 2×2 on the cells 1..2, a token four cells right of its left column: two cells from its edge.
    expect(byEveryRule(token(1, 1, 2), token(4, 1))).toEqual([2, 2, 2, 2]);
    // 3×3 on the cells 4..6: three cells to a token at column 9, where their centres are four apart.
    expect(byEveryRule(token(4, 4, 3), token(9, 5))).toEqual([3, 3, 3, 3]);
    // A 2×2 and a 4×4 side by side, and two cells apart on both axes.
    expect(byEveryRule(token(0, 0, 2), token(2, 0, 4))).toEqual([1, 1, 1, 1]);
    expect(byEveryRule(token(0, 0, 2), token(3, 3, 4))).toEqual([2, 3, 4, Math.hypot(2, 2)]);
    // Diagonally off a 3×3's corner.
    expect(byEveryRule(token(4, 4, 3), token(8, 9))).toEqual([3, 4, 5, Math.hypot(2, 3)]);
  });

  it('counts the difference in height as a third axis under the same rule', () => {
    // Four cells across, 20 ft (four cells) up.
    expect(byEveryRule(token(0, 0), token(4, 0, 1, 20))).toEqual([4, 6, 8, Math.hypot(4, 4)]);
    expect(byEveryRule(token(0, 0, 1, 20), token(4, 0))).toEqual([4, 6, 8, Math.hypot(4, 4)]);
    // 10 ft up.
    expect(byEveryRule(token(0, 0), token(4, 0, 1, 10))).toEqual([4, 5, 6, Math.hypot(4, 2)]);
    // Straight above: the height alone, and from a large token's edge too.
    expect(byEveryRule(token(3, 3), token(3, 3, 1, 30))).toEqual([6, 6, 6, 6]);
    expect(byEveryRule(token(2, 2, 3), token(4, 4, 1, 30))).toEqual([6, 6, 6, 6]);
    // Both as high: nothing to count. One below the floor, one above it: both count.
    expect(byEveryRule(token(0, 0, 1, 30), token(4, 0, 1, 30))).toEqual([4, 4, 4, 4]);
    expect(byEveryRule(token(0, 0, 1, -10), token(4, 0, 1, 10))).toEqual([4, 6, 8, Math.hypot(4, 4)]);
    // A large flier, measured from its edge.
    expect(byEveryRule(token(4, 4, 3, 15), token(9, 5))).toEqual([3, 4, 6, Math.hypot(3, 3)]);
  });

  it('agrees with every pair of cells counted one by one, for tokens of every size at every height', () => {
    const random = seeded(4711);
    const whole = (limit: number): number => Math.floor(random() * limit);
    for (let trial = 0; trial < 200; trial++) {
      const a = { col: whole(12), row: whole(12), cells: 1 + whole(4), up: whole(7) };
      const b = { col: whole(12), row: whole(12), cells: 1 + whole(4), up: whole(7) };
      for (const rule of RULES) {
        let least = Infinity;
        for (let ax = 0; ax < a.cells; ax++) for (let ay = 0; ay < a.cells; ay++) for (let bx = 0; bx < b.cells; bx++) for (let by = 0; by < b.cells; by++) {
          const dx = Math.abs(a.col + ax - b.col - bx);
          const dy = Math.abs(a.row + ay - b.row - by);
          least = Math.min(least, cellsByRule({ straight: Math.abs(dx - dy), diagonal: Math.min(dx, dy), euclidean: Math.hypot(dx, dy) }, rule, a.up - b.up));
        }
        const measured = distanceBetweenTokens(token(a.col, a.row, a.cells, a.up * 5), token(b.col, b.row, b.cells, b.up * 5), GRID, feet(rule));
        expect(measured, `${rule} ${JSON.stringify([a, b])}`).toBeCloseTo(least, 9);
      }
    }
  });

  it('counts a token placed off the cells for the cell its centre is in', () => {
    const loose: PlacedToken = { x: 4 * 70 + 3, y: 2 * 70 + 61, size: 1 };
    expect(distanceBetweenTokens(token(0, 2), loose, GRID, feet())).toBe(4);
  });

  it('counts the height where the map measures in range bands too', () => {
    const bands: MeasurementSettings = { ...feet('alternating'), mode: 'abstract', rangeBands: [{ name: 'Close', maxSquares: 2 }] };
    // Four squares along and four up, diagonals alternating: 4 + floor(4 / 2).
    expect(distanceBetweenTokens(token(0, 0), token(4, 0, 1, 20), GRID, bands)).toBe(6);
    expect(distanceBetweenTokens(token(0, 0), token(4, 0, 1, 20), GRID, { ...bands, unitDistance: 0 })).toBe(4);
  });
});

describe('distanceBetweenTokens on a hex grid', () => {
  const layout = createHexLayout('hex-vertical', POINTY.size, POINTY.offsetX ?? 0, POINTY.offsetY ?? 0);
  const on = (hex: AxialCoord, size = 1, feetUp = 0): PlacedToken => ({ ...axialToPixel(layout, hex), size, ...(feetUp !== 0 && { elevation: feetUp }) });
  const byRule = (a: PlacedToken, b: PlacedToken): number[] => RULES.map((rule) => distanceBetweenTokens(a, b, POINTY, feet(rule)));

  it('counts the steps between the nearest hexes, whatever the diagonal rule', () => {
    expect(byRule(on({ q: 0, r: 0 }), on({ q: 1, r: 0 }))).toEqual([1, 1, 1, 1]);
    expect(byRule(on({ q: 0, r: 0 }), on({ q: 2, r: 1 }))).toEqual([3, 3, 3, 3]);
    expect(byRule(on({ q: 2, r: -1 }), on({ q: 2, r: -1 }))).toEqual([0, 0, 0, 0]);
    // Seven hexes around (0, 0): its edge is one step nearer.
    expect(byRule(on({ q: 0, r: 0 }, 2), on({ q: 4, r: 0 }))).toEqual([3, 3, 3, 3]);
    expect(byRule(on({ q: 0, r: 0 }, 2), on({ q: 1, r: 0 }))).toEqual([0, 0, 0, 0]);
  });

  it('prices a step that climbs by the diagonal rule', () => {
    // Three hexes away, 10 ft (two cells) up.
    expect(byRule(on({ q: 0, r: 0 }), on({ q: 3, r: 0 }, 1, 10))).toEqual([3, 4, 5, Math.hypot(3, 2)]);
    // Higher than far.
    expect(byRule(on({ q: 0, r: 0 }), on({ q: 1, r: 0 }, 1, 20))).toEqual([4, 4, 5, Math.hypot(1, 4)]);
  });
});

describe('distanceBetweenTokens where tokens stand anywhere', () => {
  const at = (x: number, y: number, size = 1, feetUp = 0): PlacedToken => ({ x, y, size, ...(feetUp !== 0 && { elevation: feetUp }) });

  it('is the straight line from edge to edge, whatever the diagonal rule', () => {
    // Centres three cells apart on both axes: the line between them less half a cell at each end.
    const far = byEveryRule(at(100, 100), at(310, 310), FREE);
    for (const distance of far) expect(distance).toBeCloseTo(Math.hypot(3, 3) - 1, 9);
    expect(byEveryRule(at(100, 100), at(170, 100), FREE)).toEqual([0, 0, 0, 0]);
    expect(byEveryRule(at(100, 100), at(120, 110), FREE)).toEqual([0, 0, 0, 0]);
    // A 3×3 reaches a cell and a half from its centre.
    expect(distanceBetweenTokens(at(0, 0, 2), at(350, 0), FREE, feet('manhattan'))).toBe(3);
  });

  it('takes the height into the straight line', () => {
    // A gap of four cells, 15 ft (three cells) up.
    expect(distanceBetweenTokens(at(0, 0), at(350, 0, 1, 15), FREE, feet('alternating'))).toBe(5);
    expect(distanceBetweenTokens(at(0, 0), at(20, 0, 1, 15), FREE, feet())).toBe(3);
  });
});

describe('distanceBetweenTokens across levels', () => {
  const levels: SceneLevel[] = [
    { id: 'ground', elevation: { bottom: 0, top: 10 }, background: null },
    { id: 'upper', elevation: { bottom: 10, top: 20 }, background: null },
  ];
  const below = token(0, 0);
  const above: PlacedToken = { ...token(4, 0), level: 'upper' };

  it('adds the floors\' heights only for a caller that shows the levels together', () => {
    expect(distanceBetweenTokens(below, above, GRID, feet('manhattan'))).toBe(4);
    expect(distanceBetweenTokens(below, above, GRID, feet('manhattan'), levels)).toBe(6);
    expect(distanceBetweenTokens(below, { ...above, elevation: 5 }, GRID, feet('manhattan'), levels)).toBe(7);
    // On one level the floor cancels out; a level the scene does not have is its first.
    expect(distanceBetweenTokens(above, { ...token(0, 0), level: 'upper' }, GRID, feet('manhattan'), levels)).toBe(4);
    expect(distanceBetweenTokens(below, { ...above, level: 'gone' }, GRID, feet('manhattan'), levels)).toBe(4);
  });
});

describe('tokenStandingAt', () => {
  const named = (id: string, placed: PlacedToken, layer?: number): PlacedToken & { id: string } => ({ id, ...placed, ...(layer !== undefined && { layer }) });
  const idAt = (x: number, y: number, tokens: (PlacedToken & { id: string })[], grid: TokenGrid = GRID): string | null => tokenStandingAt({ x, y }, tokens, grid)?.id ?? null;

  it('finds a token at every point of the cells it stands on, and none beside them', () => {
    const tokens = [named('goblin', token(3, 3)), named('dragon', token(6, 2, 3))];
    expect(idAt(245, 245, tokens)).toBe('goblin');
    expect(idAt(211, 279, tokens)).toBe('goblin');
    expect(idAt(281, 245, tokens)).toBeNull();
    // The corner cell of a 3×3, which its round art does not reach.
    expect(idAt(6 * 70 + 35, 2 * 70 + 35, tokens)).toBe('dragon');
    expect(idAt(8 * 70 + 69, 4 * 70 + 69, tokens)).toBe('dragon');
    expect(idAt(9 * 70 + 1, 4 * 70 + 35, tokens)).toBeNull();
    expect(idAt(245, 245, [])).toBeNull();
  });

  it('picks the token lying on top, the later of equals', () => {
    const pile = [named('first', token(3, 3)), named('raised', token(3, 3), 2), named('second', token(3, 3))];
    expect(idAt(245, 245, pile)).toBe('raised');
    expect(idAt(245, 245, [pile[0]!, pile[2]!])).toBe('second');
    expect(idAt(245, 245, [named('large', token(2, 2, 3), 1), named('small', token(3, 3))])).toBe('large');
  });

  it('finds a token on a hex grid by the hexes it stands on', () => {
    const layout = createHexLayout('hex-vertical', POINTY.size, POINTY.offsetX ?? 0, POINTY.offsetY ?? 0);
    const centre = axialToPixel(layout, { q: 2, r: 1 });
    const next = axialToPixel(layout, { q: 3, r: 1 });
    expect(idAt(centre.x + 20, centre.y - 10, [named('one', { ...centre, size: 1 })], POINTY)).toBe('one');
    expect(idAt(next.x, next.y, [named('one', { ...centre, size: 1 })], POINTY)).toBeNull();
    expect(idAt(next.x, next.y, [named('seven', { ...centre, size: 2 })], POINTY)).toBe('seven');
  });

  it('finds a token that stands anywhere within the circle of its space, and passes over one at no place', () => {
    const tokens = [named('loose', { x: 100, y: 100, size: 1 }), named('nowhere', { x: NaN, y: 100, size: 1 })];
    expect(idAt(130, 100, tokens, FREE)).toBe('loose');
    expect(idAt(130, 130, tokens, FREE)).toBeNull();
    expect(idAt(100, 100, [tokens[1]!], GRID)).toBeNull();
  });
});
