/**
 * How each way between two caves is passed once the main path is known. The main path is walked
 * upright (the book's way on is a cave's largest exit), so a door on it is a walk whatever it
 * rolled, unless that largest exit is itself a crawl or tighter; a special route never lies on it.
 * A hidden crawl is a crawl, a scree step and a cave's mouth are walked. A cave that blocks its
 * ways chokes a chamber's widest way off the main path with breakdown; a cave whose water never
 * runs calm drops every stream over a fall.
 */

import type { CaveWay } from '../../../caveModel';
import { cellKey } from '../../../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../../model';
import { type Rng, chance } from '../../../rng';
import { CRAWL_WIDTH, wayOfWidth } from './caveExits';
import { type ChamberTier, tierIndex } from './caveSizes';

/** A way two cells wide, in feet: what a door on the main path is. */
export const LANE_WIDTH = 10;
/** The ways too low or tight to walk: their passage and their narrows are one cell across. */
export const NARROW_WAYS: ReadonlySet<CaveWay> = new Set<CaveWay>(['crawl', 'squeeze', 'letterbox']);
/** The least two chambers are for a walk wider than two cells between them to run three cells across. */
const GREAT_TIER: ChamberTier = 'quadruple';
/** The least a chamber is, beside another, for a walk between them to stand two cells wide off the main path. */
const WIDE_TIER: ChamberTier = 'triple';

/**
 * A cave door's way, by its kind and whether the main path passes it. The main path walks a door
 * whatever it rolled, but where it is `pinched` (its chamber has no way on wider than a crawl):
 * there it is passed as the size it rolled, a special way included, which is never on the path.
 */
export function caveDoorWay(door: DungeonDoor, onLane: boolean, pinched = false): DungeonDoor {
  if (door.kind === 'secret') return { ...door, way: 'crawl', width: Math.min(door.width ?? CRAWL_WIDTH, CRAWL_WIDTH) };
  if (door.kind === 'steps' || door.from === null) return { ...door, way: 'walk' };
  if (pinched) return { ...door, way: wayOfWidth(door.width ?? CRAWL_WIDTH) };
  if (onLane) return { ...door, way: 'walk', width: Math.max(door.width ?? LANE_WIDTH, LANE_WIDTH) };
  return { ...door, way: door.way ?? 'walk' };
}

/**
 * Whether the door is a way on from a chamber whose largest exit rolled a crawl or tighter
 * (`DungeonRoom.tight`; the book gives a chamber's largest exit 2d6 ft, so about one in six),
 * passed that narrow: a door of the room tree, four feet wide or less, of that chamber or of a
 * passage that leads on from it. A loop's door rolled apart from any chamber, so it never is.
 */
export function onlyNarrowWaysOn(door: DungeonDoor, rooms: readonly DungeonRoom[]): boolean {
  if (door.from === null || door.to === null || rooms[door.to]?.parent !== door.from || door.width === undefined || door.width > CRAWL_WIDTH) return false;
  return sourceChamber(rooms, door.from)?.tight === true;
}

/** Whether the room is a chamber of `least` tier or larger. */
function atLeast(rooms: readonly DungeonRoom[], id: number | null | undefined, least: ChamberTier): boolean {
  const tier = id === null || id === undefined ? undefined : rooms[id]?.tier;
  return tier !== undefined && tier !== 'junction' && tierIndex(tier) >= tierIndex(least);
}

/** Whether a walk off the main path may stand two cells wide: ten feet or more between two chambers of three rooms or larger. */
export function mayWalkWide(door: DungeonDoor, rooms: readonly DungeonRoom[]): boolean {
  return door.way === 'walk' && (door.width ?? 0) >= LANE_WIDTH && atLeast(rooms, door.from, WIDE_TIER) && atLeast(rooms, door.to, WIDE_TIER);
}

