/**
 * The Cells shape of the fog tool: the cells of the grid a drag passes, squares or hexes, and the
 * fog shapes that cover exactly those cells.
 */

import type { GridGeometry } from '../grid/gridDistance';
import { axialToPixel, createHexLayout, isHexGridType, pixelToAxial, type HexGridType } from '../grid/hexGeometry';
import type { StrokeShape } from '../tools/shapeStroke';
import type { Point } from '../types/visionTypes';

/** A cell of the grid: a square's column and row, a hex's axial q and r. */
export interface FogCell {
  readonly i: number;
  readonly j: number;
}

/** A corner of a cell in whole numbers, the same for every cell that has it. */
type Corner = readonly [number, number];

/** A lasso over cells: the only shape cells are covered with. */
type CellShape = Extract<StrokeShape, { type: 'lasso' }>;

/** A grid as its cells are read. */
interface CellGrid {
  cellAt(point: Point): FogCell;
  /** A cell's corners, turning the same way round for every cell (a positive area by the shoelace sum). */
  corners(cell: FogCell): Corner[];
  /** Where a corner lies on the map: one place per corner, whichever cell asks. */
  place(corner: Corner): Point;
  /** The cells in the pieces that cover them where one outline cannot: a square grid's runs along a row, a hex grid's single hexes. */
  pieces(cells: readonly FogCell[]): FogCell[][];
}

/** How short a piece of a drag is before its two ends' cells are taken for neighbours, as a share of the cell. */
const FINEST_STEP = 1 / 64;

const isPlace = (point: Point): boolean => Number.isFinite(point.x) && Number.isFinite(point.y);
const cellKey = (cell: FogCell): string => `${cell.i},${cell.j}`;
const cornerKey = (corner: Corner): string => `${corner[0]},${corner[1]}`;

function squareGrid(size: number, offsetX: number, offsetY: number): CellGrid {
  return {
    cellAt: (point) => ({ i: Math.floor((point.x - offsetX) / size), j: Math.floor((point.y - offsetY) / size) }),
    corners: ({ i, j }) => [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]],
    place: ([x, y]) => ({ x: offsetX + x * size, y: offsetY + y * size }),
    pieces: (cells) => {
      const sorted = [...cells].sort((a, b) => a.j - b.j || a.i - b.i);
      const runs: FogCell[][] = [];
      for (const cell of sorted) {
        const run = runs[runs.length - 1];
        const before = run?.[run.length - 1];
        if (run && before && before.j === cell.j && before.i + 1 === cell.i) run.push(cell);
        else runs.push([cell]);
      }
      return runs;
    },
  };
}

function hexGrid(type: HexGridType, size: number, offsetX: number, offsetY: number): CellGrid {
  const layout = createHexLayout(type, size, offsetX, offsetY);
  return {
    cellAt: (point) => {
      const { q, r } = pixelToAxial(layout, point);
      return { i: q, j: r };
    },
    // A hex's corners lie a third of the way to its neighbours: in thirds of a cell they are whole numbers.
    corners: ({ i: q, j: r }) => [
      [3 * q + 1, 3 * r + 1], [3 * q - 1, 3 * r + 2], [3 * q - 2, 3 * r + 1],
      [3 * q - 1, 3 * r - 1], [3 * q + 1, 3 * r - 2], [3 * q + 2, 3 * r - 1],
    ],
    place: ([x, y]) => axialToPixel(layout, { q: x / 3, r: y / 3 }),
    pieces: (cells) => cells.map((cell) => [cell]),
  };
}

/** The cells of `grid`; null for a grid without a cell size. */
function cellGrid(grid: GridGeometry): CellGrid | null {
  const offsetX = grid.offsetX ?? 0;
  const offsetY = grid.offsetY ?? 0;
  if (![grid.size, offsetX, offsetY].every(Number.isFinite) || !(grid.size > 0)) return null;
  return isHexGridType(grid.type) ? hexGrid(grid.type, grid.size, offsetX, offsetY) : squareGrid(grid.size, offsetX, offsetY);
}

