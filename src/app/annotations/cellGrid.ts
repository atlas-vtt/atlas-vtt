/**
 * A grid's cells as the Cells mode fills them: which cell a point lies in, which cells a stretch
 * of the pointer's path passes through, and each cell's outline. The cells are the lattice's own
 * (`CellLattice`, which numbers them and places the grid's lines), squares and both hex
 * orientations alike, so a fill and the grid's lines cannot disagree.
 *
 * A corner that cells share is worked out once, from one cell, whichever cell asks: neighbouring
 * outlines then meet in the very same numbers, and their fills join without a seam.
 */

import type { CellLattice, MapRect } from '../grid/cellNumbering';
import type { GridGeometry } from '../grid/gridDistance';
import { axialToPixel, createHexLayout, hexVertices, isHexGridType, nearestHexCenter, pixelToAxial, type AxialCoord, type HexLayout } from '../grid/hexGeometry';
import { hexLattice } from '../grid/hexLattice';
import { squareCellCentre, squareLattice, type SquareGrid } from '../grid/squareLattice';
import { MAX_Q, Q_SCALE } from '../types/shapeTypes';
import type { Point } from '../types/visionTypes';

/** One cell of a grid. */
export interface GridCell {
  /** What the lattice calls it. */
  readonly key: string;
  /** Its corners in turn, world pixels; the last joins the first. */
  readonly outline: readonly Point[];
}

/** The cells of one grid. */
export interface CellGrid {
  /** A cell's size: a square's side, a hex's distance from flat to flat. */
  readonly size: number;
  /** The cell `point` lies in; null beyond where a fill can be worked out. */
  cellAt(point: Point): GridCell | null;
  /** The cells whose centres lie in the box. */
  cellsIn(minX: number, minY: number, maxX: number, maxY: number): GridCell[];
}

/** How far from the origin a cell can be filled: where the clipping grid ends. */
const REACH = MAX_Q / Q_SCALE;
/** The whole of what can be filled, as the map the lattice is asked for. */
const EVERYWHERE: MapRect = { x: -REACH, y: -REACH, width: 2 * REACH, height: 2 * REACH };

/**
 * Which hex's own corner each corner of a hex is, as `hexVertices` counts them: its top or its
 * bottom on a pointy grid, its right or its left on a flat one (corners 0 and 3). Every corner of
 * the grid is that corner of exactly one hex.
 */
const CORNER_OWNERS: Readonly<Record<HexLayout['orientation'], readonly (readonly [dq: number, dr: number, corner: 0 | 3])[]>> = {
  pointy: [[0, 0, 0], [1, -1, 3], [0, 1, 0], [0, 0, 3], [-1, 1, 0], [0, -1, 3]],
  flat: [[0, 0, 0], [1, 0, 3], [-1, 1, 0], [0, 0, 3], [-1, 0, 0], [1, -1, 3]],
};

function hexOutline(layout: HexLayout, hex: AxialCoord): Point[] {
  return CORNER_OWNERS[layout.orientation].map(([dq, dr, corner]) => hexVertices(layout, axialToPixel(layout, { q: hex.q + dq, r: hex.r + dr }))[corner]!);
}

function squareOutline({ size, offsetX, offsetY }: SquareGrid, centre: Point): Point[] {
  const column = Math.round((centre.x - offsetX) / size - 0.5);
  const row = Math.round((centre.y - offsetY) / size - 0.5);
  const [left, right, top, bottom] = [offsetX + column * size, offsetX + (column + 1) * size, offsetY + row * size, offsetY + (row + 1) * size];
  return [{ x: left, y: top }, { x: right, y: top }, { x: right, y: bottom }, { x: left, y: bottom }];
}

