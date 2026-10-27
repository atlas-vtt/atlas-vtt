/**
 * A room being furnished on whole cells: its terrain cells (`RoomCells`), its disc space
 * (`RoomSpace`) and what has been placed. A cell piece takes the cells of its footprint, keeps its
 * clear side walkable and stands only where the room stays whole; a disc is placed below a cell;
 * a wall piece hangs on a run of wall no door breaks. Nothing is placed that the generator is not
 * offered (a kind without a drawing) or the theme's facts veto.
 */

import { cellKey, dir } from '../geometry';
import type { CellDir, CellPoint, DungeonDoor, DungeonProp, PropKind } from '../model';
import type { Rng } from '../rng';
import type { FloorTerrain } from '../terrain/floorTerrain';
import type { RoomCells, WallSide } from '../terrain/roomCells';
import { clearCells } from '../terrain/roomLanes';
import { PROP_SPECS, isCellPiece, propReach } from './catalogue';
import { facing } from './roomFrame';
import { type RoomSpace, isFree, occupyCells, take } from './space';

/** Where a placed piece stands, for the pieces that go round it. */
export interface PlacedPiece {
  prop: DungeonProp;
  cells: readonly CellPoint[];
  clear: readonly CellPoint[];
  facing: CellDir;
}

export interface FurnishSpace {
  floor: FloorTerrain;
  cells: RoomCells;
  space: RoomSpace;
  rng: Rng;
  offered: ReadonlySet<PropKind>;
  doors: readonly DungeonDoor[];
  /** The theme's veto on a piece's cells in this room. */
  placeAllowed?: (kind: PropKind, at: CellPoint) => boolean;
  /** What has been placed, latest last. */
  placed: PlacedPiece[];
  /** Wall cells a wall piece hangs before, as `x,y,side`. */
  hung: Set<string>;
}

/** A furnishing of a room with nothing placed yet. */
export function furnishSpace(base: Omit<FurnishSpace, 'placed' | 'hung'>): FurnishSpace {
  return { ...base, placed: [], hung: new Set() };
}

/** The middle of a set of cells. */
export const centreOf = (cells: readonly CellPoint[]): CellPoint => ({
  x: cells.reduce((sum, c) => sum + c.x + 0.5, 0) / cells.length,
  y: cells.reduce((sum, c) => sum + c.y + 0.5, 0) / cells.length,
});

function allowedOn(fs: FurnishSpace, kind: PropKind, cells: readonly CellPoint[]): boolean {
  return fs.offered.has(kind) && cells.every((c) => fs.placeAllowed?.(kind, c) ?? true);
}

/** Adds a placed piece to the room and its floor. */
export function record(fs: FurnishSpace, piece: PlacedPiece): DungeonProp {
  fs.placed.push(piece);
  fs.floor.addProp(piece.prop, piece.cells);
  return piece.prop;
}

/**
 * A cell piece on `cells`, its front towards `facing`: only where it is offered, allowed, the room
 * stays whole and its clear side is free floor.
 */
export function placePiece(fs: FurnishSpace, kind: PropKind, cells: readonly CellPoint[], towards: CellDir): DungeonProp | null {
  const spec = PROP_SPECS[kind];
  const { cells: rc } = fs;
  if (!isCellPiece(spec) || spec.wallPiece || !allowedOn(fs, kind, cells)) return null;
  const footing = spec.footing ?? 'block';
  if (!rc.allows(cells, footing)) return null;
  const clear = clearCells(rc, cells, spec, towards);
  // Kept clear from now on, so it stays walkable: the room-stays-whole check already reaches it.
  if (clear.some((c) => rc.isBlocked(c))) return null;
  rc.take(cells, footing);
  rc.keepClear(clear);
  occupyCells(fs.space, cells);
  const centre = centreOf(cells);
  const prop: DungeonProp = { kind, x: centre.x, y: centre.y, rotation: facing(towards), scale: 1, room: rc.room.id };
  return record(fs, { prop, cells, clear, facing: towards });
}

/** A disc at `p`, turned by `rotation`: free in the room's space; a blocking disc also takes its cell, unless only discs stand there. */
export function placeDisc(fs: FurnishSpace, kind: PropKind, p: CellPoint, rotation: number): DungeonProp | null {
  const spec = PROP_SPECS[kind];
  const cell = { x: Math.floor(p.x), y: Math.floor(p.y) };
  const reach = propReach(kind);
  if (isCellPiece(spec) || !allowedOn(fs, kind, [cell]) || !isFree(fs.space, p, reach)) return null;
  const blocks = spec.footing === 'block';
  const { cells: rc } = fs;
  if (!rc.isFloor(cell)) return null;
  if (blocks && !rc.isBlocked(cell) && !rc.allows([cell], 'block')) return null;
  take(fs.space, p, reach);
  if (blocks) rc.take([cell], 'block');
  const prop: DungeonProp = { kind, x: p.x, y: p.y, rotation, scale: 1, room: rc.room.id };
  return record(fs, { prop, cells: [cell], clear: [], facing: dir(0, -1) });
}

/** A wall piece hung on the run of wall cells `run` of `side`, facing into the room, stretched to the run where it is longer. */
export function hangPiece(fs: FurnishSpace, kind: PropKind, run: readonly CellPoint[], side: WallSide): DungeonProp | null {
  const spec = PROP_SPECS[kind];
  const { cells: rc } = fs;
  if (!spec.wallPiece || run.length === 0 || !allowedOn(fs, kind, run)) return null;
  const keys = run.map((c) => `${cellKey(c.x, c.y)},${side}`);
  if (keys.some((key) => fs.hung.has(key)) || run.some((c) => rc.isKeptClear(c) || rc.doorOn(side, c))) return null;
  for (const key of keys) fs.hung.add(key);
  const out = rc.beyond(side);
  const into = dir(-out.x, -out.y);
  const centre = centreOf(run);
  const along = run.length > 1 ? { size: { along: run.length, out: 0 } } : {};
  const prop: DungeonProp = { kind, x: centre.x + out.x * 0.4, y: centre.y + out.y * 0.4, rotation: facing(into), scale: 1, room: rc.room.id, ...along };
  return record(fs, { prop, cells: [], clear: [], facing: into });
}