/** Whether cells can be painted on `grid`: it has a cell size and a place. */
export function hasCells(grid: GridGeometry | null | undefined): grid is GridGeometry {
  return !!grid && cellGrid(grid) !== null;
}

/**
 * The cells the straight line from `from` to `to` passes, in the order it passes them, the cell
 * of `from` first. However fast the pointer moved, none between is left out.
 */
export function cellsOnSegment(grid: GridGeometry, from: Point, to: Point): FogCell[] {
  const cells = cellGrid(grid);
  if (!cells || !isPlace(from) || !isPlace(to)) return [];
  const first = cells.cellAt(from);
  const passed = [first];
  walk(cells, from, first, to, cells.cellAt(to), grid.size * FINEST_STEP, passed);
  return passed;
}

/** Adds the cells the line from `a` to `b` enters after the cell of `a`, which is the last of `passed`. */
function walk(cells: CellGrid, a: Point, cellA: FogCell, b: Point, cellB: FogCell, finest: number, passed: FogCell[]): void {
  // Cells are convex: a piece of the line that ends in the cell it began in never left it.
  if (cellA.i === cellB.i && cellA.j === cellB.j) return;
  if (Math.hypot(b.x - a.x, b.y - a.y) <= finest) {
    passed.push(cellB);
    return;
  }
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const cellM = cells.cellAt(middle);
  walk(cells, a, cellA, middle, cellM, finest, passed);
  walk(cells, middle, cellM, b, cellB, finest, passed);
}

interface Edge {
  readonly from: Corner;
  readonly to: Corner;
  /** The cell it is an edge of, as its place in the list. */
  readonly cell: number;
  used: boolean;
}

/** The edges of `cells` that no two of them share: their outline, each edge with its cell inside on the same hand. */
function outlineEdges(lattice: CellGrid, cells: readonly FogCell[]): Edge[] {
  const edges = new Map<string, Edge>();
  cells.forEach((cell, index) => {
    const corners = lattice.corners(cell);
    corners.forEach((from, k) => {
      const to = corners[(k + 1) % corners.length]!;
      // The cell on the other side has the edge the other way round: shared, it is no outline.
      if (!edges.delete(`${cornerKey(to)}>${cornerKey(from)}`)) edges.set(`${cornerKey(from)}>${cornerKey(to)}`, { from, to, cell: index, used: false });
    });
  });
  return [...edges.values()];
}

/** The outline's edges joined end to end into closed walks. */
function closedWalks(edges: readonly Edge[]): Corner[][] {
  const leaving = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = cornerKey(edge.from);
    const from = leaving.get(key);
    if (from) from.push(edge);
    else leaving.set(key, [edge]);
  }
  const walks: Corner[][] = [];
  for (const start of edges) {
    if (start.used) continue;
    const corners: Corner[] = [];
    let edge: Edge | undefined = start;
    while (edge) {
      edge.used = true;
      corners.push(edge.from);
      const cell: number = edge.cell;
      const onward: Edge[] = (leaving.get(cornerKey(edge.to)) ?? []).filter((next) => !next.used);
      // Where two squares meet at a corner alone, the outline stays with its square.
      const next: Edge | undefined = onward.find((candidate) => candidate.cell === cell) ?? onward[0];
      edge = next;
    }
    walks.push(corners);
  }
  return walks;
}

/** A closed walk as rings that pass no corner twice: one that touches itself at a corner is two there. */
function simpleRings(walk: readonly Corner[]): Corner[][] {
  const rings: Corner[][] = [];
  const path: Corner[] = [];
  const placeOf = new Map<string, number>();
  for (const corner of walk) {
    const key = cornerKey(corner);
    const at = placeOf.get(key);
    if (at !== undefined) {
      const ring = path.splice(at);
      for (const left of ring) placeOf.delete(cornerKey(left));
      rings.push(ring);
    }
    placeOf.set(key, path.length);
    path.push(corner);
  }
  rings.push(path);
  return rings.filter((ring) => ring.length >= 3);
}

