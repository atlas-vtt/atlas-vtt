import { describe, expect, it } from 'vitest';
import { cellsByRule, flatCells } from '../../grid/gridDistance';
import type { DiagonalRule } from '../../types/collectionSettingsTypes';
import type { AreaMap } from '../areaOnMap';
import {
  AuraOnMapMemo,
  auraCells,
  auraCellsDragged,
  auraCellsOfCircle,
  auraDirection,
  auraOfCells,
  auraPoints,
  keptAudience,
  placeAura,
  steppedAura,
  type AuraRules,
  type AuraToken,
} from '../auraArea';
import { cellsStoodOn, placementGridOf } from '../measureTokens';
import type { KeptAura, KeptMeasure } from '../measureTypes';
import type { TokenGrid } from '../tokenDistance';

const SIZE = 70;
const SQUARES: TokenGrid = { type: 'square', size: SIZE, offsetX: 0, offsetY: 0 };
const HEXES: TokenGrid = { type: 'hex-vertical', size: SIZE, offsetX: 0, offsetY: 0 };
const FREE: TokenGrid = { ...SQUARES, snapToGrid: false };
const RULES: readonly DiagonalRule[] = ['equidistant', 'alternating', 'manhattan', 'euclidean'];
const rules = (diagonalRule: DiagonalRule, unitDistance = 5): AuraRules => ({ unitDistance, diagonalRule });
const centre = (column: number, row: number): { x: number; y: number } => ({ x: column * SIZE + SIZE / 2, y: row * SIZE + SIZE / 2 });
const aura = (reach: number, more: Partial<KeptAura> = {}): KeptAura => ({ id: 'a', kind: 'measure', shape: 'circle', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }], follows: 'hero', aura: reach, ...more });
const mapOf = (grid: TokenGrid, diagonalRule: DiagonalRule, walls: AreaMap['walls'] = []): AreaMap =>
  ({ grid, cells: grid.snapToGrid !== false, coneAngle: 90, coneEnd: 'round', cellRule: 'half', diagonalRule, walls });

/** Every cell of a block around the token that lies within `reach` cells of one the token stands on, counted cell by cell. */
function cellsByHand(token: AuraToken, reach: number, rule: DiagonalRule): string[] {
  const stood = cellsStoodOn(token, token.size || 1, placementGridOf(SQUARES));
  const within: string[] = [];
  for (let row = -12; row <= 20; row++) {
    for (let column = -12; column <= 20; column++) {
      const at = centre(column, row);
      if (stood.some((from) => cellsByRule(flatCells(SQUARES, [from, at]), rule) <= reach)) within.push(`${column},${row}`);
    }
  }
  return within.sort();
}

describe('how far an aura reaches', () => {
  it('is kept in game units from the edge of its token\'s space, and counted in the map\'s cells', () => {
    expect(auraCells(10, 5)).toBe(2);
    expect(auraCells(4.5, 1.5)).toBe(3);
    expect(auraOfCells(3, 1.5)).toBe(4.5);
    expect(auraOfCells(0, 5)).toBe(0);
    // A map that says no distance per cell counts the reach as cells.
    expect(auraCells(2, 0)).toBe(2);
  });

  it('steps by one cell\'s distance, never below none, and without the dust of repeated halves', () => {
    expect(steppedAura(0, 1, 5)).toBe(5);
    expect(steppedAura(5, -1, 5)).toBe(0);
    expect(steppedAura(5, -3, 5)).toBe(0);
    expect(steppedAura(steppedAura(steppedAura(0, 1, 1.5), 1, 1.5), 1, 1.5)).toBe(4.5);
  });

  it('holds two points for readers that know no auras: its token\'s centre, and the point that far past the token\'s space', () => {
    expect(auraPoints({ ...centre(3, 3), size: 1 }, 2, SQUARES)).toEqual([centre(3, 3), { x: centre(3, 3).x + 35 + 140, y: centre(3, 3).y }]);
    // A large token's space is wider: the point lies farther out, the reach is the same.
    const large = { x: 280, y: 280, size: 1.5 };
    expect(auraPoints(large, 2, SQUARES, { x: 0, y: 1 })).toEqual([{ x: 280, y: 280 }, { x: 280, y: 280 + 70 + 140 }]);
    expect(auraDirection({ points: [{ x: 280, y: 280 }, { x: 280, y: 490 }] })).toEqual({ x: 0, y: 1 });
    expect(auraDirection({ points: [{ x: 5, y: 5 }, { x: 5, y: 5 }] })).toEqual({ x: 1, y: 0 });
  });
});

