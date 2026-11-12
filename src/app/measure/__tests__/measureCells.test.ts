import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../grid/gridDistance';
import type { Point } from '../../types/visionTypes';
import type { WallSegment } from '../../types/wallTypes';
import { AREA_CELL_RULES, type AreaCellRule } from '../areaRules';
import { cellsInArea, MAX_AREA_CELLS } from '../measureCells';
import { shapedArea, type MeasureArea, type ShapedArea } from '../measureGeometry';
import { cellCentreAt, cellKeyAt, cellOutline } from '../measureGrid';
import { snapAreaEnd, snapAreaOrigin } from '../measureSnap';
import type { Measurement } from '../measureTypes';
import { areaWithinWalls } from '../measureWalls';
import { AREA_SHAPES, distanceToOutline, FLAT, GRIDS, POINTY, RULES, sampledCells, seeded, SQUARE } from './areaTestKit';

function area(measurement: Measurement, rules = RULES): ShapedArea {
  const made = shapedArea(measurement, rules);
  if (!made) throw new Error('no area');
  return made;
}

function keysOf(grid: GridGeometry, made: MeasureArea, rule: AreaCellRule): Set<string> {
  const cells = cellsInArea(grid, made, rule);
  if (!cells) throw new Error('cells are not counted');
  return new Set(cells.map((cell) => cell.key));
}

/** How far the sampled share of a cell may lie from its true one. */
const SAMPLING = 0.06;

/** Holds the cells `made` covers against cells sampled densely and asked of the area itself. */
function expectCellsOfOracle(grid: GridGeometry, made: MeasureArea, circumradius: number): void {
  const sampled = sampledCells(grid, made);
  const covered = Object.fromEntries(AREA_CELL_RULES.map((rule) => [rule, keysOf(grid, made, rule)])) as Record<AreaCellRule, Set<string>>;
  for (const rule of AREA_CELL_RULES) {
    for (const key of covered[rule]) expect(sampled.has(key), `${rule}: ${key} lies at the area`).toBe(true);
  }
  for (const { key, centre, share } of sampled.values()) {
    expect(covered.centre.has(key), `centre: ${key}`).toBe(made.contains(centre));
    if (Math.abs(share - 0.5) > SAMPLING) expect(covered.half.has(key), `half: ${key} holds ${share}`).toBe(share > 0.5);
    if (share > SAMPLING) expect(covered.any.has(key), `any: ${key} holds ${share}`).toBe(true);
    // A cell with any part in the area has the area's inside or its outline within its own reach.
    if (covered.any.has(key)) expect(made.contains(centre) || distanceToOutline(made, centre) <= circumradius).toBe(true);
    if (covered.half.has(key)) expect(covered.any.has(key)).toBe(true);
  }
}

const circumradiusOf = (grid: GridGeometry): number => Math.hypot(cellOutline(grid, { x: 0, y: 0 })[0]!.x, cellOutline(grid, { x: 0, y: 0 })[0]!.y);

