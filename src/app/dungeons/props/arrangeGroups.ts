/**
 * Pieces placed by what else stands in the room: a mirrored pair either side of a piece, the inner
 * door or the room's middle; pieces beside a parent (a column among stalagmites); pieces on a grid;
 * pieces on the shore of the room's liquid.
 */

import { cellKey, dir, doorSide, perpendicular } from '../geometry';
import type { CellDir, CellPoint, DungeonProp, PropKind } from '../model';
import { shuffled } from '../rng';
import { PROP_SPECS, isCellPiece, propReach } from './catalogue';
import { footprintAt, opposite } from './cellVerbs';
import { type FurnishSpace, type PlacedPiece, placeDisc, placePiece } from './furnishSpace';
import { facing } from './roomFrame';
import { isFree } from './space';

const STEPS: readonly CellDir[] = [dir(0, -1), dir(1, 0), dir(0, 1), dir(-1, 0)];
/** Terrain that is liquid a shore lies beside. */
const LIQUID = new Set(['deep-water', 'channel', 'pool']);

/** One piece of `kind` at `at`, facing `towards`: a disc at its middle, a cell piece on its cell. */
function single(fs: FurnishSpace, kind: PropKind, at: CellPoint, towards: CellDir): DungeonProp | null {
  const spec = PROP_SPECS[kind];
  if (!isCellPiece(spec)) return placeDisc(fs, kind, at, facing(towards));
  const cell = { x: Math.floor(at.x), y: Math.floor(at.y) };
  return placePiece(fs, kind, footprintAt(cell, perpendicular(towards), towards, spec.footprint.along, spec.footprint.out), towards);
}

/** Whether a piece of `kind` could stand at `at`: on the room's floor, free there. */
function couldStand(fs: FurnishSpace, kind: PropKind, at: CellPoint): boolean {
  const cell = { x: Math.floor(at.x), y: Math.floor(at.y) };
  return fs.cells.isFloor(cell) && !fs.cells.isTaken(cell) && (isCellPiece(PROP_SPECS[kind]) ? fs.cells.isFree(cell) : isFree(fs.space, at, propReach(kind)));
}

/** Where a pair stands round: the piece's middle and facing, the inner door's first cell and the way in, or the room's middle. */
function pairAxis(fs: FurnishSpace, of: PlacedPiece | 'door' | null): { at: CellPoint; facing: CellDir; half: number } | null {
  const { cells: rc } = fs;
  if (of && of !== 'door') {
    // How many cells the piece spans across its facing: a pair stands a cell clear of its ends.
    const span = new Set(of.cells.map((c) => c.x * of.facing.y + c.y * of.facing.x)).size;
    return { at: { x: of.prop.x, y: of.prop.y }, facing: of.facing, half: span / 2 + 0.5 };
  }
  if (of === 'door') {
    const door = fs.doors.find((d) => d.to === rc.room.id && d.kind !== 'secret') ?? fs.doors.find((d) => (d.from === rc.room.id || d.to === rc.room.id) && d.kind !== 'secret');
    if (!door) return null;
    const inward = door.to === rc.room.id ? door.dir : opposite(door.dir);
    const [first] = doorSide(door, rc.room.id);
    return first ? { at: { x: first.x + 0.5, y: first.y + 0.5 }, facing: inward, half: 1 } : null;
  }
  return { at: fs.space.frame.centre, facing: opposite(rc.axis), half: 1 };
}

/** A mirrored pair of `kind` either side of `of` (a placed piece, the inner door, or with null the room's middle); both or none. */
export function flanking(fs: FurnishSpace, kind: PropKind, of: PlacedPiece | 'door' | null): DungeonProp[] {
  const axis = pairAxis(fs, of);
  if (!axis) return [];
  const side = perpendicular(axis.facing);
  const spots = [1, -1].map((sign) => ({ x: axis.at.x + side.x * axis.half * sign, y: axis.at.y + side.y * axis.half * sign }));
  if (!spots.every((p) => couldStand(fs, kind, p))) return [];
  const first = single(fs, kind, spots[0] as CellPoint, axis.facing);
  if (!first) return [];
  const second = single(fs, kind, spots[1] as CellPoint, axis.facing);
  return second ? [first, second] : [first];
}

/** Up to `count` of `kind` on free cells beside `parent`, each facing away from it. */
export function besideParent(fs: FurnishSpace, kind: PropKind, parent: PlacedPiece, count: number): DungeonProp[] {
  const own = new Set(parent.cells.map((c) => cellKey(c.x, c.y)));
  const beside = new Map<string, { cell: CellPoint; away: CellDir }>();
  for (const c of parent.cells) {
    for (const d of STEPS) {
      const next = { x: c.x + d.x, y: c.y + d.y };
      if (!own.has(cellKey(next.x, next.y))) beside.set(cellKey(next.x, next.y), { cell: next, away: d });
    }
  }
  const out: DungeonProp[] = [];
  for (const { cell, away } of shuffled(fs.rng, [...beside.values()])) {
    if (out.length >= count) break;
    const placed = single(fs, kind, { x: cell.x + 0.5, y: cell.y + 0.5 }, away);
    if (placed) out.push(placed);
  }
  return out;
}

/** Up to `count` of `kind` on a regular grid a cell apart. */
export function inGrid(fs: FurnishSpace, kind: PropKind, count: number): DungeonProp[] {
  const { cells: rc } = fs;
  const spots: CellPoint[] = [];
  for (let i = 1; i < rc.depth - 1; i += 2) for (let j = 1; j < rc.width - 1; j += 2) spots.push(rc.cell(i, j));
  const out: DungeonProp[] = [];
  for (const c of spots) {
    if (out.length >= count) break;
    const placed = single(fs, kind, { x: c.x + 0.5, y: c.y + 0.5 }, opposite(rc.axis));
    if (placed) out.push(placed);
  }
  return out;
}

/** Up to `count` of `kind` on free cells beside the room's liquid (deep water, a channel, a pool); none in a dry room. */
export function onShore(fs: FurnishSpace, kind: PropKind, count: number): DungeonProp[] {
  const liquid = fs.floor.inRoom(fs.cells.room.id).filter((piece) => LIQUID.has(piece.kind)).flatMap((piece) => piece.cells);
  const wet = new Set(liquid.map((c) => cellKey(c.x, c.y)));
  const shore = new Map<string, { cell: CellPoint; towards: CellDir }>();
  for (const c of liquid) {
    for (const d of STEPS) {
      const next = { x: c.x - d.x, y: c.y - d.y };
      // A shore piece backs onto the water's edge, as a wall piece backs onto its wall.
      if (!wet.has(cellKey(next.x, next.y)) && fs.cells.isFree(next)) shore.set(cellKey(next.x, next.y), { cell: next, towards: opposite(d) });
    }
  }
  const out: DungeonProp[] = [];
  for (const { cell, towards } of shuffled(fs.rng, [...shore.values()])) {
    if (out.length >= count) break;
    const placed = single(fs, kind, { x: cell.x + 0.5, y: cell.y + 0.5 }, towards);
    if (placed) out.push(placed);
  }
  return out;
}