describe('an aura around its token', () => {
  it.each(RULES)('covers the cells its token stands on, grown by its reach under %s diagonals', (rule) => {
    for (const token of [{ ...centre(4, 4), size: 1 }, { x: 5 * SIZE, y: 4 * SIZE, size: 1.5 }, { ...centre(4, 4), size: 2 }]) {
      for (const reach of [1, 2, 3]) {
        const placed = placeAura(aura(reach * 5), token, SQUARES, rules(rule))!;
        const covered = new AuraOnMapMemo().get(placed, mapOf(SQUARES, rule)).cells!.map(({ key }) => key).sort();
        expect(covered).toEqual(cellsByHand(token, reach, rule));
      }
    }
  });

  it('is the square the rules mean where a diagonal step costs one, and holds a point by the cell it lies in', () => {
    const placed = placeAura(aura(10), { ...centre(4, 4), size: 1 }, SQUARES, rules('equidistant'))!;
    expect(placed.shaped.bounds).toEqual({ minX: 2 * SIZE, minY: 2 * SIZE, maxX: 7 * SIZE, maxY: 7 * SIZE });
    expect(placed.shaped.contains({ x: 2 * SIZE + 1, y: 2 * SIZE + 1 })).toBe(true);
    expect(placed.shaped.contains({ x: 2 * SIZE - 1, y: 4 * SIZE })).toBe(false);
    // Its far handle stands on its outline to the token's right, its label above its top edge, its badge on the token's rim.
    expect(placed.end).toEqual({ x: 7 * SIZE, y: centre(4, 4).y });
    expect(placed.top).toEqual({ x: centre(4, 4).x, y: 2 * SIZE });
    expect(Math.hypot(placed.handle.x - centre(4, 4).x, placed.handle.y - centre(4, 4).y)).toBeCloseTo(SIZE / 2, 9);
  });

  it('reaches as far from a token that grew: the cells grow with the token\'s space', () => {
    const small = placeAura(aura(5), { ...centre(4, 4), size: 1 }, SQUARES, rules('equidistant'))!;
    const large = placeAura(aura(5), { ...centre(4, 4), size: 2 }, SQUARES, rules('equidistant'), small)!;
    expect(small.shaped.bounds).toEqual({ minX: 3 * SIZE, minY: 3 * SIZE, maxX: 6 * SIZE, maxY: 6 * SIZE });
    // A token of three cells a side with one more cell all around.
    expect(large.shaped.bounds).toEqual({ minX: 2 * SIZE, minY: 2 * SIZE, maxX: 7 * SIZE, maxY: 7 * SIZE });
    expect(large.cells).toBe(1);
  });

  it('is a ring of hexes on a hex grid, and a true circle from the token\'s edge where tokens stand anywhere', () => {
    const hexes = placeAura(aura(10), { x: 105, y: 80, size: 1 }, HEXES, rules('equidistant'))!;
    // One hex and two rings around it.
    expect(new AuraOnMapMemo().get(hexes, mapOf(HEXES, 'equidistant')).cells).toHaveLength(19);
    const free = placeAura(aura(10), { x: 333, y: 222, size: 1 }, FREE, rules('equidistant'))!;
    expect(free.shaped.origin).toEqual({ x: 333, y: 222 });
    expect(free.shaped.reach).toBe(35 + 140);
    expect(new AuraOnMapMemo().get(free, mapOf(FREE, 'equidistant')).cells).toBeNull();
  });

  it('is worked out once while its token stands on the same cells, and is the same object while nothing changed', () => {
    const measure = aura(10);
    const first = placeAura(measure, { ...centre(4, 4), size: 1 }, SQUARES, rules('equidistant'))!;
    expect(placeAura(measure, { ...centre(4, 4), size: 1 }, SQUARES, rules('equidistant'), first)).toBe(first);
    // Dragged within its cell: the badge follows, the shape stays.
    const nudged = placeAura(measure, { x: centre(4, 4).x + 20, y: centre(4, 4).y - 10, size: 1 }, SQUARES, rules('equidistant'), first)!;
    expect(nudged).not.toBe(first);
    expect(nudged.shaped).toBe(first.shaped);
    expect(nudged.handle.x - first.handle.x).toBeCloseTo(20, 9);
    const memo = new AuraOnMapMemo();
    const map = mapOf(SQUARES, 'equidistant');
    expect(memo.get(nudged, { ...map })).toBe(memo.get(first, map));
    // Into the next cell: another shape, one cell on.
    const moved = placeAura(measure, { ...centre(5, 4), size: 1 }, SQUARES, rules('equidistant'), nudged)!;
    expect(moved.shaped).not.toBe(first.shaped);
    expect(moved.shaped.bounds.minX).toBe(first.shaped.bounds.minX + SIZE);
    // Another rule, another distance per cell or another reach is another shape too.
    expect(placeAura(measure, { ...centre(4, 4), size: 1 }, SQUARES, rules('manhattan'), first)!.shaped).not.toBe(first.shaped);
    expect(placeAura(measure, { ...centre(4, 4), size: 1 }, SQUARES, rules('equidistant', 10), first)!.cells).toBe(1);
  });

  it('has no place around a token that stands nowhere', () => {
    expect(placeAura(aura(10), { x: Number.NaN, y: 0 }, SQUARES, rules('equidistant'))).toBeNull();
    expect(placeAura(aura(10), centre(1, 1), { ...SQUARES, size: 0 }, rules('equidistant'))).toBeNull();
  });

  it('stops at a wall, seen from its token: the cells behind it are not its own', () => {
    const wall = { id: 'w', kind: 'wall' as const, type: 'solid' as const, p1: { x: 6 * SIZE, y: -2000 }, p2: { x: 6 * SIZE, y: 4000 } };
    const placed = placeAura(aura(15), { ...centre(4, 4), size: 1 }, SQUARES, rules('equidistant'))!;
    const open = new AuraOnMapMemo().get(placed, mapOf(SQUARES, 'equidistant'));
    const cut = new AuraOnMapMemo().get(placed, mapOf(SQUARES, 'equidistant', [wall]));
    const passes = new AuraOnMapMemo().get(placed, mapOf(SQUARES, 'equidistant', [wall]), false);
    expect(open.area.contains(centre(7, 4))).toBe(true);
    expect(cut.area.contains(centre(7, 4))).toBe(false);
    expect(cut.area.contains(centre(5, 4))).toBe(true);
    expect(cut.cells!.some(({ key }) => key === '6,4')).toBe(false);
    expect(Math.max(...cut.area.rings.flat().map(({ x }) => x))).toBeLessThanOrEqual(6 * SIZE + 0.2);
    expect(passes.cells).toHaveLength(open.cells!.length);
  });
});