/** The chamber a way through `id` was rolled at: `id` itself where it is one, else the nearest up the tree. */
export function sourceChamber(rooms: readonly DungeonRoom[], id: number | null): DungeonRoom | undefined {
  let room = id === null ? undefined : rooms[id];
  // The tree's parents lead to its root; the count only guards against a model that loops.
  for (let steps = 0; room && room.kind !== 'room' && steps < rooms.length; steps++) room = room.parent === null ? undefined : rooms[room.parent];
  return room?.kind === 'room' ? room : undefined;
}

/**
 * How many cells across a cave passage entered by a walk runs: two for a walk ten feet wide,
 * three for one wider still between two chambers of four rooms or larger (the chamber it was
 * rolled at and one it opens into); undefined for a narrower walk, which runs one or two, and for
 * any other way. A narrow route is one cell (`DungeonRoom.narrow`), decided apart: a door narrowed
 * as the route's far end leads into a passage that opens again.
 */
export function passageCells(entered: DungeonDoor, room: DungeonRoom, rooms: readonly DungeonRoom[], doors: readonly DungeonDoor[]): 2 | 3 | undefined {
  const way = entered.way ?? 'walk';
  if (way !== 'walk' || (entered.width ?? 0) < LANE_WIDTH) return undefined;
  const great = atLeast(rooms, sourceChamber(rooms, entered.from)?.id, GREAT_TIER) && doors.some((door) => door.from === room.id && door.to !== null && rooms[door.to]?.kind === 'room' && atLeast(rooms, door.to, GREAT_TIER));
  return great && (entered.width ?? 0) > LANE_WIDTH ? 3 : 2;
}

const SPECIAL: ReadonlySet<CaveWay> = new Set<CaveWay>(['traverse', 'sump', 'breakdown']);

/**
 * In a cave that blocks its ways, about one chamber in three (`share`) has its widest way out off
 * the main path choked by breakdown. `onLane` tells the doors the main path passes, by index.
 */
export function blockWays(rng: Rng, doors: readonly DungeonDoor[], rooms: readonly DungeonRoom[], onLane: (k: number) => boolean, share: number): DungeonDoor[] {
  if (share <= 0) return [...doors];
  const out = [...doors];
  for (const room of rooms.filter((r) => r.kind === 'room')) {
    if (!chance(rng, share)) continue;
    const ways = out.map((door, k) => ({ door, k })).filter(({ door, k }) => door.from === room.id && door.kind === 'opening' && !onLane(k) && !SPECIAL.has(door.way ?? 'walk'));
    const widest = ways.sort((a, b) => (b.door.width ?? 0) - (a.door.width ?? 0) || a.k - b.k)[0];
    if (widest) out[widest.k] = { ...widest.door, way: 'breakdown' };
  }
  return out;
}

/**
 * Every door between two rooms a stream runs through is a fall: scree that drops downstream,
 * walked; but where the main path (`lane`) pinches through a crawl, the stream runs through it.
 */
export function streamFalls(doors: readonly DungeonDoor[], streams: readonly (readonly number[])[], lane: readonly CellPoint[] = []): DungeonDoor[] {
  const path = new Set(lane.map((c) => cellKey(c.x, c.y)));
  const downstream = new Map<string, number>();
  for (const chain of streams) {
    for (let k = 0; k + 1 < chain.length; k++) {
      const [up, down] = [chain[k]!, chain[k + 1]!];
      downstream.set(`${Math.min(up, down)}:${Math.max(up, down)}`, down);
    }
  }
  return doors.map((door) => {
    if (door.from === null || door.to === null || door.kind === 'secret') return door;
    if (!door.wide && NARROW_WAYS.has(door.way ?? 'walk') && path.has(cellKey(door.x, door.y))) return door;
    const down = downstream.get(`${Math.min(door.from, door.to)}:${Math.max(door.from, door.to)}`);
    if (down === undefined) return door;
    const fall: DungeonDoor = { ...door, kind: 'steps', way: 'walk' };
    if (down === door.to) fall.descends = true;
    else delete fall.descends;
    return fall;
  });
}
