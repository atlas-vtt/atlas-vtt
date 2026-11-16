/**
 * What room-type assignment reads of each normal room from the layout alone: its size among the
 * rooms of its floor, its shape, how deep it lies from the entrance across floors, how many doors
 * it has, whether one of its walls is an outer wall, and what the layout already made of it (a
 * secret room, the boss room, a five-room stage, a stair room, a colonnade).
 */

import type { PlannedFloor } from '../../floors/planFloors';
import { type CellRect, cellKey, holdsStairs, houseCells, rectsTouch, roomArea, wallRect } from '../../geometry';
import { outerWallCells } from '../../growth/outerWalls';
import type { DungeonRoom, FiveRoomStage } from '../../model';
import { hops, neighbours } from '../../roomGraph';
import type { Degree, DepthBand, SizeClass } from '../themeTypes';

export interface RoomTraits {
  /** Its place in the list of every floor's normal rooms. */
  index: number;
  floor: number;
  room: number;
  area: number;
  size: SizeClass;
  long: boolean;
  square: boolean;
  rotunda: boolean;
  /** 0 at the entrance to 1 at the far end of the last floor. */
  depth: number;
  band: DepthBand;
  /** The depth band within its own floor (all of the entrance floor is the dungeon's front once there are three floors). */
  floorBand: DepthBand;
  doors: number;
  degree: Degree;
  outerWall: boolean;
  secret: boolean;
  boss: boolean;
  stage?: FiveRoomStage;
  stairs: boolean;
  colonnade: boolean;
}

/** Rooms of this much floor or less are tiny. */
const TINY_AREA = 6;
/** The share of a floor's rooms, by area, that is large, and the share that is small. */
const LARGE_SHARE = 0.3;
const SMALL_SHARE = 0.4;
/** A room no more than this much longer than wide is square. */
const SQUARE_RATIO = 1.25;

function sizesOf(rooms: readonly DungeonRoom[]): Map<number, SizeClass> {
  const ranked = [...rooms].sort((a, b) => roomArea(b) - roomArea(a) || a.id - b.id);
  const large = Math.round(ranked.length * LARGE_SHARE);
  const small = ranked.length - Math.round(ranked.length * SMALL_SHARE);
  return new Map(ranked.map((room, rank): [number, SizeClass] => {
    if (rank === 0) return [room.id, 'largest'];
    if (roomArea(room) <= TINY_AREA) return [room.id, 'tiny'];
    if (rank < large) return [room.id, 'large'];
    return [room.id, rank >= small ? 'small' : 'medium'];
  }));
}

/** Whether a side of the room's walls has no other room's walls on it or within a cell beyond it. */
function onOuterWall(room: DungeonRoom, rooms: readonly DungeonRoom[]): boolean {
  const w = wallRect(room);
  const bands: CellRect[] = [
    { x0: w.x0 + 1, x1: w.x1 - 1, y0: w.y0 - 1, y1: w.y0 },
    { x0: w.x0 + 1, x1: w.x1 - 1, y0: w.y1, y1: w.y1 + 1 },
    { x0: w.x0 - 1, x1: w.x0, y0: w.y0 + 1, y1: w.y1 - 1 },
    { x0: w.x1, x1: w.x1 + 1, y0: w.y0 + 1, y1: w.y1 - 1 },
  ];
  const others = rooms.filter((other) => other.id !== room.id).map(wallRect);
  return bands.some((band) => others.every((other) => !rectsTouch(band, other)));
}

function degreeOf(doors: number): Degree {
  if (doors <= 1) return 'dead-end';
  return doors >= 3 ? 'hub' : 'through';
}

function bandOf(depth: number): DepthBand {
  if (depth < 1 / 3) return 'front';
  return depth < 2 / 3 ? 'middle' : 'deep';
}

/** The traits of every floor's normal rooms, floor by floor in room order. */
export function roomTraits(floors: readonly PlannedFloor[]): RoomTraits[] {
  const out: RoomTraits[] = [];
  floors.forEach((floor, index) => {
    // A house's walls stand on cell edges: its rooms' outer walls face cells outside it.
    const house = floor.house && houseCells({ rooms: floor.rooms, stacks: floor.house.stacks });
    const normal = floor.rooms.filter((room) => room.kind === 'room');
    const sizes = sizesOf(normal);
    const distance = hops(neighbours(floor.rooms.length, floor.doors), 0);
    const maxHops = Math.max(0, ...distance.filter(Number.isFinite));
    for (const room of normal) {
      const doors = floor.doors.filter((door) => door.from === room.id || door.to === room.id).length;
      const reach = distance[room.id] ?? Infinity;
      const floorDepth = (Number.isFinite(reach) ? reach : maxHops) / (maxHops + 1);
      const depth = (index + floorDepth) / floors.length;
      const longSide = Math.max(room.w, room.h);
      const shortSide = Math.min(room.w, room.h);
      out.push({
        index: out.length,
        floor: index,
        room: room.id,
        area: roomArea(room),
        size: sizes.get(room.id) ?? 'medium',
        long: longSide >= 2 * shortSide,
        square: longSide <= shortSide * SQUARE_RATIO,
        rotunda: room.rotunda,
        depth,
        band: bandOf(depth),
        floorBand: bandOf(floorDepth),
        doors,
        degree: degreeOf(doors),
        outerWall: house ? outerWallCells(room, floor.rooms, (x, y) => !house.has(cellKey(x, y))).size > 0 : onOuterWall(room, floor.rooms),
        secret: room.wing === 'secret',
        boss: room.boss,
        ...(room.stage && { stage: room.stage }),
        stairs: holdsStairs(room, floor.stairs),
        colonnade: room.colonnade,
      });
    }
  });
  // Of rooms equally deep, the boss room is the deepest.
  const deeper = (t: RoomTraits, best: RoomTraits): boolean => t.depth > best.depth || (t.depth === best.depth && t.boss && !best.boss);
  const last = out.filter((t) => t.floor === floors.length - 1).reduce<RoomTraits | undefined>((best, t) => (!best || deeper(t, best) ? t : best), undefined);
  if (last) last.band = 'deepest';
  return out;
}