/** The cells of `lattice`: `centreOf` is the centre of the cell a point lies in, `outlineOf` a cell's outline by its centre. */
function cellsOf(lattice: CellLattice, centreOf: (point: Point) => Point, outlineOf: (centre: Point) => Point[]): CellGrid {
  const known = new Map<string, GridCell>();
  const cellsIn = (minX: number, minY: number, maxX: number, maxY: number): GridCell[] =>
    lattice.cellsInRect(EVERYWHERE, { x: minX, y: minY, width: maxX - minX, height: maxY - minY }).map(({ key, center }) => {
      let cell = known.get(key);
      if (!cell) known.set(key, cell = { key, outline: outlineOf(center) });
      return cell;
    });
  const reach = lattice.size / 4;
  return {
    size: lattice.size,
    cellsIn,
    cellAt: (point) => {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
      const { x, y } = centreOf(point);
      return cellsIn(x - reach, y - reach, x + reach, y + reach)[0] ?? null;
    },
  };
}

/** The cells of `grid`; null for a grid without a cell size. */
export function cellGrid(grid: GridGeometry): CellGrid | null {
  const { size } = grid;
  if (!(size > 0) || !Number.isFinite(size)) return null;
  const offsetX = grid.offsetX ?? 0;
  const offsetY = grid.offsetY ?? 0;
  if (isHexGridType(grid.type)) {
    const layout = createHexLayout(grid.type, size, offsetX, offsetY);
    return cellsOf(hexLattice(layout), (point) => nearestHexCenter(layout, point), (centre) => hexOutline(layout, pixelToAxial(layout, centre)));
  }
  const square: SquareGrid = { size, offsetX, offsetY };
  return cellsOf(squareLattice(size, offsetX, offsetY), (point) => squareCellCentre(square, point), (centre) => squareOutline(square, centre));
}

/** The cells one piece of a long way is as long as (`cellsCrossed`). */
const PIECE_CELLS = 8;

const along = (from: Point, to: Point, share: number): Point => ({ x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share });

/**
 * Whether the stretch from `from` to `to` passes through the inside of the convex `outline`: more
 * than a touch of its edge or of a corner.
 */
function passesThrough(outline: readonly Point[], from: Point, to: Point): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  let turn = 0;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    turn += a.x * b.y - b.x * a.y;
  }
  const inward = turn >= 0 ? 1 : -1;
  let enters = 0;
  let leaves = 1;
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const ex = b.x - a.x;
    const ey = b.y - a.y;
    // How far inside this edge the stretch starts, and how fast it goes further in.
    const start = inward * (ex * (from.y - a.y) - ey * (from.x - a.x));
    const gain = inward * (ex * dy - ey * dx);
    if (gain === 0) {
      if (start <= 0) return false;
    } else if (gain > 0) {
      enters = Math.max(enters, -start / gain);
    } else {
      leaves = Math.min(leaves, -start / gain);
    }
    if (enters >= leaves) return false;
  }
  return true;
}

/**
 * The cells the pointer passed on its way from `from` to `to` in a straight line: the cells its
 * two ends lie in and every cell whose inside the way between crosses. A cell it only touches at
 * an edge or a corner is not among them.
 */
export function cellsCrossed(grid: CellGrid, from: Point, to: Point): GridCell[] {
  const crossed = new Map<string, GridCell>();
  const take = (cell: GridCell | null): void => {
    if (cell) crossed.set(cell.key, cell);
  };
  take(grid.cellAt(from));
  if (from.x === to.x && from.y === to.y) return [...crossed.values()];
  take(grid.cellAt(to));
  // A cell the way crosses has its centre no farther from it than its own corners are from its centre: less than a cell.
  const reach = grid.size;
  // A long way is looked at a piece at a time: the box around all of it would hold every cell beside it too.
  const pieces = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / (PIECE_CELLS * grid.size)));
  if (!Number.isFinite(pieces)) return [...crossed.values()];
  for (let piece = 0; piece < pieces; piece++) {
    const a = along(from, to, piece / pieces);
    const b = along(from, to, (piece + 1) / pieces);
    for (const cell of grid.cellsIn(Math.min(a.x, b.x) - reach, Math.min(a.y, b.y) - reach, Math.max(a.x, b.x) + reach, Math.max(a.y, b.y) + reach)) {
      if (!crossed.has(cell.key) && passesThrough(cell.outline, from, to)) crossed.set(cell.key, cell);
    }
  }
  return [...crossed.values()];
}