/** Twice the area a ring encloses, by the shoelace sum: positive round cells, negative round a hole in them. */
function twiceArea(ring: readonly Corner[]): number {
  let twice = 0;
  for (let k = 0; k < ring.length; k++) {
    const a = ring[k]!;
    const b = ring[(k + 1) % ring.length]!;
    twice += a[0] * b[1] - b[0] * a[1];
  }
  return twice;
}

/** A ring without the corners that lie on a straight run of its edges. */
function turns(ring: readonly Corner[]): Corner[] {
  return ring.filter((corner, k) => {
    const before = ring[(k + ring.length - 1) % ring.length]!;
    const after = ring[(k + 1) % ring.length]!;
    return (corner[0] - before[0]) * (after[1] - corner[1]) !== (corner[1] - before[1]) * (after[0] - corner[0]);
  });
}

function shapeOf(lattice: CellGrid, ring: readonly Corner[]): CellShape {
  return { type: 'lasso', points: turns(ring).map((corner) => lattice.place(corner)) };
}

/** The outline of `cells` as rings, or null where the cells enclose a hole. */
function outlineRings(lattice: CellGrid, cells: readonly FogCell[]): Corner[][] | null {
  const rings = closedWalks(outlineEdges(lattice, cells)).flatMap(simpleRings);
  return rings.every((ring) => twiceArea(ring) > 0) ? rings : null;
}

/**
 * The fog shapes that cover exactly `cells`, as few as their outline needs: one per piece of
 * cells that hang together, where none of them encloses a hole (a fog shape has one outline and
 * cannot leave one out). Otherwise one per run of squares along a row, or one per hex. Shapes
 * that meet share their corners to the last bit, so the fog they make has no seam.
 */
export function cellShapes(grid: GridGeometry, cells: Iterable<FogCell>): CellShape[] {
  const lattice = cellGrid(grid);
  if (!lattice) return [];
  const distinct = new Map<string, FogCell>();
  for (const cell of cells) {
    if (Number.isSafeInteger(cell.i) && Number.isSafeInteger(cell.j)) distinct.set(cellKey(cell), cell);
  }
  const list = [...distinct.values()];
  const rings = outlineRings(lattice, list) ?? lattice.pieces(list).flatMap((piece) => outlineRings(lattice, piece) ?? []);
  return rings.map((ring) => shapeOf(lattice, ring));
}

/** One drag of the Cells shape: the cells it has passed so far, and the fog shapes that cover them. */
export class CellStroke {
  private grid: GridGeometry | null = null;
  private readonly cells = new Map<string, FogCell>();
  private last: Point | null = null;
  /** The shapes of the cells passed, until another cell is passed. */
  private made: CellShape[] | null = null;

  /** A drag is under way. */
  get active(): boolean {
    return this.grid !== null;
  }

  /** Begins a drag at `point` on `grid`; none begins on a grid without cells. */
  begin(grid: GridGeometry, point: Point): void {
    this.cancel();
    if (!hasCells(grid) || !isPlace(point)) return;
    this.grid = grid;
    this.pass(point, point);
  }

  /** The drag went on to `point`. True where it passed a cell it had not passed before. */
  extend(point: Point): boolean {
    if (!this.last || !isPlace(point)) return false;
    return this.pass(this.last, point);
  }

  /** The fog shapes that cover the cells passed so far (`cellShapes`). */
  shapes(): readonly CellShape[] {
    if (!this.grid) return [];
    return this.made ??= cellShapes(this.grid, this.cells.values());
  }

  /** Ends the drag and hands over its shapes. */
  finish(): readonly CellShape[] {
    const shapes = this.shapes();
    this.cancel();
    return shapes;
  }

  /** Drops the drag. */
  cancel(): void {
    this.grid = null;
    this.cells.clear();
    this.last = null;
    this.made = null;
  }

  private pass(from: Point, to: Point): boolean {
    if (!this.grid) return false;
    let added = false;
    for (const cell of cellsOnSegment(this.grid, from, to)) {
      const key = cellKey(cell);
      if (this.cells.has(key)) continue;
      this.cells.set(key, cell);
      added = true;
    }
    this.last = { x: to.x, y: to.y };
    if (added) this.made = null;
    return added;
  }
}
