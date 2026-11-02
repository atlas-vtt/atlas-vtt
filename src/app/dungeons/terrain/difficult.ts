/**
 * Difficult ground that shapes a fight (Map-Fu): fields of loose rubble where the dungeon crumbles
 * (big chunks are cover, loose scatter is difficult), broken floor where the ground has shifted.
 * All of it can be walked.
 */

import { type Rng, int } from '../rng';
import { draft } from './catalog';
import { CRAMPED_AREA } from './cover';
import type { FloorTerrain } from './floorTerrain';
import type { RoomCells } from './roomCells';
import { grownBlob } from './shapes';

/** A field of loose rubble or broken floor, three to six cells grown from a free cell. */
export function roughGround(floor: FloorTerrain, rc: RoomCells, rng: Rng, kind: 'rubble-field' | 'broken-floor'): boolean {
  for (let tries = 0; tries < 6; tries++) {
    const start = rc.cell(int(rng, 0, rc.depth - 1), int(rng, 0, rc.width - 1));
    const cells = grownBlob(rc, rng, start, int(rng, 3, kind === 'rubble-field' ? 6 : 4));
    if (cells.length >= 3 && floor.place(draft(kind, rc.room.id, cells)) !== null) return true;
  }
  return false;
}

/** A ruin's ground in a room: a field of rubble or broken floor, sometimes a rubble heap, and in an open room now and then a fragment of fallen wall. */
export function ruinedGround(floor: FloorTerrain, rc: RoomCells, rng: Rng): void {
  roughGround(floor, rc, rng, rng() < 0.5 ? 'rubble-field' : 'broken-floor');
  if (rng() < 0.4) crumbled(floor, rc, rng, 'rubble-heap', 1, 2);
  if (rc.floorCount > CRAMPED_AREA && rng() < 0.3) crumbled(floor, rc, rng, 'wall-fragment', 1, 2);
}

/** One piece of `kind`, `di` × `dj`, at a free place, a few tries. */
function crumbled(floor: FloorTerrain, rc: RoomCells, rng: Rng, kind: 'rubble-heap' | 'wall-fragment', di: number, dj: number): void {
  for (let tries = 0; tries < 6; tries++) {
    const cells = rc.block(int(rng, 0, Math.max(0, rc.depth - di)), int(rng, 0, Math.max(0, rc.width - dj)), di, dj);
    if (floor.place(draft(kind, rc.room.id, cells)) !== null) return;
  }
}
