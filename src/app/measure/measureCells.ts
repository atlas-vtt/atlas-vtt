/**
 * The cells an area covers on a square or hex grid, by the collection's rule (`AreaCellRule`).
 *
 * Only the cells around the area's bounds are looked at. A cell the outline does not come near
 * lies whole inside or outside, which its centre tells. A cell on the outline is cut with it:
 * `centre` asks the area itself about the cell's centre, `half` and `any` measure how much of the
 * cell the outline holds. A line also covers every cell its middle line runs through, whatever the
 * rule, so it never skips a cell along its length.
 */

import type { GridGeometry } from '../grid/gridDistance';
import { hexCircumradius, hexOriginCenter, hexVertices } from '../grid/hexGeometry';
import { distToSeg, type Seg } from '../lighting/segments';
import type { Point } from '../types/visionTypes';
import type { Box } from '../vision/polygonBounds';
import type { AreaCellRule } from './areaRules';
import { EDGE_TOLERANCE, type MeasureArea } from './measureGeometry';
import { hexLayoutOf } from './measureGrid';

/** A cell of the grid: its name (`cellKeyAt`) and its centre in world pixels. */
export interface AreaCell {
  readonly key: string;
  readonly centre: Point;
}

/** The most cells an area's bounds may hold for its cells to be counted: a larger one (a damaged file, a drag across a huge map) has none. */
export const MAX_AREA_CELLS = 65_536;

/** How far a covered share may miss its mark, as a share of a cell: half a cell worked out as 0.4999999999 is half. */
const SHARE_TOLERANCE = 1e-9;
/** Cells of a line are told apart by their index below this; lines by multiples of it. */
const STRIDE = 2 ** 21;

/**
 * A grid as lines of cells: a square grid's rows, a pointy hex grid's rows, a flat hex grid's
 * columns. Cell `index` of line `line` has its centre at `acrossOrigin + spacing * line` across
 * the lines and at `alongOrigin + pitch * (index + stagger * line)` along them.
 */
interface Lattice {
  /** Lines run along x (rows); otherwise along y (columns). */
  readonly rows: boolean;
  readonly spacing: number;
  readonly pitch: number;
  readonly acrossOrigin: number;
  readonly alongOrigin: number;
  readonly stagger: number;
  /** From a cell's centre to its corners. */
  readonly circumradius: number;
  readonly area: number;
  /** A cell's corners around its centre as x, y pairs, in the order that keeps the cell on the side `cut` counts as inside. */
  readonly corners: readonly number[];
  key(line: number, index: number): string;
}

function latticeOf(grid: GridGeometry): Lattice {
  const { size } = grid;
  const layout = hexLayoutOf(grid);
  if (!layout) {
    const half = size / 2;
    return {
      rows: true,
      spacing: size,
      pitch: size,
      acrossOrigin: (grid.offsetY ?? 0) + half,
      alongOrigin: (grid.offsetX ?? 0) + half,
      stagger: 0,
      circumradius: half * Math.SQRT2,
      area: size * size,
      corners: [-half, -half, half, -half, half, half, -half, half],
      key: (row, column) => `${column},${row}`,
    };
  }
  const pointy = layout.orientation === 'pointy';
  const radius = hexCircumradius(size);
  const centre = hexOriginCenter(layout);
  return {
    rows: pointy,
    spacing: 1.5 * radius,
    pitch: size,
    acrossOrigin: pointy ? centre.y : centre.x,
    alongOrigin: pointy ? centre.x : centre.y,
    stagger: 0.5,
    circumradius: radius,
    area: (Math.sqrt(3) / 2) * size * size,
    corners: hexVertices(layout, { x: 0, y: 0 }).flatMap((corner) => [corner.x, corner.y]),
    // A hex's `axialKey`: its line is r on a pointy grid and q on a flat one.
    key: (line, index) => (pointy ? `${index},${line}` : `${line},${index}`),
  };
}