describe('cellsInArea', () => {
  for (const [name, grid] of GRIDS) {
    for (const shape of AREA_SHAPES) {
      it(`covers the cells a dense sampling finds: ${shape} on ${name}`, () => {
        const random = seeded(shape.length * 31 + grid.size);
        for (let run = 0; run < 4; run++) {
          const origin = { x: random() * 600 - 300, y: random() * 600 - 300 };
          const angle = random() * 2 * Math.PI;
          const length = grid.size * (0.6 + random() * 4.5);
          const end = { x: origin.x + length * Math.cos(angle), y: origin.y + length * Math.sin(angle) };
          const made = area({ shape, points: [origin, end] }, { coneAngle: 30 + random() * 200, coneEnd: run % 2 ? 'flat' : 'round', lineWidth: grid.size * (0.5 + random() * 2) });
          expectCellsOfOracle(grid, made, circumradiusOf(grid));
        }
      });
    }
  }

  it('covers the cells a dense sampling finds for an area walls cut', () => {
    const wall = (id: string, x1: number, y1: number, x2: number, y2: number): WallSegment => ({ id, kind: 'wall', type: 'solid', p1: { x: x1, y: y1 }, p2: { x: x2, y: y2 } });
    const walls = [wall('a', 120, -300, 120, 60), wall('b', -200, 150, 90, 150), wall('c', -150, -80, -60, -170)];
    for (const [, grid] of GRIDS) {
      const cutArea = areaWithinWalls(area({ shape: 'circle', points: [{ x: 10, y: 20 }, { x: 290, y: 20 }] }), walls);
      expect(cutArea.contains({ x: 200, y: -100 })).toBe(false);
      expectCellsOfOracle(grid, cutArea, circumradiusOf(grid));
    }
  });

  it('names every cell as the grid does and puts its centre in it', () => {
    for (const [, grid] of GRIDS) {
      const cells = cellsInArea(grid, area({ shape: 'circle', points: [{ x: -40, y: 90 }, { x: 300, y: 90 }] }), 'any')!;
      expect(cells.length).toBeGreaterThan(40);
      expect(new Set(cells.map((cell) => cell.key)).size).toBe(cells.length);
      for (const cell of cells) {
        expect(cellKeyAt(grid, cell.centre)).toBe(cell.key);
        const centre = cellCentreAt(grid, cell.centre);
        expect(cell.centre.x).toBeCloseTo(centre.x, 9);
        expect(cell.centre.y).toBeCloseTo(centre.y, 9);
      }
    }
  });

  it('covers exactly its own cells for a square laid on the grid, under every rule', () => {
    const grid: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
    const made = area({ shape: 'square', points: [{ x: 105, y: 70 }, { x: 105, y: 280 }] });
    const own = ['0,1', '1,1', '2,1', '0,2', '1,2', '2,2', '0,3', '1,3', '2,3'].sort();
    for (const rule of AREA_CELL_RULES) expect([...keysOf(grid, made, rule)].sort()).toEqual(own);
  });

  it('counts a cell that is half inside to the last bit, and one whose centre lies on the edge', () => {
    const grid: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
    // A line one cell wide along a grid line has half of each cell beside it.
    const made = area({ shape: 'line', points: [{ x: 70, y: 140 }, { x: 280, y: 140 }] });
    const both = ['1,1', '2,1', '3,1', '1,2', '2,2', '3,2'].sort();
    for (const rule of AREA_CELL_RULES) expect([...keysOf(grid, made, rule)].sort()).toEqual(both);
  });

  it('tells the three rules apart where a circle cuts a cell', () => {
    const grid: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
    // One cell around a corner: each of the four cells at the corner holds a quarter disc, 79 % of itself, and the eight beside them a sliver.
    const made = area({ shape: 'circle', points: [{ x: 140, y: 140 }, { x: 210, y: 140 }] });
    expect(keysOf(grid, made, 'half').size).toBe(4);
    expect(keysOf(grid, made, 'centre').size).toBe(4);
    expect(keysOf(grid, made, 'any').size).toBe(4);
    // A little larger, and it reaches into the cells around.
    const larger = area({ shape: 'circle', points: [{ x: 140, y: 140 }, { x: 222, y: 140 }] });
    expect(keysOf(grid, larger, 'half').size).toBe(4);
    expect(keysOf(grid, larger, 'any').size).toBe(12);
    // From a cell's centre a circle of a little over one and a half cells holds the centres of nine cells, and less than half of the twelve it reaches into.
    const centred = area({ shape: 'circle', points: [{ x: 105, y: 105 }, { x: 217, y: 105 }] });
    expect(keysOf(grid, centred, 'centre').size).toBe(9);
    expect(keysOf(grid, centred, 'half').size).toBe(9);
    expect(keysOf(grid, centred, 'any').size).toBe(21);
  });

  it('counts no cells without a grid, and none for an area too large to count them', () => {
    const made = area({ shape: 'circle', points: [{ x: 0, y: 0 }, { x: 280, y: 0 }] });
    expect(cellsInArea(null, made, 'half')).toBeNull();
    expect(cellsInArea({ type: 'square', size: 0 }, made, 'half')).toBeNull();
    const huge = area({ shape: 'circle', points: [{ x: 0, y: 0 }, { x: 1e9, y: 0 }] });
    for (const rule of AREA_CELL_RULES) expect(cellsInArea(SQUARE, huge, rule)).toBeNull();
    const largest = area({ shape: 'square', points: [{ x: 0, y: 0 }, { x: 0, y: 70 * 200 }] });
    expect(cellsInArea(SQUARE, largest, 'centre')!.length).toBeLessThanOrEqual(MAX_AREA_CELLS);
    expect(cellsInArea(SQUARE, { rings: [], bounds: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity }, contains: () => false }, 'any')).toEqual([]);
  });
});

/** Whether `cells` hang together: each can be reached from the first over cells no farther apart than `step`. */
function connected(cells: readonly Point[], step: number): boolean {
  const reached = new Set([0]);
  const open = [0];
  while (open.length > 0) {
    const from = cells[open.pop()!]!;
    cells.forEach((cell, i) => {
      if (!reached.has(i) && Math.hypot(cell.x - from.x, cell.y - from.y) <= step) {
        reached.add(i);
        open.push(i);
      }
    });
  }
  return reached.size === cells.length;
}

