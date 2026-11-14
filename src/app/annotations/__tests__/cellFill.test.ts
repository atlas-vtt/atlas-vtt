import { describe, expect, it } from 'vitest';
import type { GridGeometry } from '../../grid/gridDistance';
import { axialToPixel, createHexLayout, type HexGridType } from '../../grid/hexGeometry';
import type { Point } from '../../types/visionTypes';
import { annotationList } from '../annotationList';
import type { Annotation, DrawingAnnotation } from '../annotationTypes';
import { addedParts, CELL_FILL_OPACITY, cellsFilled, cellsShape, cellsUnfilled, coveredByFills, type CellFillChange, type CellFillLook } from '../cellFill';
import { cellGrid, cellsCrossed, type GridCell } from '../cellGrid';
import { inFill } from '../lineMath';
import { seeded } from './annotationKit';

type Coord = readonly [number, number];

/** A grid for the tests: its cells by whole coordinates, and which cells share an edge. */
interface Board {
  readonly name: string;
  cell(coord: Coord): GridCell;
  centre(coord: Coord): Point;
  neighbours(coord: Coord): Coord[];
}

function squares(size: number, offsetX: number, offsetY: number): Board {
  const grid = cellGrid({ type: 'square', size, offsetX, offsetY })!;
  const centre = ([column, row]: Coord): Point => ({ x: offsetX + (column + 0.5) * size, y: offsetY + (row + 0.5) * size });
  return {
    name: `squares of ${size} px`,
    centre,
    cell: (coord) => grid.cellAt(centre(coord))!,
    neighbours: ([column, row]) => [[column + 1, row], [column - 1, row], [column, row + 1], [column, row - 1]],
  };
}

function hexes(type: HexGridType, size: number, offsetX: number, offsetY: number): Board {
  const geometry: GridGeometry = { type, size, offsetX, offsetY };
  const grid = cellGrid(geometry)!;
  const layout = createHexLayout(type, size, offsetX, offsetY);
  const centre = ([q, r]: Coord): Point => axialToPixel(layout, { q, r });
  return {
    name: `${type} hexes of ${size} px`,
    centre,
    cell: (coord) => grid.cellAt(centre(coord))!,
    neighbours: ([q, r]) => [[q + 1, r], [q - 1, r], [q, r + 1], [q, r - 1], [q + 1, r - 1], [q - 1, r + 1]],
  };
}

const BOARDS: readonly Board[] = [squares(70, 0, 0), squares(33.5, 12.25, -7.75), hexes('hex-vertical', 70, 0, 0), hexes('hex-horizontal', 46.7, 17.9, -31.2)];
const keyOf = ([a, b]: Coord): string => `${a},${b}`;
const RED: CellFillLook = { color: '#e93147', layer: 'map', hidden: false };
const BLUE: CellFillLook = { ...RED, color: '#086ddd' };

/** The drawings of a level as a file has them, and the changes the Cells mode makes to them. */
class Level {
  private records: Record<string, Record<string, unknown>> = {};
  private made = 0;

  get list(): readonly Annotation[] {
    return annotationList({ drawings: this.records as never });
  }

  get drawings(): DrawingAnnotation[] {
    return this.list.filter((annotation): annotation is DrawingAnnotation => annotation.kind === 'drawing');
  }

  apply(change: CellFillChange | null): string[] {
    if (!change) return [];
    const records = { ...this.records };
    for (const id of change.removed) delete records[id];
    const ids = change.added.map((added) => {
      const id = `d${this.made++}`;
      records[id] = { id, kind: 'drawing', timestamp: 1, ...added };
      return id;
    });
    this.records = records;
    return ids;
  }

  fill(board: Board, coords: readonly Coord[], look: CellFillLook = RED): string[] {
    const top = this.drawings.reduce((most, { order }) => Math.max(most, order), 0) + 1;
    return this.apply(cellsFilled(coords.map((coord) => board.cell(coord)), look, this.list, top));
  }

  unfill(board: Board, coords: readonly Coord[]): string[] {
    return this.apply(cellsUnfilled(coords.map((coord) => board.cell(coord)), this.list));
  }

  change(id: string, fields: Record<string, unknown>): void {
    this.records = { ...this.records, [id]: { ...this.records[id], ...fields } };
  }

  /** The drawings whose fill covers `point`. */
  at(point: Point): DrawingAnnotation[] {
    return this.drawings.filter((drawing) => drawing.fill !== null && inFill(point, drawing.points, drawing.holes));
  }
}

