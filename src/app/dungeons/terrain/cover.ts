/**
 * Cover where a fight can happen (Terrain principles 1, 2 and 8; Map-Fu's "cover wide enough"),
 * made of structure and fallen stone, never furniture. Cramped rooms get a few low pieces scattered
 * apart (a rubble heap, a low wall): pressure, everyone in reach. Open rooms get few strong
 * features that break long sight lines: a pair of pillars (two cells wide in large rooms, so they
 * cannot be stepped round), staggered wall fragments, a pair of statues. Pieces never touch each
 * other, so every piece reads alone and the ways between them stay a cell wide.
 */

import type { CellDir, TerrainKind } from '../model';
import { dir, floorCellsOf } from '../geometry';
import { type Rng, chance, int, shuffled, weighted } from '../rng';
import type { DungeonTag } from '../tags';
import { draft } from './catalog';
import type { FloorTerrain } from './floorTerrain';
import type { RoomCells } from './roomCells';
import { standsApart } from './shapes';

/** Rooms of at least this much floor can hold a fight and get cover unless they are left empty. */
export const FIGHT_AREA = 12;

/** A room this many cells or fewer is cramped; larger is open. */
export const CRAMPED_AREA = 20;

export interface CoverShape {
  kind: TerrainKind;
  /** Rows deep and columns wide in the room's frame. */
  di: number;
  dj: number;
}

/** The low pieces a cramped room scatters, by the dungeon's tags. */
function halfCover(tags: ReadonlySet<DungeonTag>): (readonly [CoverShape, number])[] {
  return [
    [{ kind: 'rubble-heap', di: 1, dj: 1 }, tags.has('crumbling') ? 4 : 1],
    [{ kind: 'rubble-heap', di: 1, dj: 2 }, tags.has('crumbling') ? 2 : 0.3],
    [{ kind: 'low-wall', di: 1, dj: 2 }, 1.5],
  ];
}

function negate(d: CellDir): CellDir {
  return dir(-d.x, -d.y);
}

/** Places a piece of `shape` with its corner at (i, j) if the room allows it and it stands apart from the others. */
export function tryShape(floor: FloorTerrain, rc: RoomCells, shape: CoverShape, i: number, j: number): boolean {
  const cells = rc.block(i, j, shape.di, shape.dj);
  if (!standsApart(rc, cells, floor.takenCells())) return false;
  return floor.place(draft(shape.kind, rc.room.id, cells, { facing: negate(rc.axis) })) !== null;
}

/** Up to `count` pieces drawn from `shapes` (of the kinds `allows` lets in, where given), each at a random free place. */
export function scatterCover(floor: FloorTerrain, rc: RoomCells, rng: Rng, count: number, tags: ReadonlySet<DungeonTag>, allows: (kind: TerrainKind) => boolean = () => true): number {
  const shapes = halfCover(tags).filter(([shape, w]) => w > 0 && allows(shape.kind));
  if (shapes.length === 0) return 0;
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 10; tries++) {
    const shape = weighted(rng, shapes);
    const i = int(rng, 0, rc.depth - shape.di);
    const j = int(rng, 0, rc.width - shape.dj);
    if (tryShape(floor, rc, shape, i, j)) placed++;
  }
  return placed;
}

/** Two of `shape` mirrored across the room's middle at row `i`, `inset` cells from the side walls. */
function mirroredPair(floor: FloorTerrain, rc: RoomCells, shape: CoverShape, i: number, inset: number): boolean {
  const left = inset;
  const right = rc.width - inset - shape.dj;
  if (right - left < shape.dj + 1) return false;
  const pair = [rc.block(i, left, shape.di, shape.dj), rc.block(i, right, shape.di, shape.dj)];
  const taken = floor.takenCells();
  if (!pair.every((cells) => standsApart(rc, cells, taken) && rc.fits(cells)) || !rc.allows([...pair[0]!, ...pair[1]!], 'block')) return false;
  pair.forEach((cells) => floor.place(draft(shape.kind, rc.room.id, cells, { facing: negate(rc.axis) })));
  return true;
}