/** The lines whose cells have their centre within `margin` of `min` to `max` across the lines. */
function linesWithin(lattice: Lattice, min: number, max: number, margin: number): [first: number, last: number] {
  return [Math.ceil((min - margin - lattice.acrossOrigin) / lattice.spacing), Math.floor((max + margin - lattice.acrossOrigin) / lattice.spacing)];
}

/** The cells of `line` whose centre lies within `margin` of `min` to `max` along the line. */
function indicesWithin(lattice: Lattice, line: number, min: number, max: number, margin: number): [first: number, last: number] {
  const shift = lattice.stagger * line;
  return [Math.ceil((min - margin - lattice.alongOrigin) / lattice.pitch - shift), Math.floor((max + margin - lattice.alongOrigin) / lattice.pitch - shift)];
}

/** The cells around an area's bounds. */
interface Span {
  readonly firstLine: number;
  readonly lastLine: number;
  readonly minAlong: number;
  readonly maxAlong: number;
  readonly margin: number;
  /** Below every index of the span, so `cellId` never goes negative. */
  readonly indexBase: number;
}

/** The cells whose centre lies within `margin` of `bounds`; null where they are more than `MAX_AREA_CELLS`. */
function spanOf(lattice: Lattice, bounds: Box, margin: number): Span | null {
  const [minAcross, maxAcross, minAlong, maxAlong] = lattice.rows ? [bounds.minY, bounds.maxY, bounds.minX, bounds.maxX] : [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY];
  const [firstLine, lastLine] = linesWithin(lattice, minAcross, maxAcross, margin);
  const lines = lastLine - firstLine + 1;
  const perLine = (maxAlong - minAlong + 2 * margin) / lattice.pitch + 1;
  if (!(lines * perLine <= MAX_AREA_CELLS)) return null;
  const indexBase = indicesWithin(lattice, Math.max(firstLine, lastLine), minAlong, maxAlong, margin)[0] - 1;
  return { firstLine, lastLine, minAlong, maxAlong, margin, indexBase };
}

function cellId(span: Span, line: number, index: number): number {
  return (line - span.firstLine) * STRIDE + (index - span.indexBase);
}

/** Calls `visit` for every cell of `span` whose centre lies within a cell's circumradius of `edge`: every cell the edge touches is among them. */
function eachCellNear(lattice: Lattice, span: Span, edge: Seg, visit: (line: number, index: number, x: number, y: number) => void): void {
  const reach = lattice.circumradius;
  const [fromAcross, toAcross, fromAlong, toAlong] = lattice.rows ? [edge[1], edge[3], edge[0], edge[2]] : [edge[0], edge[2], edge[1], edge[3]];
  const [first, last] = linesWithin(lattice, Math.min(fromAcross, toAcross), Math.max(fromAcross, toAcross), reach);
  for (let line = Math.max(first, span.firstLine); line <= Math.min(last, span.lastLine); line++) {
    const across = lattice.acrossOrigin + lattice.spacing * line;
    const [start, end] = indicesWithin(lattice, line, Math.min(fromAlong, toAlong), Math.max(fromAlong, toAlong), reach);
    for (let index = start; index <= end; index++) {
      const along = lattice.alongOrigin + lattice.pitch * (index + lattice.stagger * line);
      const x = lattice.rows ? along : across;
      const y = lattice.rows ? across : along;
      if (distToSeg(x, y, edge) <= reach) visit(line, index, x, y);
    }
  }
}

/** The cells of `span` the outline comes near. */
function cellsOnOutline(lattice: Lattice, span: Span, rings: readonly Float64Array[]): Set<number> {
  const marked = new Set<number>();
  for (const ring of rings) {
    for (let i = 0; i < ring.length; i += 2) {
      const j = (i + 2) % ring.length;
      eachCellNear(lattice, span, [ring[i]!, ring[i + 1]!, ring[j]!, ring[j + 1]!], (line, index) => marked.add(cellId(span, line, index)));
    }
  }
  return marked;
}

