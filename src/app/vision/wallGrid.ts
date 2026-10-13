import type { WallSegment } from '../types/wallTypes';
import { distinctEnds } from './distinctEnds';

/**
 * How near a wall must come to a cell to be listed in it: far more than any rounding of where
 * a ray meets a wall, so the cell a hit lies in always lists the wall it lies on.
 */
export const GRID_MARGIN = 1e-3;
/** Most cells along a side. */
const MAX_SIDE = 512;
/** Cells are made larger until the walls are listed at most this many times each on average. */
const MAX_LISTED = 8;
/** How many grids are kept: one per wall array, the arrays used last. */
const KEPT = 4;
/**
 * Farthest place from zero (px) a grid works with, over a hundred times the largest map; walls or
 * sweeps beyond it are left to the full sweep. A grid's answers rest on `GRID_MARGIN`, which must
 * stay far above the rounding of a ray's hit (some parts in 10¹¹ of its length) and above the
 * distance between two numbers a place can take: both hold with room to spare this near zero.
 */
const MAX_PLACE = 1e6;
/** Longest radius a sweep through a grid may have: a ray's reach is a wall's or the radius itself, so it only has to be a number a walk can end at. */
const MAX_RADIUS = 1e15;

/** Memory a sweep reuses from one call to the next on the same walls. */
export interface GridScratch {
  /** Per wall: the walk that last looked at it, so a walk tests a wall once. */
  seen: Uint32Array;
  walk: number;
  /** Per wall: the call that found it in reach. */
  inReach: Uint32Array;
  call: number;
  /** Per wall in reach: the angles it covers (`covers`). */
  from: Float64Array;
  to: Float64Array;
  wraps: Uint8Array;
  /** Per distinct end: the call that worked out its bearing, the bearing, and whether it is hidden (0 unknown, 1 hidden, 2 in view). */
  endCall: Uint32Array;
  endAngle: Float64Array;
  endHidden: Uint8Array;
  /** The walls in reach of the current call. */
  reach: Int32Array;
}

/** The walls of an array listed by the square cells of a grid over them. */
export interface WallGrid {
  /** The array, and its walls as they were when the grid was built. */
  walls: readonly WallSegment[];
  kept: readonly WallSegment[];
  /** Per wall: x1, y1, x2, y2. */
  coords: Float64Array;
  /** Per wall end (2 × wall, + 1 for p2): its place among the distinct ends. */
  ends: Int32Array;
  endCount: number;
  minX: number;
  minY: number;
  cell: number;
  cols: number;
  rows: number;
  /** Per cell, where its walls begin in `items` (and, one further, end). */
  starts: Int32Array;
  items: Int32Array;
  scratch: GridScratch;
}

/** Calls `each(row, firstCol, lastCol)` for the cells within `margin` of the segment, row by row. */
export function forCellRows(grid: Pick<WallGrid, 'minX' | 'minY' | 'cell' | 'cols' | 'rows'>, x1: number, y1: number, x2: number, y2: number, margin: number, each: (row: number, first: number, last: number) => void): void {
  const { minX, minY, cell, cols, rows } = grid;
  const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
  const firstRow = clamp(Math.floor((lo - margin - minY) / cell), rows), lastRow = clamp(Math.floor((hi + margin - minY) / cell), rows);
  for (let r = firstRow; r <= lastRow; r++) {
    const top = minY + r * cell;
    const ya = Math.min(hi, Math.max(lo, top - margin)), yb = Math.max(lo, Math.min(hi, top + cell + margin));
    let xa: number, xb: number;
    if (y1 === y2) {
      xa = x1;
      xb = x2;
    } else {
      xa = x1 + (x2 - x1) * Math.min(1, Math.max(0, (ya - y1) / (y2 - y1)));
      xb = x1 + (x2 - x1) * Math.min(1, Math.max(0, (yb - y1) / (y2 - y1)));
    }
    each(r, clamp(Math.floor((Math.min(xa, xb) - margin - minX) / cell), cols), clamp(Math.floor((Math.max(xa, xb) + margin - minX) / cell), cols));
  }
}

function clamp(index: number, size: number): number {
  return index < 0 ? 0 : index >= size ? size - 1 : index;
}

type Frame = Pick<WallGrid, 'minX' | 'minY' | 'cell' | 'cols' | 'rows'>;

/** How many times the walls would be listed with cells of `cell`, or more than `limit` once that is passed. */
function listings(coords: Float64Array, frame: Frame, margin: number, limit: number): number {
  let total = 0;
  for (let i = 0; i < coords.length && total <= limit; i += 4) {
    forCellRows(frame, coords[i]!, coords[i + 1]!, coords[i + 2]!, coords[i + 3]!, margin, (_, first, last) => { total += last - first + 1; });
  }
  return total;
}

