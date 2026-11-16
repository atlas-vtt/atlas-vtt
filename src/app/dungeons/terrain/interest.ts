/**
 * Points of interest spread through the quieter rooms (Terrain principle 7, Perkins' "escape room"
 * map): a mosaic in the floor, an obelisk, a basin of water, a statue facing the
 * way in. Things to look at, which stand out and do nothing by themselves: no levers or other
 * mechanisms, which would ask the GM for a story.
 */

import type { CellDir, TerrainKind } from '../model';
import { dir } from '../geometry';
import { type Rng, weighted } from '../rng';
import type { DungeonTag } from '../tags';
import { draft } from './catalog';
import type { FloorTerrain } from './floorTerrain';
import type { RoomCells } from './roomCells';
import { standsApart } from './shapes';

function negate(d: CellDir): CellDir {
  return dir(-d.x, -d.y);
}

export type InterestKind = Extract<TerrainKind, 'mosaic' | 'obelisk' | 'pool' | 'statue'>;

function weightsOf(tags: ReadonlySet<DungeonTag>): (readonly [InterestKind, number])[] {
  return [
    ['mosaic', 1.5],
    ['obelisk', 1],
    ['pool', tags.has('dry') ? 0 : tags.has('wet') || tags.has('flooded') ? 2.5 : 1],
    ['statue', 1],
  ];
}

/** A piece of `kind` with its corner at (i, j), standing apart from the room's other pieces. */
function at(floor: FloorTerrain, rc: RoomCells, kind: InterestKind, i: number, j: number, size: number, facing: CellDir): boolean {
  const cells = rc.block(i, j, size, size);
  if (!standsApart(rc, cells, floor.takenCells())) return false;
  return floor.place(draft(kind, rc.room.id, cells, { facing })) !== null;
}

/** The room's middle for a piece `size` cells square. */
function middle(rc: RoomCells, size: number): [number, number] {
  return [Math.floor((rc.depth - size) / 2), Math.floor((rc.width - size) / 2)];
}

/** One point of interest of `kind`; false where it finds no place. */
export function placeInterest(floor: FloorTerrain, rc: RoomCells, rng: Rng, kind: InterestKind): boolean {
  const facing = negate(rc.axis);
  switch (kind) {
    case 'mosaic': {
      const size = rc.depth >= 7 && rc.width >= 7 ? 3 : 2;
      const [i, j] = middle(rc, size);
      return rc.depth >= size + 2 && rc.width >= size + 2 && at(floor, rc, 'mosaic', i, j, size, facing);
    }
    case 'pool': {
      const size = rc.depth >= 6 && rc.width >= 6 ? 2 : 1;
      const [i, j] = middle(rc, size);
      return at(floor, rc, 'pool', i, j, size, facing);
    }
    case 'obelisk': {
      const [i, j] = middle(rc, 1);
      return at(floor, rc, 'obelisk', i, j, 1, facing);
    }
    case 'statue': {
      const cells = rc.block(rc.depth - 1, Math.floor((rc.width - 1) / 2), 1, 1);
      return standsApart(rc, cells, floor.takenCells()) && floor.place(draft(kind, rc.room.id, cells, { facing })) !== null;
    }
  }
}

/** One point of interest the dungeon's tags favour, else any that fits; of the kinds `allows` lets in where given (a typed room's). */
export function anyInterest(floor: FloorTerrain, rc: RoomCells, rng: Rng, tags: ReadonlySet<DungeonTag>, allows?: (kind: InterestKind) => boolean): boolean {
  const weights = weightsOf(tags).filter(([kind, w]) => w > 0 && (allows?.(kind) ?? true));
  if (weights.length === 0) return false;
  const first = weighted(rng, weights);
  return [first, ...weights.map(([k]) => k).filter((k) => k !== first)].some((kind) => placeInterest(floor, rc, rng, kind));
}