/** How a way meets a cell: not at all (a corner or a point of a side is no meeting), along one of its sides, or through its inside. */
type Meeting = 'none' | 'beside' | 'inside';

/** How far inside the side of a cell from corner `c` on the point (`px`, `py`) lies, the cell being around (`x`, `y`). */
function depthAtSide(corners: readonly number[], c: number, x: number, y: number, px: number, py: number): number {
  const ex = corners[(c + 2) % corners.length]! - corners[c]!;
  const ey = corners[(c + 3) % corners.length]! - corners[c + 1]!;
  return (ex * (py - y - corners[c + 1]!) - ey * (px - x - corners[c]!)) / Math.hypot(ex, ey);
}

/**
 * How the way from `a` to `b` meets the cell around (`x`, `y`): the part of it within the cell
 * must have a length, and runs through the inside where its middle lies off every side.
 */
function meetingOf(corners: readonly number[], x: number, y: number, [ax, ay, bx, by]: Seg): Meeting {
  let enters = 0;
  let leaves = 1;
  for (let c = 0; c < corners.length; c += 2) {
    const from = depthAtSide(corners, c, x, y, ax, ay);
    const gain = depthAtSide(corners, c, x, y, bx, by) - from;
    // Along this side's direction the whole way: it lies on the cell's side of it, or misses the cell.
    if (Math.abs(gain) <= EDGE_TOLERANCE) {
      if (from < -EDGE_TOLERANCE) return 'none';
    } else if (gain > 0) enters = Math.max(enters, -from / gain);
    else leaves = Math.min(leaves, -from / gain);
  }
  if (!((leaves - enters) * Math.hypot(bx - ax, by - ay) > EDGE_TOLERANCE)) return 'none';
  const middle = (enters + leaves) / 2;
  const mx = ax + (bx - ax) * middle;
  const my = ay + (by - ay) * middle;
  for (let c = 0; c < corners.length; c += 2) {
    if (!(depthAtSide(corners, c, x, y, mx, my) > EDGE_TOLERANCE)) return 'beside';
  }
  return 'inside';
}

/**
 * The cells of `span` a line's middle line `spine` makes the line's: those it runs through the
 * inside of, and with them those it runs along a side of (between two hexes, the way to the next
 * one), so the cells hang together. A spine that runs through no cell (along a square grid's
 * line) makes none.
 */
function cellsOnSpine(lattice: Lattice, span: Span, [from, to]: readonly [Point, Point]): Set<number> {
  const inside = new Set<number>();
  const beside: number[] = [];
  const way: Seg = [from.x, from.y, to.x, to.y];
  eachCellNear(lattice, span, way, (line, index, x, y) => {
    const meeting = meetingOf(lattice.corners, x, y, way);
    if (meeting === 'inside') inside.add(cellId(span, line, index));
    else if (meeting === 'beside') beside.push(cellId(span, line, index));
  });
  if (inside.size > 0) beside.forEach((id) => inside.add(id));
  return inside;
}

// The outline as it is cut down to one cell, side by side: kept between calls so a pointer move allocates nothing for it.
let cutFrom: number[] = [];
let cutTo: number[] = [];

/**
 * The area of `ring` inside the cell around (`x`, `y`), with the sign of the ring's direction
 * (Sutherland and Hodgman's clipping: the ring is cut at each side of the cell in turn, which is
 * exact for any ring since the cell has no dent).
 */
