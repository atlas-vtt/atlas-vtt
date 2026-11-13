import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../grid/gridDistance';
import { distToSeg } from '../../lighting/segments';
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
function expectCellsOfOracle(grid: GridGeometry, shaped: MeasureArea, circumradius: number): void {
  // The rule alone: the cells a line's middle line adds are held below.
  const { spine: _spine, ...made } = shaped;
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

/** How far inside `grid`'s cell at `point` the point lies: its distance from the cell's outline. */
function depthInCell(grid: GridGeometry, point: Point): number {
  const outline = cellOutline(grid, cellCentreAt(grid, point));
  return Math.min(...outline.map((a, i) => {
    const b = outline[(i + 1) % outline.length]!;
    return distToSeg(point.x, point.y, [a.x, a.y, b.x, b.y]);
  }));
}

/** The cells the way from `from` to `to` runs through the inside of, by points a fraction of a pixel apart along it. */
function cellsAlong(grid: GridGeometry, from: Point, to: Point): Set<string> {
  const keys = new Set<string>();
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) * 4);
  for (let i = 0; i <= steps; i++) {
    const point = { x: from.x + ((to.x - from.x) * i) / steps, y: from.y + ((to.y - from.y) * i) / steps };
    if (depthInCell(grid, point) > 0.5) keys.add(cellKeyAt(grid, point));
  }
  return keys;
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
        // A third of the lines are thinner than a cell: their middle line alone holds their cells together.
        const made = area({ shape: 'line', points: [origin, end] }, { ...RULES, lineWidth: run % 3 ? grid.size : grid.size / 5 });
        const along = cellsAlong(grid, origin, end);
        for (const rule of AREA_CELL_RULES) {
          const covered = cellsInArea(grid, made, rule)!;
          const label = `${rule}, ${cells} cells at ${Math.round((angle * 180) / Math.PI)}° from ${origin.x},${origin.y}`;
          const keys = new Set(covered.map((cell) => cell.key));
          for (const key of along) expect(keys.has(key), `${label}: ${key} lies on its middle line`).toBe(true);
          // A middle line that runs along the cells' edges runs through none: there the rule alone decides (below).
          if (along.size === 0) continue;
          const centres = covered.map((cell) => cell.centre);
          expect(connected(centres, step), label).toBe(true);
          const reach = centres.map((cell) => (cell.x - origin.x) * towards.x + (cell.y - origin.y) * towards.y);
          expect(Math.min(...reach), label).toBeLessThanOrEqual(across);
          expect(Math.max(...reach), label).toBeGreaterThanOrEqual(Math.hypot(end.x - origin.x, end.y - origin.y) - across);
        }
      }
    });
  }

  it('covers under every rule the cells its middle line runs through, and none it only touches', () => {
    const grid: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
    // A thin line across three cells of a row: it holds no cell's centre and half of none.
    const thin = area({ shape: 'line', points: [{ x: 80, y: 90 }, { x: 270, y: 90 }], width: 10 });
    const { spine: _spine, ...byRuleAlone } = thin;
    expect(cellsInArea(grid, byRuleAlone, 'half')).toEqual([]);
    expect(cellsInArea(grid, byRuleAlone, 'centre')).toEqual([]);
    for (const rule of AREA_CELL_RULES) expect(cellsInArea(grid, thin, rule)!.map((cell) => cell.key)).toEqual(['1,1', '2,1', '3,1']);
    // Along a grid line it touches the cells on both sides and runs through none; through a corner, the two it crosses.
    const onEdge = area({ shape: 'line', points: [{ x: 80, y: 140 }, { x: 270, y: 140 }], width: 10 });
    expect(cellsInArea(grid, onEdge, 'half')).toEqual([]);
    const throughCorner = area({ shape: 'line', points: [{ x: 110, y: 110 }, { x: 170, y: 170 }], width: 10 });
    expect(cellsInArea(grid, throughCorner, 'half')!.map((cell) => cell.key)).toEqual(['1,1', '2,2']);
  });

  it('covers the two hexes its middle line runs between on the way to the next one', () => {
    const origin = cellCentreAt(POINTY, { x: 200, y: 200 });
    // Three cells down a column of pointy hexes: through a hex, between two, through the next, between two more and into a fifth row.
    const made = area({ shape: 'line', points: [origin, { x: origin.x, y: origin.y + 3 * POINTY.size }] }, { ...RULES, lineWidth: POINTY.size });
    const { spine: _spine, ...byRuleAlone } = made;
    const keys = cellsInArea(POINTY, made, 'half')!.map((cell) => cell.key);
    const byRule = cellsInArea(POINTY, byRuleAlone, 'half')!.map((cell) => cell.key);
    const below = (dx: number, rows: number): string => cellKeyAt(POINTY, { x: origin.x + dx, y: origin.y + rows * 1.5 * (POINTY.size / Math.sqrt(3)) });
    // The line's end cuts the last pair to less than half; its middle line runs between them into the hex below, which without them would lie apart.
    expect(keys.filter((key) => !byRule.includes(key)).sort()).toEqual([below(-10, 3), below(10, 3), below(0, 4)].sort());
    expect(byRule.every((key) => keys.includes(key))).toBe(true);
  });

  it('ends its middle line where a wall stops it', () => {
    const grid: GridGeometry = { type: 'square', size: 70, offsetX: 0, offsetY: 0 };
    const thin = area({ shape: 'line', points: [{ x: 80, y: 90 }, { x: 340, y: 90 }], width: 10 });
    const wall: WallSegment = { id: 'w', kind: 'wall', type: 'solid', p1: { x: 190, y: 0 }, p2: { x: 190, y: 300 } };
    expect(cellsInArea(grid, thin, 'half')!.map((cell) => cell.key)).toEqual(['1,1', '2,1', '3,1', '4,1']);
    expect(cellsInArea(grid, areaWithinWalls(thin, [wall]), 'half')!.map((cell) => cell.key)).toEqual(['1,1', '2,1']);
  });

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
    // A hex is taller than the line is wide: the two at its ends are cut to 49 %, and are the line's all the same.
    expect(cellsInArea(POINTY, made, 'half')).toHaveLength(4);
    const { spine: _spine, ...byRuleAlone } = made;
    expect(cellsInArea(POINTY, byRuleAlone, 'half')).toHaveLength(2);
    expect(cellsInArea(FLAT, area({ shape: 'circle', points: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }), 'centre')).toEqual([]);
  });
});
