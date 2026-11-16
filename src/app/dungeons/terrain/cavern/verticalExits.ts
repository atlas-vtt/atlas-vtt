/**
 * The exits a cave chamber's roll put in its roof and floor (Veins of the Earth: one exit in six
 * leads up, one in six down). A floor exit is a shaft: a cell, or three in an L where the way is
 * wide, a cell clear of the walls, falling into the room of the floor below where one lies under
 * it and into the dark where no floor does. A roof exit is an aven: a chimney rising over a cell
 * of the floor, walked under, to the floor above where one lies over it, into the dark where not.
 * At most two of each in a chamber, and a shaft or chasm its type already cut counts as one; in a
 * small chamber one piece in all, since every exit takes floor its cover needs. A pitch down from
 * the chamber is the way through one of its floor exits, so that exit is no shaft as well. Neither
 * takes the last place for cover. No two shafts lie as mirror images of each other, above or where
 * they land: nature makes no such pair. Each piece carries its way's depth and the kind its width
 * makes of it (a shaft, a chimney, a vertical squeeze) for the note and the hover label.
 */

import { levelElevation, stairEnd } from '../../floors/floorStack';
import { LEVEL_HEIGHT } from '../../../levels/levelEdits';
import { spotRect } from '../../floors/stairSpots';
import { cellKey, cellsOf, floorCellsOf } from '../../geometry';
import { verticalKindOf } from '../../layout/cavern/veins/caveExits';
import type { CellPoint, DungeonRoom, TerrainDrop, VerticalWay } from '../../model';
import { type Rng, shuffled } from '../../rng';
import { LIVED_IN } from '../../themes/cavern/formations';
import { type Footing, draft } from '../catalog';
import { FIGHT_AREA } from '../cover';
import type { FloorTerrain } from '../floorTerrain';
import { leavesRoom } from '../hazards';
import { type Drop, cutHole, dropBelow } from '../holes';
import type { RoomCells } from '../roomCells';
import { laneCells } from '../roomLanes';
import type { TerrainWork } from '../work';
import { holdsWater, shaftShapes } from './caveHazards';
import { besideHole, besideWater } from './cavePools';

/** The most shafts, and the most avens, one chamber's roll gives it. */
const MOST_PER_CHAMBER = 2;
/** A floor exit at least this wide (feet) may open as three cells in an L. */
const WIDE_SHAFT = 8;
/** How many of a room's shapes a shaft tries before it gives up. */
const TRIES = 24;
/** A chamber of fewer floor cells takes one exit in roof or floor at most, its type's own hole counted. */
const SMALL_CHAMBER = 16;

/**
 * Whether a hole may open in the room: a regular chamber that is no arena or stage, nobody lives in
 * (their fires keep off holes) and no water fills or runs through (it would lie beside the hole).
 */
export function mayOpenHole(work: TerrainWork, k: number, room: DungeonRoom): boolean {
  if (room.kind !== 'room' || room.boss || room.stage || room.wing !== 'regular') return false;
  if (LIVED_IN.has(work.typed(k, room.id)?.spec.id ?? '')) return false;
  const cave = work.floors[k]?.plan.cave;
  return !holdsWater(work, k, room.id) && !(cave?.streams.some((chain) => chain.includes(room.id)) ?? false);
}

/**
 * Whether, with an exit on `cells`, a room that can hold a fight still has a place for its cover
 * off the lanes its furnishing will keep between doors and stairs (laid after the exits, so they are
 * worked out here as they will run): the cover pass needs one cell that can be blocked.
 */
function keepsPlaceForCover(floor: FloorTerrain, rc: RoomCells, cells: readonly CellPoint[], footing: Footing): boolean {
  if (rc.floorCount - floor.stairCellsIn(rc).length < FIGHT_AREA) return true;
  if (!rc.keepsCover(cells)) return false;
  const own = new Set(cells.map((c) => cellKey(c.x, c.y)));
  const lanes = new Set(laneCells(rc, footing === 'block' ? own : new Set()).map((c) => cellKey(c.x, c.y)));
  const blocked = footing === 'block' ? cells : [];
  return floorCellsOf(rc.room).some((c) => !own.has(cellKey(c.x, c.y)) && !lanes.has(cellKey(c.x, c.y)) && !rc.inLane(c) && rc.allows([...blocked, c], 'block'));
}

/** Whether the room already holds a shaft or chasm of its own type's (a shaft room's pitch, a chasm hall's chasm). */
function holdsHole(work: TerrainWork, k: number, room: number): boolean {
  return work.floors[k]?.inRoom(room).some((p) => p.kind === 'shaft' || p.kind === 'chasm') === true;
}

/** Whether the room holds the upper end of a pitch: the way down one of its floor exits already takes. */
function pitchesDown(work: TerrainWork, k: number, rc: RoomCells): boolean {
  const stairs = work.floors[k]?.plan.stairs ?? [];
  return stairs.some((s) => s.way === 'pitch' && stairEnd(work.stack, k, s.to) === 'upper' && cellsOf(spotRect(s)).some((c) => rc.isFloor(c)));
}

