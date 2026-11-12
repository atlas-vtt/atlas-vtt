/**
 * The outline of everything within a distance of a token or a point, as the map counts distances.
 *
 * Where tokens stand on cells, a distance is counted from the nearest cell of the token's footprint
 * (`distanceBetweenTokens`), so the outline is that of the cells within reach: a token standing on
 * a cell inside it is in range. That is a square under equidistant diagonals, a stepped octagon
 * under alternating ones, a stepped diamond under Manhattan, a stepped circle under Euclidean,
 * and a ring of hexes on a hex grid. Where tokens stand anywhere (Snap off), and for a reach of
 * more cells than are worth counting, it is the circle that far from the token's edge.
 */

import { cellsByRule } from '../grid/gridDistance';
import { hexCircumradius, hexOriginCenter, pixelToAxial, type HexLayout } from '../grid/hexGeometry';
import type { DiagonalRule } from '../types/collectionSettingsTypes';
import type { Point } from '../types/visionTypes';
import { cellCentreAt, hexLayoutOf } from './measureGrid';
import { cellsStoodOn, placementGridOf } from './measureTokens';
import { countsCells, spaceRadius, type TokenGrid } from './tokenDistance';

/** What a range is drawn around: a token by its place and size, or a point (no `size`). */
export interface RangeOrigin {
  readonly x: number;
  readonly y: number;
  readonly size?: number | undefined;
}

/** A range's outline in world pixels, around `centre`: a circle, or the closed outlines of the cells within reach. */
export type RangeOutline =
  | { readonly kind: 'circle'; readonly centre: Point; readonly radius: number }
  | { readonly kind: 'cells'; readonly centre: Point; readonly loops: readonly (readonly Point[])[] };

/** The most cells a range may hold for its cells to be counted; a longer one is drawn as a circle. */
export const MAX_RANGE_CELLS = 16_384;

/** A cell, or a corner, by whole numbers. */
type Pair = readonly [number, number];

/** A grid whose cells and corners are whole numbers, so a corner that cells share is one pair for all of them. */
interface CornerLattice {
  /** A cell's corners, clockwise on screen. */
  corners(cell: Pair): Pair[];
  /** Where a corner lies in world pixels. */
  world(corner: Pair): Point;
}

const POINTY_CORNERS: readonly Pair[] = [[0, -2], [1, -1], [1, 1], [0, 2], [-1, 1], [-1, -1]];
const FLAT_CORNERS: readonly Pair[] = [[2, 0], [1, 1], [-1, 1], [-2, 0], [-1, -1], [1, -1]];

function squareLattice(grid: TokenGrid): CornerLattice {
  const offsetX = grid.offsetX ?? 0;
  const offsetY = grid.offsetY ?? 0;
  return {
    corners: ([column, row]) => [[column, row], [column + 1, row], [column + 1, row + 1], [column, row + 1]],
    world: ([x, y]) => ({ x: offsetX + x * grid.size, y: offsetY + y * grid.size }),
  };
}

/** A hex grid's corners lie half a hex's width apart one way and half its circumradius the other. */
function hexLattice(layout: HexLayout): CornerLattice {
  const origin = hexOriginCenter(layout);
  const half = layout.size / 2;
  const quarter = hexCircumradius(layout.size) / 2;
  if (layout.orientation === 'pointy') {
    return {
      corners: ([q, r]) => POINTY_CORNERS.map(([x, y]) => [2 * q + r + x, 3 * r + y]),
      world: ([x, y]) => ({ x: origin.x + x * half, y: origin.y + y * quarter }),
    };
  }
  return {
    corners: ([q, r]) => FLAT_CORNERS.map(([x, y]) => [3 * q + x, 2 * r + q + y]),
    world: ([x, y]) => ({ x: origin.x + x * quarter, y: origin.y + y * half }),
  };
}

/** The squares within `reach` cells of the block of squares `stood` covers, by the diagonal rule; null where they are too many. */
function squaresWithin(stood: readonly Point[], reach: number, grid: TokenGrid, rule: DiagonalRule): Pair[] | null {
  const columns = stood.map((cell) => Math.floor((cell.x - (grid.offsetX ?? 0)) / grid.size));
  const rows = stood.map((cell) => Math.floor((cell.y - (grid.offsetY ?? 0)) / grid.size));
  const [minColumn, maxColumn, minRow, maxRow] = [Math.min(...columns), Math.max(...columns), Math.min(...rows), Math.max(...rows)];
  // A step along one axis costs one cell under every rule, so nothing farther than this along an axis is in reach.
  const span = Math.floor(reach);
  if (!((maxColumn - minColumn + 1 + 2 * span) * (maxRow - minRow + 1 + 2 * span) <= MAX_RANGE_CELLS)) return null;
  const cells: Pair[] = [];
  for (let row = minRow - span; row <= maxRow + span; row++) {
    const dy = Math.max(0, minRow - row, row - maxRow);
    for (let column = minColumn - span; column <= maxColumn + span; column++) {
      const dx = Math.max(0, minColumn - column, column - maxColumn);
      const cost = cellsByRule({ straight: Math.abs(dx - dy), diagonal: Math.min(dx, dy), euclidean: Math.hypot(dx, dy) }, rule);
      if (cost <= reach) cells.push([column, row]);
    }
  }
  return cells;
}