/** The groups cells fall into where cells that share an edge are one group: the oracle a merge is held to. */
function islands(board: Board, coords: readonly Coord[]): string[][] {
  const left = new Map(coords.map((coord) => [keyOf(coord), coord]));
  const groups: string[][] = [];
  while (left.size > 0) {
    const [first] = left.values();
    const group: string[] = [];
    const queue = [first!];
    left.delete(keyOf(first!));
    while (queue.length > 0) {
      const coord = queue.pop()!;
      group.push(keyOf(coord));
      for (const next of board.neighbours(coord)) {
        if (left.delete(keyOf(next))) queue.push(next);
      }
    }
    groups.push(group.sort());
  }
  return groups.sort((a, b) => a[0]!.localeCompare(b[0]!));
}

/** A patch of cells picked at random within `reach` of the origin. */
function patch(random: () => number, reach: number, share: number): Coord[] {
  const coords: Coord[] = [];
  for (let a = -reach; a <= reach; a++) {
    for (let b = -reach; b <= reach; b++) {
      if (random() < share) coords.push([a, b]);
    }
  }
  return coords;
}

/** A blob of `count` hexes around the origin, ring by ring. */
function blob(count: number): Coord[] {
  const coords: Coord[] = [];
  for (let radius = 0; coords.length < count; radius++) {
    for (let q = -radius; q <= radius && coords.length < count; q++) {
      for (let r = Math.max(-radius, -q - radius); r <= Math.min(radius, -q + radius) && coords.length < count; r++) {
        if (Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r)) === radius) coords.push([q, r]);
      }
    }
  }
  return coords;
}