/** A frame over the walls with cells as wide as a wall is long on average, at most `MAX_SIDE` a side and `MAX_LISTED` listings a wall. */
function frameOf(coords: Float64Array, margin: number): Frame {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity, length = 0;
  for (let i = 0; i < coords.length; i += 4) {
    minX = Math.min(minX, coords[i]!, coords[i + 2]!);
    maxX = Math.max(maxX, coords[i]!, coords[i + 2]!);
    minY = Math.min(minY, coords[i + 1]!, coords[i + 3]!);
    maxY = Math.max(maxY, coords[i + 1]!, coords[i + 3]!);
    length += Math.hypot(coords[i + 2]! - coords[i]!, coords[i + 3]! - coords[i + 1]!);
  }
  const count = coords.length / 4;
  if (count === 0) return { minX: 0, minY: 0, cell: 1, cols: 1, rows: 1 };
  const pad = 2 * margin;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const width = maxX - minX, height = maxY - minY, extent = Math.max(width, height);
  let cell = Math.max(length / count, (extent / MAX_SIDE) * (1 + 1e-9), extent * 1e-12);
  for (;;) {
    const frame = { minX, minY, cell, cols: Math.max(1, Math.ceil(width / cell)), rows: Math.max(1, Math.ceil(height / cell)) };
    if ((frame.cols === 1 && frame.rows === 1) || listings(coords, frame, margin, MAX_LISTED * count) <= MAX_LISTED * count) return frame;
    cell *= 2;
  }
}

function coordsOf(walls: readonly WallSegment[]): Float64Array {
  const coords = new Float64Array(walls.length * 4);
  walls.forEach((wall, i) => {
    coords[i * 4] = wall.p1.x;
    coords[i * 4 + 1] = wall.p1.y;
    coords[i * 4 + 2] = wall.p2.x;
    coords[i * 4 + 3] = wall.p2.y;
  });
  return coords;
}

/** A grid over `walls`, each listed in every cell it comes within `margin` of. */
export function buildWallGrid(walls: readonly WallSegment[], margin = GRID_MARGIN): WallGrid {
  const coords = coordsOf(walls);
  const frame = frameOf(coords, margin);
  const cells = frame.cols * frame.rows;
  const starts = new Int32Array(cells + 1);
  const rowsOf = (i: number, each: (row: number, first: number, last: number) => void): void => forCellRows(frame, coords[i * 4]!, coords[i * 4 + 1]!, coords[i * 4 + 2]!, coords[i * 4 + 3]!, margin, each);
  for (let i = 0; i < walls.length; i++) rowsOf(i, (row, first, last) => { for (let c = first; c <= last; c++) starts[row * frame.cols + c + 1]!++; });
  for (let c = 0; c < cells; c++) starts[c + 1]! += starts[c]!;
  const items = new Int32Array(starts[cells]!);
  const fill = starts.slice(0, cells);
  for (let i = 0; i < walls.length; i++) rowsOf(i, (row, first, last) => { for (let c = first; c <= last; c++) items[fill[row * frame.cols + c]!++] = i; });
  const { ends, count } = distinctEnds(coords);
  const n = walls.length;
  return {
    walls, kept: [...walls], coords, ends, endCount: count, ...frame, starts, items,
    scratch: {
      seen: new Uint32Array(n), walk: 0, inReach: new Uint32Array(n), call: 0,
      from: new Float64Array(n), to: new Float64Array(n), wraps: new Uint8Array(n),
      endCall: new Uint32Array(count), endAngle: new Float64Array(count), endHidden: new Uint8Array(count),
      reach: new Int32Array(n),
    },
  };
}

/** Whether every wall of `walls` is the one the grid was built with, at the same place. */
function unchanged(grid: WallGrid, walls: readonly WallSegment[]): boolean {
  if (walls.length !== grid.kept.length) return false;
  const { coords } = grid;
  for (let i = 0; i < walls.length; i++) {
    const wall = walls[i]!;
    if (wall !== grid.kept[i] || !Object.is(wall.p1.x, coords[i * 4]) || !Object.is(wall.p1.y, coords[i * 4 + 1]) || !Object.is(wall.p2.x, coords[i * 4 + 2]) || !Object.is(wall.p2.y, coords[i * 4 + 3])) return false;
  }
  return true;
}

/**
 * Whether `value` is a number a grid can place: within `MAX_PLACE` of zero. Every number a grid
 * and its walks work out from such numbers stays finite, so every walk ends, and exact enough for
 * the cells along a ray to list every wall it may stop on.
 */
export function placeableNumber(value: number): boolean {
  return Math.abs(value) <= MAX_PLACE;
}

/** Whether a sweep through a grid may reach `radius` far: no less than zero and no more than `MAX_RADIUS`. */
export function sweepableRadius(radius: number): boolean {
  return radius >= 0 && radius <= MAX_RADIUS;
}

function placeable(walls: readonly WallSegment[]): boolean {
  return walls.every((wall) => placeableNumber(wall.p1.x) && placeableNumber(wall.p1.y) && placeableNumber(wall.p2.x) && placeableNumber(wall.p2.y));
}

const grids: WallGrid[] = [];

/**
 * The grid over `walls`, kept for the arrays used last: built again whenever a wall of the array
 * was replaced or moved since, so it never answers for walls that are no longer there. Null for
 * walls that cannot be placed on a grid.
 */
export function wallGridOf(walls: readonly WallSegment[]): WallGrid | null {
  const at = grids.findIndex((grid) => grid.walls === walls);
  if (at >= 0) {
    const [grid] = grids.splice(at, 1);
    if (unchanged(grid!, walls)) {
      grids.unshift(grid!);
      return grid!;
    }
  }
  if (!placeable(walls)) return null;
  const grid = buildWallGrid(walls);
  grids.unshift(grid);
  grids.length = Math.min(grids.length, KEPT);
  return grid;
}