/** The hexes within `reach` steps of one of the hexes `stood` covers; null where they are too many. */
function hexesWithin(stood: readonly Point[], reach: number, layout: HexLayout): Pair[] | null {
  const span = Math.floor(reach);
  if (!(stood.length * (3 * span * (span + 1) + 1) <= MAX_RANGE_CELLS)) return null;
  const cells = new Map<string, Pair>();
  for (const centre of stood) {
    const { q, r } = pixelToAxial(layout, centre);
    for (let dq = -span; dq <= span; dq++) {
      for (let dr = Math.max(-span, -dq - span); dr <= Math.min(span, -dq + span); dr++) cells.set(`${q + dq},${r + dr}`, [q + dq, r + dr]);
    }
  }
  return [...cells.values()];
}

/** Drops the corners a straight run passes through. */
function withoutStraightCorners(loop: readonly Pair[]): Pair[] {
  return loop.filter(([x, y], index) => {
    const [beforeX, beforeY] = loop[(index + loop.length - 1) % loop.length]!;
    const [afterX, afterY] = loop[(index + 1) % loop.length]!;
    return (x - beforeX) * (afterY - y) !== (y - beforeY) * (afterX - x);
  });
}

/**
 * The closed outlines around `cells`: every cell's edges, less the edges two cells share (a
 * neighbour walks the same edge the other way), joined end to start. The cells of a range reach
 * back to its middle side by side, so none touch at a corner alone and every corner on the
 * outline has one edge leaving it.
 */
function outlinesOf(cells: readonly Pair[], lattice: CornerLattice): Point[][] {
  const corners = cells.map((cell) => lattice.corners(cell));
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, y] of corners.flat()) {
    [minX, minY, maxX, maxY] = [Math.min(minX, x), Math.min(minY, y), Math.max(maxX, x), Math.max(maxY, y)];
  }
  const height = maxY - minY + 1;
  const count = (maxX - minX + 1) * height;
  const idOf = ([x, y]: Pair): number => (x - minX) * height + (y - minY);
  const cornerOf = (id: number): Pair => [minX + Math.floor(id / height), minY + (id % height)];
  /** The edges no neighbour shares yet, each named by its two corners and holding its end. */
  const edges = new Map<number, number>();
  for (const list of corners) {
    list.forEach((corner, index) => {
      const from = idOf(corner);
      const to = idOf(list[(index + 1) % list.length]!);
      if (!edges.delete(to * count + from)) edges.set(from * count + to, to);
    });
  }
  const next = new Map<number, number>();
  for (const [edge, to] of edges) next.set(Math.floor(edge / count), to);
  const loops: Point[][] = [];
  while (next.size > 0) {
    const loop: Pair[] = [];
    let at: number | undefined = next.keys().next().value;
    while (at !== undefined && next.has(at)) {
      loop.push(cornerOf(at));
      const to: number | undefined = next.get(at);
      next.delete(at);
      at = to;
    }
    if (loop.length >= 3) loops.push(withoutStraightCorners(loop).map((corner) => lattice.world(corner)));
  }
  return loops;
}

/**
 * The outline of everything within `reach` cells of `origin` on `grid`, by the map's diagonal
 * rule (see the top of this file); null for a reach or a grid that is none.
 */
export function rangeOutline(origin: RangeOrigin, reach: number, grid: TokenGrid, diagonalRule: DiagonalRule): RangeOutline | null {
  if (!(reach > 0) || !Number.isFinite(reach) || !(grid.size > 0) || !Number.isFinite(origin.x) || !Number.isFinite(origin.y)) return null;
  const token = origin.size === undefined ? null : { size: origin.size };
  const place = { x: origin.x, y: origin.y };
  if (!countsCells(grid)) return { kind: 'circle', centre: place, radius: (token ? spaceRadius(token, grid) : 0) + reach * grid.size };
  // A point stands for the cell it lies in.
  const centre = token ? place : cellCentreAt(grid, place);
  const stood = token ? cellsStoodOn(place, origin.size || 1, placementGridOf(grid)) : [centre];
  const layout = hexLayoutOf(grid);
  const cells = layout ? hexesWithin(stood, reach, layout) : squaresWithin(stood, reach, grid, diagonalRule);
  if (!cells) return { kind: 'circle', centre, radius: (token ? spaceRadius(token, grid) : grid.size / 2) + reach * grid.size };
  return { kind: 'cells', centre, loops: outlinesOf(cells, layout ? hexLattice(layout) : squareLattice(grid)) };
}

/**
 * Where the outline lies in the direction `angle` (radians, clockwise from the right on screen)
 * from its middle: the farthest point of it that way, where a label can stand on its line.
 */
export function outlinePointAt(outline: RangeOutline, angle: number): Point {
  const { centre } = outline;
  const direction = { x: Math.cos(angle), y: Math.sin(angle) };
  if (outline.kind === 'circle') return { x: centre.x + direction.x * outline.radius, y: centre.y + direction.y * outline.radius };
  let farthest = 0;
  for (const loop of outline.loops) {
    loop.forEach((from, index) => {
      const to = loop[(index + 1) % loop.length]!;
      const edge = { x: to.x - from.x, y: to.y - from.y };
      const across = direction.x * edge.y - direction.y * edge.x;
      if (across === 0) return;
      const along = ((from.x - centre.x) * edge.y - (from.y - centre.y) * edge.x) / across;
      const share = ((from.x - centre.x) * direction.y - (from.y - centre.y) * direction.x) / across;
      if (share >= 0 && share <= 1 && along > farthest) farthest = along;
    });
  }
  return { x: centre.x + direction.x * farthest, y: centre.y + direction.y * farthest };
}
