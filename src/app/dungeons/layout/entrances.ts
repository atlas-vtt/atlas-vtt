/**
 * The entry floor's ways in: the first, at the origin, must open onto the ground around the
 * dungeon; the second comes from a medium size up always, in smaller dungeons now and then.
 * It is the less obvious one: in an outer wall facing another way than the first entrance, into a
 * room far from the first (a secret wing's too), and sometimes a door or a secret door.
 */

import type { CellDir } from '../model';
import type { DungeonParams } from '../params';
import { cellKey, dir } from '../geometry';
import { type KeyedRng, chance, pick, weighted } from '../rng';
import { hops, neighbours } from '../roomGraph';
import { normalCount } from './grow';
import { freeOuterCells, openGround } from './outerDoors';
import { type WorkLayout, isNormal, liveRooms } from './workLayout';

/** From this many normal rooms a floor has two ways in. */
export const TWO_ENTRANCES_FROM = 6;
/** Below it, the chance of a second way in all the same. */
const SMALL_SECOND_CHANCE = 0.3;
/** The second entrance's room lies at least this share of the floor's farthest way from the first room. */
export const SECOND_ENTRANCE_REACH = 0.5;

function sameDir(a: CellDir, b: CellDir): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Checks the first entrance and adds the second where the floor wants one (never where `second`
 * is false: a five-room dungeon has one way in, past its guard post). False when the first
 * opens onto rock the rooms grew round, or a second is wanted and none can stand: the floor is
 * then grown anew.
 */
export function placeEntrances(rngOf: KeyedRng, layout: WorkLayout, params: DungeonParams, second = true): boolean {
  const rng = rngOf('entrances');
  const first = layout.doors.find((door) => door.from === null);
  const ground = openGround(layout);
  if (!first || !ground.has(cellKey(first.x - first.dir.x, first.y - first.dir.y))) return false;
  const wanted = second && (normalCount(layout) >= TWO_ENTRANCES_FROM || chance(rng, SMALL_SECOND_CHANCE));
  if (!wanted) return true;
  const away = dir(-first.dir.x, -first.dir.y);
  const distances = hops(neighbours(layout.rooms.length, layout.doors), 0);
  const reach = Math.max(...distances.filter(Number.isFinite));
  const near = Math.max(2, Math.ceil(reach * SECOND_ENTRANCE_REACH));
  const options = liveRooms(layout)
    .filter((room) => room.id !== 0 && !room.boss && isNormal(room) && (distances[room.id] ?? 0) >= near)
    .map((room) => ({ room, cells: freeOuterCells(layout, room, ground).filter(({ out }) => !sameDir(out, away)) }))
    .filter((option) => option.cells.length > 0);
  if (options.length === 0) return normalCount(layout) < TWO_ENTRANCES_FROM;
  const { room, cells } = weighted(rng, options.map((option) => [option, (distances[option.room.id] ?? 0) ** 2] as const));
  const { cell, out } = pick(rng, cells);
  layout.doors.push({ x: cell.x, y: cell.y, dir: dir(-out.x, -out.y), kind: weighted(rng, [['opening', 2], ['door', 1], ['secret', params.secretEntranceWeight]] as const), from: null, to: room.id, loop: false });
  return true;
}