function cut(ring: Float64Array, corners: readonly number[], x: number, y: number): number {
  cutFrom.length = 0;
  for (let i = 0; i < ring.length; i += 2) cutFrom.push(ring[i]! - x, ring[i + 1]! - y);
  for (let c = 0; c < corners.length && cutFrom.length > 0; c += 2) {
    const ax = corners[c]!;
    const ay = corners[c + 1]!;
    const ex = corners[(c + 2) % corners.length]! - ax;
    const ey = corners[(c + 3) % corners.length]! - ay;
    cutTo.length = 0;
    let px = cutFrom[cutFrom.length - 2]!;
    let py = cutFrom[cutFrom.length - 1]!;
    let before = ex * (py - ay) - ey * (px - ax);
    for (let i = 0; i < cutFrom.length; i += 2) {
      const qx = cutFrom[i]!;
      const qy = cutFrom[i + 1]!;
      const side = ex * (qy - ay) - ey * (qx - ax);
      if ((side >= 0) !== (before >= 0)) {
        const t = before / (before - side);
        cutTo.push(px + (qx - px) * t, py + (qy - py) * t);
      }
      if (side >= 0) cutTo.push(qx, qy);
      px = qx;
      py = qy;
      before = side;
    }
    [cutFrom, cutTo] = [cutTo, cutFrom];
  }
  let twice = 0;
  for (let i = 0; i < cutFrom.length; i += 2) {
    const j = (i + 2) % cutFrom.length;
    twice += cutFrom[i]! * cutFrom[j + 1]! - cutFrom[j]! * cutFrom[i + 1]!;
  }
  return twice / 2;
}

function flat(ring: readonly Point[]): Float64Array {
  const coordinates = new Float64Array(ring.length * 2);
  ring.forEach((point, i) => {
    coordinates[i * 2] = point.x;
    coordinates[i * 2 + 1] = point.y;
  });
  return coordinates;
}

/**
 * The cells `area` covers under `rule`, line by line. Null where cells are not counted: without a
 * grid (`grid` is null where the map has none or its Snap is off), and for an area whose bounds
 * hold more than `MAX_AREA_CELLS`. A cell half inside to the last bit counts as half, and a cell
 * the area only touches along an edge has no part in it. Whatever the rule, a line (an area with a
 * `spine`) also covers the cells its middle line runs through (`cellsOnSpine`).
 */
export function cellsInArea(grid: GridGeometry | null, area: MeasureArea, rule: AreaCellRule): readonly AreaCell[] | null {
  if (!grid || !(grid.size > 0)) return null;
  if (area.rings.length === 0) return [];
  const lattice = latticeOf(grid);
  const byCentre = rule === 'centre';
  const { spine } = area;
  // A cell the spine runs through may have its centre outside the area.
  const span = spanOf(lattice, area.bounds, byCentre && !spine ? EDGE_TOLERANCE : lattice.circumradius);
  if (!span) return null;
  const rings = byCentre ? [] : area.rings.map(flat);
  const onOutline = byCentre ? null : cellsOnOutline(lattice, span, rings);
  const onSpine = spine ? cellsOnSpine(lattice, span, spine) : null;
  const least = (rule === 'half' ? 0.5 - SHARE_TOLERANCE : SHARE_TOLERANCE) * lattice.area;
  const cells: AreaCell[] = [];
  const centre = { x: 0, y: 0 };
  for (let line = span.firstLine; line <= span.lastLine; line++) {
    const across = lattice.acrossOrigin + lattice.spacing * line;
    const [first, last] = indicesWithin(lattice, line, span.minAlong, span.maxAlong, span.margin);
    for (let index = first; index <= last; index++) {
      const along = lattice.alongOrigin + lattice.pitch * (index + lattice.stagger * line);
      centre.x = lattice.rows ? along : across;
      centre.y = lattice.rows ? across : along;
      const id = cellId(span, line, index);
      const byRule = onOutline?.has(id)
        ? Math.abs(rings.reduce((sum, ring) => sum + cut(ring, lattice.corners, centre.x, centre.y), 0)) >= least
        : area.contains(centre);
      if (byRule || onSpine?.has(id)) cells.push({ key: lattice.key(line, index), centre: { x: centre.x, y: centre.y } });
    }
  }
  return cells;
}