/** What a piece opening `way` carries of it; a shaft that lands on a floor is as deep as the floors lie apart, whatever it rolled. */
function dropOf(way: VerticalWay, work?: TerrainWork, from?: number, to?: number | null): TerrainDrop {
  const landed = work && from !== undefined && to !== undefined && to !== null ? Math.abs(levelElevation(work.stack, from, LEVEL_HEIGHT).bottom - levelElevation(work.stack, to, LEVEL_HEIGHT).bottom) : undefined;
  return { depth: landed ?? way.depth, kind: verticalKindOf(way.width) };
}

/** A shaft for the floor exit `way` in the room, falling to the floor below or into the dark; whether one was cut. */
function shaftIn(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, way: VerticalWay): boolean {
  const floor = work.floors[k];
  if (!floor || rc.depth < 3 || rc.width < 3) return false;
  const wet = besideWater(floor);
  const hole = besideHole(floor);
  const shapes = shaftShapes(rc).filter((cells) => cells.length === 1 || way.width >= WIDE_SHAFT);
  return shuffled(rng, shapes).slice(0, TRIES).some((cells) => {
    if (!rc.allows(cells, 'block') || !leavesRoom(rc, cells)) return false;
    if (cells.some((c) => rc.nearStairs(c) || wet(c) || hole(c) || !rc.clearOfRock(c)) || floor.mirrorsAnother(rc.room, 'shaft', cells)) return false;
    if (!keepsPlaceForCover(floor, rc, cells, 'block')) return false;
    const drop = dropBelow(work, k, cells, rng, false);
    return drop !== null && !mirroredBelow(work, drop, cells) && cutHole(work, k, rc, 'shaft', cells, drop, { traits: { drop: dropOf(way, work, k, drop.bottom?.floor ?? null) } }) !== null;
  });
}

/** Whether the rubble a fall over `cells` leaves would be the mirror image of rubble already in the room it ends in: what no two shafts make. */
export function mirroredBelow(work: TerrainWork, drop: Drop, cells: readonly CellPoint[]): boolean {
  const { bottom } = drop;
  return bottom !== null && work.floors[bottom.floor]?.mirrorsAnother(bottom.rc.room, 'chasm-floor', cells) === true;
}

/** An aven for the roof exit `way` over a cell of the room off its ways (lane, doors, stairs), inner cells first; whether one was laid. */
function avenIn(work: TerrainWork, k: number, rc: RoomCells, rng: Rng, way: VerticalWay): boolean {
  const floor = work.floors[k];
  if (!floor) return false;
  const avens = new Set(floor.inRoom(rc.room.id).filter((p) => p.kind === 'aven').flatMap((p) => p.cells.map((c) => cellKey(c.x, c.y))));
  const apart = (c: CellPoint): boolean => ![-1, 0, 1].some((dx) => [-1, 0, 1].some((dy) => avens.has(cellKey(c.x + dx, c.y + dy))));
  const open = shuffled(rng, floorCellsOf(rc.room).filter((c) => rc.fits([c]) && !rc.inLane(c) && !rc.nearStairs(c) && apart(c)));
  // A chimney rises from the middle of a roof more often than from its edge.
  const ordered = [...open.filter((c) => rc.clearOfRock(c)), ...open.filter((c) => !rc.clearOfRock(c))];
  // Walked under, but no cover stands where a chimney comes down: the room keeps a place for its own.
  return ordered.some((c) => keepsPlaceForCover(floor, rc, [c], 'walk') && floor.place(draft('aven', rc.room.id, [c], { traits: { drop: dropOf(way) } })) !== null);
}

/** The shafts and avens of every chamber of floor `k` whose roll gave it exits in its floor or roof. */
export function placeVerticalExits(work: TerrainWork, k: number): void {
  const floor = work.floors[k];
  if (!floor || !work.cave) return;
  for (const room of floor.plan.rooms) {
    const rc = floor.room(room.id);
    if (!rc || !room.vertical) continue;
    const { up } = room.vertical;
    // The widest floor exit is the one a pitch goes down.
    const down = room.vertical.down.slice(pitchesDown(work, k, rc) ? 1 : 0);
    const held = holdsHole(work, k, room.id);
    let left = rc.floorCount < SMALL_CHAMBER ? (held ? 0 : 1) : Infinity;
    if (down.length > 0 && mayOpenHole(work, k, room)) {
      const rng = work.rng(k, `shafts:${room.id}`);
      const wanted = Math.min(MOST_PER_CHAMBER, down.length, left + (held ? 1 : 0)) - (held ? 1 : 0);
      for (const way of down.slice(0, Math.max(0, wanted))) {
        if (!shaftIn(work, k, rc, rng, way)) break;
        left--;
      }
    }
    if (up.length > 0) {
      const rng = work.rng(k, `avens:${room.id}`);
      for (const way of up.slice(0, Math.max(0, Math.min(MOST_PER_CHAMBER, left)))) if (!avenIn(work, k, rc, rng, way)) break;
    }
  }
}
