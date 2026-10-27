/**
 * Breakdown: what falls from a cave's roof where rock cannot hold. Under the widest span of each
 * floor (its largest chamber) a heap of fallen blocks in the middle third, loose rubble where a
 * pitch or a shaft comes down, and in a collapse chamber a choke of boulders at one of its ways out.
 */

import { spotRect } from '../../floors/stairSpots';
import { cellKey, cellsOf, floorCellsOf, roomArea } from '../../geometry';
import type { CellPoint, TerrainKind } from '../../model';
import { type Rng, shuffled } from '../../rng';
import { draft } from '../catalog';
import type { FloorTerrain } from '../floorTerrain';
import type { RoomCells } from '../roomCells';
import type { TerrainWork } from '../work';

const BREAKDOWN = new Set(['rubble-heap', 'rubble-field']);

/** The cells of the room whose middles lie in the middle third of its extent both ways. */
export function middleThird(cells: readonly CellPoint[]): CellPoint[] {
  const xs = cells.map((c) => c.x);
  const ys = cells.map((c) => c.y);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const w = Math.max(...xs) - x0 + 1;
  const h = Math.max(...ys) - y0 + 1;
  const inThird = (at: number, from: number, size: number): boolean => at + 0.5 >= from + size / 3 && at + 0.5 <= from + (2 * size) / 3;
  return cells.filter((c) => inThird(c.x, x0, w) && inThird(c.y, y0, h));
}

const STEPS = [
  { x: 1, y: 0 },
  { x: 0, y: 1 },
] as const;

/** Lays `kind` on `cells` unless it mirrors a piece already there; whether it did. */
function layLoose(floor: FloorTerrain, rc: RoomCells, kind: TerrainKind, cells: CellPoint[]): boolean {
  return !floor.mirrorsAnother(rc.room, kind, cells) && floor.place(draft(kind, rc.room.id, cells)) !== null;
}

/** A heap of fallen blocks on a cell or two of `spots`, else loose rubble; whether either was laid. */
function fallen(floor: FloorTerrain, rc: RoomCells, rng: Rng, spots: readonly CellPoint[]): boolean {
  const free = shuffled(rng, spots.filter((c) => rc.fits([c])));
  for (const c of free) {
    for (const d of STEPS) {
      const two = [c, { x: c.x + d.x, y: c.y + d.y }];
      if (rc.fits(two) && layLoose(floor, rc, 'rubble-heap', two)) return true;
    }
    if (layLoose(floor, rc, 'rubble-heap', [c])) return true;
  }
  return free.some((c) => layLoose(floor, rc, 'rubble-field', [c, ...STEPS.map((d) => ({ x: c.x + d.x, y: c.y + d.y })).filter((n) => rc.fits([n]))]));
}

/** Loose rubble round the feet of the room's pitches and shafts: free cells within a cell of a foot (two where none is free), outside it, as one spread. */
function rubbleRound(floor: FloorTerrain, rc: RoomCells, rng: Rng, feet: readonly (readonly CellPoint[])[]): void {
  const own = new Set(feet.flat().map((c) => cellKey(c.x, c.y)));
  const cells = new Map<string, CellPoint>();
  for (const foot of feet) {
    for (const reach of [1, 2]) {
      const ring: CellPoint[] = [];
      for (const c of foot) for (let dx = -reach; dx <= reach; dx++) for (let dy = -reach; dy <= reach; dy++) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (!own.has(cellKey(n.x, n.y)) && rc.fits([n])) ring.push(n);
      }
      if (ring.length === 0) continue;
      for (const n of shuffled(rng, ring).slice(0, 3)) cells.set(cellKey(n.x, n.y), n);
      break;
    }
  }
  if (cells.size > 0) layLoose(floor, rc, 'rubble-field', [...cells.values()]);
}

/** A boulder choke at one of a collapse chamber's ways out, a cell past the cell before its door. */
function choke(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): void {
  const floor = work.floors[k];
  if (!floor) return;
  const room = rc.room.id;
  for (const door of shuffled(rng, floor.plan.doors.filter((d) => d.kind !== 'secret' && (d.from === room || d.to === room)))) {
    const inward = door.to === room ? door.dir : { x: -door.dir.x, y: -door.dir.y };
    const at = { x: door.x + inward.x * 2, y: door.y + inward.y * 2 };
    const side = { x: at.x + inward.y, y: at.y + inward.x };
    const cells = rc.fits([at, side]) ? [at, side] : [at];
    if (rc.fits(cells) && floor.place(draft('boulder-choke', room, cells)) !== null) return;
  }
}

/** The room's breakdown, by what the cave makes of it. */
export function placeBreakdown(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): void {
  const floor = work.floors[k];
  if (!floor) return;
  const room = rc.room;
  const chambers = floor.plan.rooms.filter((r) => r.kind === 'room');
  const largest = chambers.reduce((best, r) => (roomArea(r) > roomArea(best) ? r : best), chambers[0]!);
  if (largest.id === room.id) {
    const middle = middleThird(floorCellsOf(room));
    const keys = new Set(middle.map((c) => cellKey(c.x, c.y)));
    const has = floor.inRoom(room.id).some((p) => BREAKDOWN.has(p.kind) && p.cells.some((c) => keys.has(cellKey(c.x, c.y))));
    if (!has) fallen(floor, rc, rng, middle);
  }
  if (work.typed(k, room.id)?.spec.id === 'collapse-chamber') choke(work, k, rc, rng);
}

/**
 * Rubble round the feet of the room's pitches and of the shafts dropped onto it from above, laid
 * before anything else stands in the room, so no piece takes the ground round a foot first.
 */
export function rubbleAtFeet(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): void {
  const floor = work.floors[k];
  if (!floor) return;
  const avens = floor.plan.stairs.filter((s) => s.way === 'pitch' && s.to < k).map((s) => cellsOf(spotRect(s))).filter((cells) => cells.every((c) => rc.isFloor(c)));
  const shaftFeet = floor.inRoom(rc.room.id).filter((p) => p.kind === 'chasm-floor' && p.name === 'dungeon.terrain.shaftFloor').map((p) => p.cells);
  if (avens.length + shaftFeet.length > 0) rubbleRound(floor, rc, rng, [...avens, ...shaftFeet]);
}
