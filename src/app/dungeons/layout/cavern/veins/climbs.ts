/**
 * Ways that climb or drop within a floor: the book's routes run up and down as well as across, and
 * a pitch or a chimney of ten or twenty feet in a passage, roped, keeps a party on the same floor.
 * About one way in eight that leads between two caves off the main path climbs (the main path
 * stays walkable), never a hidden crawl, a scree step or a special route, and never where water
 * stands or runs on either side: a stream's way down is its fall. The lower side is the deeper
 * room, else a seeded one.
 */

import type { CaveFloor, CaveWay, DungeonDoor } from '../../../model';
import { cellKey } from '../../../geometry';
import { type Rng, chance } from '../../../rng';
import { verticalKindOf } from './caveExits';
import { climbDepth } from './routeLength';

/** The share of the ways that may climb which do. */
const CLIMB_SHARE = 1 / 8;
/** The ways a climb may take the place of: a pitch or a chimney is passed upright or braced, never through a slot. */
const CLIMBABLE: ReadonlySet<CaveWay> = new Set<CaveWay>(['walk', 'crawl', 'squeeze']);
/** A way's width where it rolled none, in feet: a walk's. */
const PLAIN_WIDTH = 5;

/** Whether the door may climb: an open way between two rooms off the main path, with no water by it. */
function mayClimb(door: DungeonDoor, lane: ReadonlySet<string>, wet: ReadonlySet<number>): boolean {
  if (door.kind !== 'opening' || door.from === null || door.to === null || door.wide) return false;
  return CLIMBABLE.has(door.way ?? 'walk') && !lane.has(cellKey(door.x, door.y)) && !wet.has(door.from) && !wet.has(door.to);
}

/**
 * The floor's doors with about one in eight of those that may (`mayClimb`) turned into a climb:
 * its depth from the exploding d4 at ten feet a turn, held to twenty, and its kind by its width.
 * Every door draws alike whether it climbs or not, so one door's roll never moves another's.
 */
export function inFloorClimbs(rng: Rng, doors: readonly DungeonDoor[], cave: Pick<CaveFloor, 'lane' | 'heights' | 'basins' | 'streams'>): DungeonDoor[] {
  const lane = new Set(cave.lane.map((c) => cellKey(c.x, c.y)));
  const wet = new Set([...cave.basins, ...cave.streams.flat()]);
  return doors.map((door) => {
    const climbs = chance(rng, CLIMB_SHARE);
    const depth = climbDepth(rng);
    const coin = chance(rng, 0.5);
    if (!climbs || !mayClimb(door, lane, wet)) return door;
    const width = door.width ?? PLAIN_WIDTH;
    const [from, to] = [cave.heights[door.from!] ?? 0, cave.heights[door.to!] ?? 0];
    const descends = from === to ? coin : to < from;
    const climb: DungeonDoor = { ...door, way: 'climb', width, drop: { depth, kind: verticalKindOf(width) } };
    if (descends) climb.descends = true;
    else delete climb.descends;
    return climb;
  });
}