describe('filling cells', () => {
  it.each(BOARDS.map((board) => [board.name, board] as const))('makes one drawing of the cells that touch, with its holes, and a drawing for each island: %s', (_name, board) => {
    const random = seeded(3);
    for (let round = 0; round < 12; round++) {
      const level = new Level();
      const coords = patch(random, 6, 0.3 + 0.05 * round);
      const ids = level.fill(board, coords);
      const expected = islands(board, coords);
      expect(ids).toHaveLength(expected.length);
      // Every cell of the patch is covered by exactly one drawing, every other cell around by none (a hole inside a fill among them).
      const filled = new Set(coords.map(keyOf));
      const groups = new Map<string, string[]>();
      for (let a = -8; a <= 8; a++) {
        for (let b = -8; b <= 8; b++) {
          const covering = level.at(board.centre([a, b]));
          expect(covering.length, `${board.name} cell ${a},${b}`).toBe(filled.has(keyOf([a, b])) ? 1 : 0);
          if (covering[0]) groups.set(covering[0].id, [...(groups.get(covering[0].id) ?? []), keyOf([a, b])]);
        }
      }
      // The drawings are the islands: cells that share an edge are in one, cells that only share a corner are not.
      expect([...groups.values()].map((group) => group.sort()).sort((a, b) => a[0]!.localeCompare(b[0]!))).toEqual(expected);
      for (const drawing of level.drawings) {
        expect(drawing).toMatchObject({ cells: true, shape: 'line', closed: true, width: 0, fill: 'solid', opacity: CELL_FILL_OPACITY, color: RED.color, layer: 'map', hidden: false, group: null });
      }
    }
  });

  it.each(BOARDS.map((board) => [board.name, board] as const))('joins the fills of its colour it touches, drag after drag, as if all were filled at once: %s', (_name, board) => {
    const random = seeded(5);
    for (let round = 0; round < 8; round++) {
      const level = new Level();
      const all: Coord[] = [];
      for (let drag = 0; drag < 6; drag++) {
        const coords = patch(random, 5, 0.12);
        level.fill(board, coords);
        for (const coord of coords) if (!all.some((known) => keyOf(known) === keyOf(coord))) all.push(coord);
        expect(level.drawings).toHaveLength(islands(board, all).length);
        for (let a = -6; a <= 6; a++) {
          for (let b = -6; b <= 6; b++) expect(level.at(board.centre([a, b]))).toHaveLength(all.some((coord) => keyOf(coord) === keyOf([a, b])) ? 1 : 0);
        }
      }
    }
  });

  it('leaves a hole where a ring of cells closes around an empty one, and fills it by a later drag', () => {
    const board = BOARDS[0]!;
    const level = new Level();
    const ring: Coord[] = [[0, 0], [1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2], [0, 1]];
    const [id] = level.fill(board, ring);
    const [drawing] = level.drawings;
    expect(drawing!.holes).toHaveLength(1);
    expect(drawing!.points).toHaveLength(5);
    expect(level.at(board.centre([1, 1]))).toHaveLength(0);
    const [whole] = level.fill(board, [[1, 1]]);
    expect(whole).not.toBe(id);
    expect(level.drawings).toHaveLength(1);
    expect(level.drawings[0]!.holes).toHaveLength(0);
    expect(level.at(board.centre([1, 1]))).toHaveLength(1);
  });

  it('keeps what the fill it joins says of itself, and its place among the drawings', () => {
    const board = BOARDS[2]!;
    const level = new Level();
    const [first] = level.fill(board, [[0, 0], [1, 0]]);
    level.change(first!, { group: 'sketch', later: { atlas: 99 } });
    const [second] = level.fill(board, [[5, 5]]);
    expect(level.drawings.map(({ order }) => order)).toEqual([1, 2]);
    // A drag that bridges both: one drawing, in the place of the lower one, with its group and the field this Atlas does not know.
    const [joined] = level.fill(board, [[2, 0], [3, 0], [3, 1], [3, 2], [4, 2], [4, 3], [4, 4], [5, 4]]);
    expect(level.drawings).toHaveLength(1);
    const [drawing] = level.drawings;
    expect(drawing).toMatchObject({ id: joined, order: 1, group: 'sketch', cells: true });
    expect(drawing!.record).toMatchObject({ later: { atlas: 99 } });
    expect(second).not.toBe(joined);
  });

  it('replaces the fill a cell had: another colour leaves the cell, and a fill the cells cut through falls in two', () => {
    const board = BOARDS[0]!;
    const level = new Level();
    const [row] = level.fill(board, [[0, 0], [1, 0], [2, 0]]);
    level.change(row!, { later: 1 });
    const change = cellsFilled([board.cell([1, 0])], BLUE, level.list, 2)!;
    // One write: the red row goes, its two ends and the blue cell come.
    expect(change.removed).toEqual([row]);
    expect(change.added.map(({ color }) => color)).toEqual([RED.color, RED.color, BLUE.color]);
    expect(change.added.slice(0, 2).every((piece) => piece.order === 1 && 'later' in piece)).toBe(true);
    expect(change.added[2]).toMatchObject({ order: 2, cells: true });
    level.apply(change);
    expect(level.at(board.centre([1, 0])).map(({ color }) => color)).toEqual([BLUE.color]);
    expect(level.at(board.centre([0, 0])).map(({ color }) => color)).toEqual([RED.color]);
    expect(level.at(board.centre([2, 0])).map(({ color }) => color)).toEqual([RED.color]);
    // A fill of another look goes the same way, and one painted over whole is gone.
    level.change(level.at(board.centre([0, 0]))[0]!.id, { opacity: 1 });
    level.fill(board, [[0, 0]]);
    expect(level.at(board.centre([0, 0]))).toHaveLength(1);
    expect(level.at(board.centre([0, 0]))[0]).toMatchObject({ color: RED.color, opacity: CELL_FILL_OPACITY });
    expect(level.drawings).toHaveLength(3);
  });

  it.each(BOARDS.map((board) => [board.name, board] as const))('leaves every cell the colour it was painted last, drag after drag: %s', (_name, board) => {
    const random = seeded(13);
    for (let round = 0; round < 6; round++) {
      const level = new Level();
      const painted = new Map<string, { coord: Coord; color: string }>();
      for (let drag = 0; drag < 7; drag++) {
        const look = drag % 2 === 0 ? RED : BLUE;
        const coords = patch(random, 5, 0.2);
        level.fill(board, coords, look);
        for (const coord of coords) painted.set(keyOf(coord), { coord, color: look.color });
        for (const look$ of [RED, BLUE]) {
          const cells = [...painted.values()].filter(({ color }) => color === look$.color).map(({ coord }) => coord);
          expect(level.drawings.filter((drawing) => drawing.color === look$.color)).toHaveLength(islands(board, cells).length);
        }
        for (let a = -6; a <= 6; a++) {
          for (let b = -6; b <= 6; b++) {
            const colour = painted.get(keyOf([a, b]))?.color;
            expect(level.at(board.centre([a, b])).map(({ color }) => color), `${board.name} cell ${a},${b}`).toEqual(colour ? [colour] : []);
          }
        }
      }
    }
  });

  it('leaves fills on the other layer and hidden ones under shown ones their cells, and drawings that are no cell fills', () => {
    const board = BOARDS[0]!;
    const level = new Level();
    level.fill(board, [[0, 1]], { ...BLUE, layer: 'above' });
    level.fill(board, [[0, 2]], { ...BLUE, hidden: true });
    const [handDrawn] = level.fill(board, [[0, 3]], BLUE);
    level.change(handDrawn!, { cells: undefined });
    const before = level.drawings.map(({ record }) => record);
    // Red over all three, and beside them: one new drawing, each of the three as it was.
    const [column] = level.fill(board, [[0, 1], [0, 2], [0, 3], [1, 1]]);
    expect(level.drawings).toHaveLength(4);
    expect(level.drawings.slice(0, 3).map(({ record }) => record)).toEqual(before);
    expect(level.drawings[3]).toMatchObject({ id: column, order: 4 });
    for (const row of [1, 2, 3]) expect(level.at(board.centre([0, row])).map(({ color }) => color).sort()).toEqual([BLUE.color, RED.color]);
    // And the other way round: a hidden fill takes nothing from a shown one.
    level.fill(board, [[1, 1]], { ...BLUE, hidden: true });
    expect(level.at(board.centre([1, 1])).map(({ color, hidden }) => [color, hidden])).toEqual([[RED.color, false], [BLUE.color, true]]);
  });

  it('leaves a locked fill its cells: the new colour lies on it, and joins it no more than it clears it', () => {
    const board = BOARDS[0]!;
    const level = new Level();
    const [blue] = level.fill(board, [[0, 0], [1, 0]], BLUE);
    level.change(blue!, { locked: true });
    const [red] = level.fill(board, [[3, 0]]);
    level.change(red!, { locked: true });
    const before = level.drawings.map(({ record }) => record);
    level.fill(board, [[1, 0], [2, 0]]);
    expect(level.drawings.slice(0, 2).map(({ record }) => record)).toEqual(before);
    expect(level.drawings).toHaveLength(3);
    expect(level.at(board.centre([1, 0])).map(({ color }) => color)).toEqual([BLUE.color, RED.color]);
    expect(level.at(board.centre([0, 0])).map(({ color }) => color)).toEqual([BLUE.color]);
    // The locked red cell beside the new ones is a drawing of its own still.
    expect(level.at(board.centre([3, 0])).map(({ id }) => id)).toEqual([red]);
  });

  it('changes nothing where every cell had the colour already', () => {
    const board = BOARDS[3]!;
    const level = new Level();
    level.fill(board, [[0, 0], [1, 0], [0, 1]]);
    level.fill(board, [[3, 3]], BLUE);
    expect(cellsFilled([board.cell([1, 0]), board.cell([0, 1])], RED, level.list, 9)).toBeNull();
    expect(cellsFilled([board.cell([3, 3])], BLUE, level.list, 9)).toBeNull();
    expect(cellsFilled([], RED, level.list, 9)).toBeNull();
  });

  it('ends a cell at the map\'s edge', () => {
    const board = BOARDS[0]!;
    const level = new Level();
    const bounds = { minX: 0, minY: 0, maxX: 175, maxY: 1000 };
    level.apply(cellsFilled([board.cell([1, 0]), board.cell([2, 0])], RED, level.list, 1, bounds));
    const xs = level.drawings[0]!.points.map(({ x }) => x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([70, 175]);
    // A cell that lies beyond the map is no fill at all.
    expect(cellsFilled([board.cell([5, 0])], RED, level.list, 1, bounds)).toBeNull();
  });

  it('shows, while a drag lasts, only what the drag adds to the fills it will join', () => {
    const board = BOARDS[0]!;
    const level = new Level();
    level.fill(board, [[0, 0], [1, 0]]);
    level.fill(board, [[2, 0]], BLUE);
    const fresh = cellsShape([board.cell([1, 0]), board.cell([2, 0]), board.cell([3, 0])]);
    const parts = addedParts(fresh, coveredByFills(RED, level.list));
    // The red cell is there already; the blue one is another fill, over which the red is drawn until the release takes its cell.
    expect(parts).toHaveLength(1);
    const xs = parts[0]!.outline.map(({ x }) => x);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([140, 280]);
    expect(addedParts(fresh, [])).toHaveLength(1);
  });

  it('joins 200 hexes to a fill of 2,000 in a few milliseconds', () => {
    const board = hexes('hex-vertical', 70, 0, 0);
    const level = new Level();
    level.fill(board, blob(2000));
    expect(level.drawings).toHaveLength(1);
    // A drag along the fill's rim and out of it: 200 hexes, half of them new.
    const drag: Coord[] = Array.from({ length: 200 }, (_unused, index) => [index - 60, 20] as const);
    const cells = drag.map((coord) => board.cell(coord));
    const list = level.list;
    const times: number[] = [];
    let change: CellFillChange | null = null;
    for (let run = 0; run < 7; run++) {
      const started = performance.now();
      change = cellsFilled(cells, RED, list, 2);
      times.push(performance.now() - started);
    }
    times.sort((a, b) => a - b);
    const covered = coveredByFills(RED, list);
    const liveStarted = performance.now();
    addedParts(cellsShape(cells), covered);
    const live = performance.now() - liveStarted;
    console.info(`[cellFill] 200 hexes joined to a 2,000-hex fill: median ${times[3]!.toFixed(2)} ms, slowest ${times[6]!.toFixed(2)} ms; the cells shown while dragging: ${live.toFixed(2)} ms; outline of ${change!.added[0]!.points.length} points`);
    // What a pointer move costs before any of that: finding the cells a short stretch of its way passes.
    const grid = cellGrid({ type: 'hex-vertical', size: 70, offsetX: 0, offsetY: 0 })!;
    const movesStarted = performance.now();
    for (let move = 0; move < 5000; move++) cellsCrossed(grid, { x: 300 + (move % 40), y: 300 }, { x: 304 + (move % 40), y: 303 });
    console.info(`[cellFill] the cells a pointer move passes: ${(((performance.now() - movesStarted) / 5000) * 1000).toFixed(1)} µs a move`);
    expect(change!.removed).toHaveLength(1);
    expect(change!.added).toHaveLength(1);
    expect(times[3]!).toBeLessThan(50);
  });
});

describe('unfilling cells', () => {
  it.each(BOARDS.map((board) => [board.name, board] as const))('takes the cells out of every fill, whatever its colour, and splits one that falls apart: %s', (_name, board) => {
    const random = seeded(9);
    for (let round = 0; round < 10; round++) {
      const level = new Level();
      const red = patch(random, 5, 0.55);
      const blue = patch(random, 5, 0.3);
      // The blue fills lie above the tokens, so a cell can hold both: a red one on the map and a blue one over it.
      level.fill(board, red);
      level.fill(board, blue, { ...BLUE, layer: 'above' });
      const gone = patch(random, 5, 0.3);
      level.unfill(board, gone);
      const cleared = new Set(gone.map(keyOf));
      const left = (coords: readonly Coord[]): Coord[] => coords.filter((coord) => !cleared.has(keyOf(coord)));
      const count = (color: string): number => level.drawings.filter((drawing) => drawing.color === color).length;
      expect(count(RED.color)).toBe(islands(board, left(red)).length);
      expect(count(BLUE.color)).toBe(islands(board, left(blue)).length);
      for (let a = -6; a <= 6; a++) {
        for (let b = -6; b <= 6; b++) {
          const colours = level.at(board.centre([a, b])).map(({ color }) => color).sort();
          const expected = [...(left(blue).some((coord) => keyOf(coord) === keyOf([a, b])) ? [BLUE.color] : []), ...(left(red).some((coord) => keyOf(coord) === keyOf([a, b])) ? [RED.color] : [])];
          expect(colours, `${board.name} cell ${a},${b}`).toEqual(expected);
        }
      }
      for (const drawing of level.drawings) expect(drawing).toMatchObject({ cells: true, group: null, width: 0 });
    }
  });

  it('removes a fill that is emptied, keeps the rest\'s fields, and leaves locked fills and other drawings alone', () => {
    const board = BOARDS[0]!;
    const level = new Level();
    const [row] = level.fill(board, [[0, 0], [1, 0], [2, 0]]);
    level.change(row!, { later: 1, order: 4 });
    const [locked] = level.fill(board, [[0, 1]], BLUE);
    level.change(locked!, { locked: true });
    level.apply({ removed: [], added: [{ type: 'rectangle', points: [{ x: 0, y: 140 }, { x: 70, y: 140 }, { x: 70, y: 210 }, { x: 0, y: 210 }, { x: 0, y: 140 }], color: '#ffffff', width: 0, opacity: 1, fill: 'solid' }] });
    const [single] = level.fill(board, [[5, 5]]);
    // The middle of the row, the locked cell, the drawn square and the single cell.
    const cleared: Coord[] = [[1, 0], [0, 1], [0, 2], [5, 5]];
    const change = cellsUnfilled(cleared.map((coord) => board.cell(coord)), level.list)!;
    expect(change.removed.sort()).toEqual([row, single].sort());
    expect(change.added).toHaveLength(2);
    for (const piece of change.added) expect(piece).toMatchObject({ later: 1, order: 4, cells: true, fill: 'solid' });
    level.apply(change);
    expect(level.drawings.map(({ id }) => id)).toContain(locked);
    expect(level.at(board.centre([0, 1]))).toHaveLength(1);
    expect(level.at(board.centre([0, 2]))).toHaveLength(1);
    // Nothing is left to clear there now.
    expect(cellsUnfilled([board.cell([1, 0]), board.cell([9, 9])], level.list)).toBeNull();
  });
});
