/**
 * Where a piece stands in a room: against a wall, before the back wall, in the middle, in a
 * corner, in a row, or hung on a wall run no door breaks. Each tries the places in turn through
 * `FurnishSpace`; a verb that finds no place adds nothing. A round room has no straight wall, so
 * the wall verbs place nothing there.
 */

import { cellKey, dir, floorCellsOf } from '../geometry';
import type { CellDir, CellPoint, DungeonProp, PropKind } from '../model';
import { shuffled } from '../rng';
import { WALL_SIDES, type WallSide } from '../terrain/roomCells';
import { PROP_SPECS, isCellPiece, propReach } from './catalogue';
import { type FurnishSpace, hangPiece, placeDisc, placePiece } from './furnishSpace';
import { facing } from './roomFrame';

/** The cells of a piece `along` × `out` standing at the run of wall cells from `start` along `alongDir`, its front towards `into`. */
export function footprintAt(start: CellPoint, alongDir: CellDir, into: CellDir, along: number, out: number): CellPoint[] {
  const cells: CellPoint[] = [];
  for (let a = 0; a < along; a++) for (let o = 0; o < out; o++) cells.push({ x: start.x + alongDir.x * a + into.x * o, y: start.y + alongDir.y * a + into.y * o });
  return cells;
}

/** Runs of `length` wall cells of `side` no door breaks, middle first or shuffled. */
export function wallRuns(fs: FurnishSpace, side: WallSide, length: number, middleFirst: boolean): CellPoint[][] {
  const { cells: rc } = fs;
  if (rc.room.rotunda) return [];
  const wall = rc.wallCells(side);
  const keys = new Set(wall.map((c) => cellKey(c.x, c.y)));
  const alongDir = rc.alongWall(side);
  const runs = wall.flatMap((start) => {
    const run = Array.from({ length }, (_, k) => ({ x: start.x + alongDir.x * k, y: start.y + alongDir.y * k }));
    return run.every((c) => keys.has(cellKey(c.x, c.y)) && !rc.doorOn(side, c)) ? [run] : [];
  });
  if (!middleFirst) return shuffled(fs.rng, runs);
  const mid = (runs.length - 1) / 2;
  return runs.map((run, k) => ({ run, k })).sort((a, b) => Math.abs(a.k - mid) - Math.abs(b.k - mid)).map(({ run }) => run);
}

/** The way opposite `d`. */
export const opposite = (d: CellDir): CellDir => dir(-d.x, -d.y);

/** A piece against one of `sides`, the first place that takes it; a disc stands just before the wall. */
function onSides(fs: FurnishSpace, kind: PropKind, sides: readonly WallSide[], middleFirst: boolean): DungeonProp | null {
  const spec = PROP_SPECS[kind];
  const { cells: rc } = fs;
  const length = isCellPiece(spec) ? spec.footprint.along : 1;
  const inset = 0.45 - propReach(kind);
  for (const side of sides) {
    const into = opposite(rc.beyond(side));
    const alongDir = rc.alongWall(side);
    for (const run of wallRuns(fs, side, length, middleFirst)) {
      const start = run[0] as CellPoint;
      const placed = isCellPiece(spec)
        ? placePiece(fs, kind, footprintAt(start, alongDir, into, spec.footprint.along, spec.footprint.out), into)
        : placeDisc(fs, kind, { x: start.x + 0.5 - into.x * inset, y: start.y + 0.5 - into.y * inset }, facing(into));
      if (placed) return placed;
    }
  }
  return null;
}

export function againstWall(fs: FurnishSpace, kind: PropKind, sides: readonly WallSide[]): DungeonProp | null {
  return onSides(fs, kind, sides, false);
}

/** Before the back wall, the middle first. */
export function atBackWall(fs: FurnishSpace, kind: PropKind): DungeonProp | null {
  return onSides(fs, kind, ['back'], true);
}

/** The room's floor cells (a cave's chamber past its rectangle too) by their distance from the room's middle, nearest first. */
function byCentre(fs: FurnishSpace): CellPoint[] {
  const out = [...floorCellsOf(fs.cells.room)];
  const { centre } = fs.space.frame;
  return out.sort((a, b) => Math.hypot(a.x + 0.5 - centre.x, a.y + 0.5 - centre.y) - Math.hypot(b.x + 0.5 - centre.x, b.y + 0.5 - centre.y));
}