describe('a snapped line', () => {
  for (const [name, grid] of GRIDS) {
    it(`never skips a cell along its length on ${name}`, () => {
      const random = seeded(grid.size);
      // Neighbours: squares over a side or a corner, hexes over a side.
      const step = (grid.type === 'square' ? Math.SQRT2 : 1) * grid.size * 1.001;
      // The longest way across a cell.
      const across = 2 * circumradiusOf(grid) * 1.001;
      for (let run = 0; run < 90; run++) {
        const origin = snapAreaOrigin(grid, { x: random() * 500, y: random() * 500 });
        const angle = run < 24 ? (run * Math.PI) / 12 : random() * 2 * Math.PI;
        const cells = 1 + Math.floor(random() * 9);
        const towards = { x: Math.cos(angle), y: Math.sin(angle) };
        const end = snapAreaEnd(grid, origin, { x: origin.x + towards.x * cells * grid.size, y: origin.y + towards.y * cells * grid.size });
        const made = area({ shape: 'line', points: [origin, end] }, { ...RULES, lineWidth: grid.size });
        for (const rule of AREA_CELL_RULES) {
          const covered = cellsInArea(grid, made, rule)!.map((cell) => cell.centre);
          const label = `${rule}, ${cells} cells at ${Math.round((angle * 180) / Math.PI)}° from ${origin.x},${origin.y}`;
          // Half of a cell: the cells a line's ends cut may each hold less (below), so a short line may hold half of none
          // and a longer one begins and ends up to a cell later than under the other rules.
          const ends = rule === 'half' ? 2 * across : across;
          if (rule !== 'half' || cells >= 3) expect(covered.length, label).toBeGreaterThan(0);
          if (covered.length === 0) continue;
          expect(connected(covered, step), label).toBe(true);
          const reach = covered.map((cell) => (cell.x - origin.x) * towards.x + (cell.y - origin.y) * towards.y);
          expect(Math.min(...reach), label).toBeLessThanOrEqual(ends);
          expect(Math.max(...reach), label).toBeGreaterThanOrEqual(cells * grid.size - ends);
        }
      }
    });
  }

  it('holds half of no cell where its end cuts the cells beside it in two', () => {
    const grid: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
    // From the middle of an edge along that edge, one cell long: a quarter of each of four cells.
    const short = area({ shape: 'line', points: [{ x: 105, y: 140 }, { x: 175, y: 140 }] });
    expect(cellsInArea(grid, short, 'half')).toEqual([]);
    expect(cellsInArea(grid, short, 'centre')).toHaveLength(4);
    expect(cellsInArea(grid, short, 'any')).toHaveLength(4);
    // Three cells long: half of the two cells beside each whole cell's length of it, a quarter of those at its ends.
    const long = area({ shape: 'line', points: [{ x: 105, y: 140 }, { x: 315, y: 140 }] });
    expect(cellsInArea(grid, long, 'half')!.map((cell) => cell.key)).toEqual(['2,1', '3,1', '2,2', '3,2']);
  });

  it('covers one row from the middle of a cell\'s edge and two from a corner', () => {
    const grid: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
    for (const rule of AREA_CELL_RULES) {
      const fromEdge = cellsInArea(grid, area({ shape: 'line', points: [{ x: 70, y: 105 }, { x: 350, y: 105 }] }), rule)!;
      expect(fromEdge.map((cell) => cell.key)).toEqual(['1,1', '2,1', '3,1', '4,1']);
      expect(cellsInArea(grid, area({ shape: 'line', points: [{ x: 70, y: 70 }, { x: 350, y: 70 }] }), rule)).toHaveLength(8);
    }
  });

  it('covers the hexes of a row it runs along', () => {
    const origin = cellCentreAt(POINTY, { x: 200, y: 200 });
    const made = area({ shape: 'line', points: [origin, { x: origin.x + 3 * POINTY.size, y: origin.y }] }, { ...RULES, lineWidth: POINTY.size });
    expect(cellsInArea(POINTY, made, 'centre')).toHaveLength(4);
    expect(cellsInArea(POINTY, made, 'any')).toHaveLength(4 + 2 * 3);
    // A hex is taller than the line is wide: the two at its ends are cut to 49 % and are not half inside.
    expect(cellsInArea(POINTY, made, 'half')).toHaveLength(2);
    expect(cellsInArea(FLAT, area({ shape: 'circle', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }), 'centre')).toEqual([]);
  });
});
