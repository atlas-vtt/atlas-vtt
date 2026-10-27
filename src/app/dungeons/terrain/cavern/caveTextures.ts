/**
 * What lies on a cave's floor where something put it there: sulphur crust round an acid spring,
 * rimstone dams where water steps down (a lake's edge, a stream's way in, beside steps), guano
 * under a roost, bones about a den. Each is placed through the floor, so a kind without its
 * drawing is never laid.
 */

import { cellKey, floorCellsOf } from '../../geometry';
import type { CellPoint, TerrainKind } from '../../model';
import { doorApproaches } from '../../floors/stairSpots';
import { type Rng, chance, int } from '../../rng';
import { draft } from '../catalog';
import type { FloorTerrain } from '../floorTerrain';
import type { RoomCells } from '../roomCells';
import type { TerrainWork } from '../work';

const STEPS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

const around = (cells: readonly CellPoint[]): CellPoint[] => cells.flatMap((c) => STEPS.map((d) => ({ x: c.x + d.x, y: c.y + d.y })));

/** Sulphur crust on every free cell beside the acid. */
export function crustAround(floor: FloorTerrain, rc: RoomCells, acid: readonly CellPoint[]): void {
  const own = new Set(acid.map((c) => cellKey(c.x, c.y)));
  const seen = new Set<string>();
  const cells = around(acid).filter((c) => {
    const key = cellKey(c.x, c.y);
    if (own.has(key) || seen.has(key)) return false;
    seen.add(key);
    return rc.fits([c]);
  });
  if (cells.length > 0) floor.place(draft('sulphur-crust', rc.room.id, cells));
}

/** A patch of `size` cells grown from a free cell of `starts`, of the cells `may` lets in. */
function patch(rc: RoomCells, rng: Rng, starts: readonly CellPoint[], size: number, may: (c: CellPoint) => boolean = () => true): CellPoint[] {
  const free = starts.filter((c) => rc.fits([c]) && may(c));
  const start = free[Math.floor(rng() * free.length)];
  if (!start) return [];
  const cells = [start];
  const seen = new Set([cellKey(start.x, start.y)]);
  while (cells.length < size) {
    const options = around(cells).filter((c) => !seen.has(cellKey(c.x, c.y)) && rc.fits([c]) && may(c));
    const next = options[Math.floor(rng() * options.length)];
    if (!next) break;
    seen.add(cellKey(next.x, next.y));
    cells.push(next);
  }
  return cells;
}

/** Lays a patch of `kind` and whether it did. */
function lay(floor: FloorTerrain, rc: RoomCells, kind: TerrainKind, cells: readonly CellPoint[]): boolean {
  return cells.length > 0 && floor.place(draft(kind, rc.room.id, [...cells])) !== null;
}

/** Where water steps down in the room: beside its standing water, beside the way a stream comes in, beside steps. */
export function rimstoneSpots(work: TerrainWork, k: number, rc: RoomCells): CellPoint[] {
  const floor = work.floors[k];
  if (!floor) return [];
  const room = rc.room.id;
  const water = floor.inRoom(room).filter((p) => p.traits.hazard === 'deep-water' || p.kind === 'pool').flatMap((p) => p.cells);
  const upstream = (floor.plan.cave?.streams ?? []).flatMap((chain) => chain.flatMap((id, i) => (chain[i + 1] === room ? [id] : [])));
  const doors = floor.plan.doors.filter((d) => (d.from === room || d.to === room) && (d.kind === 'steps' || upstream.includes(d.from === room ? (d.to ?? -1) : (d.from ?? -1))));
  return [...around(water), ...around(doorApproaches(rc.room, doors))];
}

/** The floor's textures in a room of a cave: rimstone where water steps down, guano in a roost, bones in a den. */
export function floorTextures(work: TerrainWork, k: number, rc: RoomCells, rng: Rng): void {
  const floor = work.floors[k];
  if (!floor) return;
  const type = work.typed(k, rc.room.id)?.spec.id;
  const rimstone = rimstoneSpots(work, k, rc);
  if (rimstone.length > 0 && chance(rng, 0.6)) {
    const allowed = new Set(rimstone.map((c) => cellKey(c.x, c.y)));
    lay(floor, rc, 'rimstone', patch(rc, rng, rimstone, int(rng, 2, 4), (c) => allowed.has(cellKey(c.x, c.y))));
  }
  const cells = floorCellsOf(rc.room);
  if (type === 'roost') lay(floor, rc, 'guano', patch(rc, rng, cells, int(rng, 3, 6)));
  if (type === 'den') lay(floor, rc, 'bone-litter', patch(rc, rng, cells, int(rng, 2, 5)));
}