/** A mirrored pair of `shape` across the room at a third, the middle or two thirds of its depth. */
function pairAcross(floor: FloorTerrain, rc: RoomCells, rng: Rng, shape: CoverShape): boolean {
  const rows = shuffled(rng, [Math.floor(rc.depth / 3), Math.floor(rc.depth / 2), Math.floor((rc.depth * 2) / 3) - shape.di + 1]);
  const insets = rc.width >= 7 ? [Math.floor(rc.width / 5), 1] : [1];
  return rows.some((i) => insets.some((inset) => mirroredPair(floor, rc, shape, Math.max(1, i), inset)));
}

/** Pillars in pairs across the room: two cells square where the room is large. */
export function pillars(floor: FloorTerrain, rc: RoomCells, rng: Rng): boolean {
  const size = rc.width >= 8 && rc.depth >= 7 ? 2 : 1;
  return pairAcross(floor, rc, rng, { kind: 'pillar', di: size, dj: size });
}

/**
 * Whether a fight can be held in the room, asked once its lanes are kept: at least `FIGHT_AREA`
 * cells of its floor are no stairwell, and some cell lies off the ways between its doors and
 * stairs. A room all of whose floor is such a way is a crossing, not a place to make a stand.
 */
export function holdsFight(floor: FloorTerrain, rc: RoomCells): boolean {
  if (rc.floorCount - floor.stairCellsIn(rc).length < FIGHT_AREA) return false;
  return floorCellsOf(rc.room).some((c) => rc.offWays(c));
}

/** Whether the room holds cover: a piece that gives it, or columns standing in it. */
export function hasCover(floor: FloorTerrain, rc: RoomCells): boolean {
  const { room } = rc;
  const columns = floor.plan.columns.some((c) => c.x > room.x && c.x < room.x + room.w && c.y > room.y && c.y < room.y + room.h);
  return columns || floor.inRoom(room.id).some((p) => p.traits.cover !== undefined);
}

/** One piece of `shape` at a random place apart from the others, a few tries. */
function anywhere(floor: FloorTerrain, rc: RoomCells, rng: Rng, shape: CoverShape): boolean {
  for (let tries = 0; tries < 12; tries++) {
    if (tryShape(floor, rc, shape, int(rng, 0, rc.depth - shape.di), int(rng, 0, rc.width - shape.dj))) return true;
  }
  return false;
}

/**
 * Cover in a room that can hold a fight (`holdsFight`) and has none yet (columns or a piece that
 * gives it), made of what builders, time and nature leave: in a cave or a ruin a heap of fallen
 * stone, in a built room's open hall a mirrored pair of pillars or statues, else a statue. Placed
 * with the terrain, before the floor's water and any of the room's pieces, so which pieces are
 * drawn never moves it.
 */
export function structureCover(floor: FloorTerrain, rc: RoomCells, rng: Rng, tags: ReadonlySet<DungeonTag>, natural: boolean): void {
  if (hasCover(floor, rc)) return;
  const fallen = natural || tags.has('ruined') || tags.has('crumbling');
  if (fallen && anywhere(floor, rc, rng, { kind: 'rubble-heap', di: 1, dj: 1 })) return;
  if (natural) return ensureCover(floor, rc, tags, 'rubble-heap');
  if (rc.floorCount > CRAMPED_AREA && (chance(rng, 0.5) ? pillars(floor, rc, rng) : pairAcross(floor, rc, rng, { kind: 'statue', di: 1, dj: 1 }))) return;
  if (anywhere(floor, rc, rng, { kind: 'statue', di: 1, dj: 1 })) return;
  ensureCover(floor, rc, tags);
}

/** A last piece of cover where the room has none yet (`kind`, else a heap of rubble where the dungeon crumbles and a statue where it stands whole): tried at every cell of its floor, a cave's chamber past its rectangle too. */
export function ensureCover(floor: FloorTerrain, rc: RoomCells, tags: ReadonlySet<DungeonTag>, kind: TerrainKind = tags.has('crumbling') || tags.has('ruined') ? 'rubble-heap' : 'statue'): void {
  if (hasCover(floor, rc)) return;
  for (const c of floorCellsOf(rc.room)) {
    if (floor.place(draft(kind, rc.room.id, [c], { facing: negate(rc.axis) })) !== null) return;
  }
}