describe('an aura that is resized or made from a circle', () => {
  it('takes whole cells, one at least, as its far handle is dragged along the way it lies', () => {
    const right = { x: 1, y: 0 };
    expect(auraCellsDragged(2, { x: 75, y: 300 }, right, SQUARES)).toBe(3);
    expect(auraCellsDragged(2, { x: 30, y: 0 }, right, SQUARES)).toBe(2);
    expect(auraCellsDragged(2, { x: -700, y: 0 }, right, SQUARES)).toBe(1);
    // Freely, and where tokens stand anywhere: to the tenth of a cell.
    expect(auraCellsDragged(2, { x: 30, y: 0 }, right, SQUARES, true)).toBe(2.4);
    expect(auraCellsDragged(2, { x: 30, y: 0 }, right, FREE)).toBe(2.4);
    expect(auraCellsDragged(2, { x: -700, y: 0 }, right, FREE)).toBe(0.5);
  });

  it('reaches as far past its token\'s space as the circle did, in whole cells', () => {
    const token = { ...centre(4, 4), size: 1 };
    // A circle of two cells from the token's centre ends a cell and a half past its space: two cells, as the GM meant.
    expect(auraCellsOfCircle([centre(4, 4), { x: centre(4, 4).x + 140, y: centre(4, 4).y }], token, SQUARES)).toBe(2);
    expect(auraCellsOfCircle([centre(4, 4), { x: centre(4, 4).x + 10, y: centre(4, 4).y }], token, SQUARES)).toBe(1);
    expect(auraCellsOfCircle([centre(4, 4), { x: centre(4, 4).x, y: centre(4, 4).y - 250 }], token, FREE)).toBe(3.1);
  });
});

describe('who sees an aura', () => {
  it('is who sees its token: never the players while its token is hidden from them or it is the GM\'s own', () => {
    const measure: KeptMeasure = aura(10, { origin: { tokenIds: ['other'], unseenAtStart: true } });
    expect(keptAudience(measure)).toEqual({ hidden: undefined, origin: { tokenIds: ['hero'], unseenAtStart: false } });
    expect(keptAudience(aura(10, { hidden: true })).hidden).toBe(true);
    const circle: KeptMeasure = { id: 'c', kind: 'measure', shape: 'circle', points: [{ x: 0, y: 0 }, { x: 70, y: 0 }] };
    expect(keptAudience(circle)).toBe(circle);
  });
});