/** In the room's middle, else as near it as it finds room, its long side across the room, facing the way in. */
export function atCentre(fs: FurnishSpace, kind: PropKind): DungeonProp | null {
  const spec = PROP_SPECS[kind];
  const { cells: rc } = fs;
  const into = opposite(rc.axis);
  for (const c of byCentre(fs)) {
    const placed = isCellPiece(spec)
      ? placePiece(fs, kind, footprintAt(c, rc.across, into, spec.footprint.along, spec.footprint.out), into)
      : placeDisc(fs, kind, { x: c.x + 0.5, y: c.y + 0.5 }, facing(into));
    if (placed) return placed;
  }
  return null;
}

/** In a free corner: a cell piece along one of its walls, a disc pushed into the corner. */
export function inCorner(fs: FurnishSpace, kind: PropKind): DungeonProp | null {
  const spec = PROP_SPECS[kind];
  const { cells: rc } = fs;
  if (rc.room.rotunda) return null;
  const inset = 0.45 - propReach(kind);
  const corners = shuffled(fs.rng, (['back', 'near'] as const).flatMap((end) => (['left', 'right'] as const).map((side) => [end, side] as const)));
  for (const [end, side] of corners) {
    const sideKeys = new Set(rc.wallCells(side).map((c) => cellKey(c.x, c.y)));
    const corner = rc.wallCells(end).find((c) => sideKeys.has(cellKey(c.x, c.y)));
    if (!corner) continue;
    const into = opposite(rc.beyond(end));
    const inward = opposite(rc.beyond(side));
    const placed = isCellPiece(spec)
      ? placePiece(fs, kind, footprintAt(corner, inward, into, spec.footprint.along, spec.footprint.out), into)
      : placeDisc(fs, kind, { x: corner.x + 0.5 - (into.x + inward.x) * inset, y: corner.y + 0.5 - (into.y + inward.y) * inset }, facing(into) + (fs.rng() - 0.5) * 0.4);
    if (placed) return placed;
  }
  return null;
}

/** The column a row of free-standing pieces runs down: the middle first, then out to both sides, a ring's width apart. */
function rowColumns(width: number): number[] {
  const middle = Math.floor((width - 1) / 2);
  const out = [middle];
  for (let step = 3; middle - step >= 1 || middle + step <= width - 2; step += 3) out.push(middle - step, middle + step);
  return out.filter((j) => j >= 1 && j <= width - 2);
}

/** `count` of a free-standing cell piece in a row across the room's middle, a ring's width apart (stones a guard post keeps behind). */
export function inRows(fs: FurnishSpace, kind: PropKind, count: number): DungeonProp[] {
  const spec = PROP_SPECS[kind];
  const { cells: rc } = fs;
  if (!isCellPiece(spec)) return [];
  const out: DungeonProp[] = [];
  const i0 = Math.floor((rc.depth - spec.footprint.along) / 2);
  for (const j of rowColumns(rc.width)) {
    if (out.length >= count) break;
    const cells = Array.from({ length: spec.footprint.along }, (_, k) => rc.cell(i0 + k, j));
    const placed = placePiece(fs, kind, cells, rc.across);
    if (placed) out.push(placed);
  }
  return out;
}

/** `count` of a wall piece on wall runs no door breaks. */
export function onWall(fs: FurnishSpace, kind: PropKind, count: number): DungeonProp[] {
  const spec = PROP_SPECS[kind];
  const { cells: rc } = fs;
  if (!spec.wallPiece || !isCellPiece(spec) || rc.room.rotunda) return [];
  // A wall piece is drawn wider than its cells: a cell of whole wall either side keeps it off a corner and a door.
  const runs = WALL_SIDES.flatMap((side) => wallRuns(fs, side, spec.footprint.along + 2, false).map((padded) => ({ side, padded })));
  const out: DungeonProp[] = [];
  for (const { side, padded } of shuffled(fs.rng, runs)) {
    if (out.length >= count) break;
    if (padded.some((c) => fs.hung.has(`${cellKey(c.x, c.y)},${side}`))) continue;
    const placed = hangPiece(fs, kind, padded.slice(1, -1), side);
    if (placed) out.push(placed);
  }
  return out;
}
