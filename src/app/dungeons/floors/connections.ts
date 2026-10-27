/**
 * The stairwells between two floors. The first leads on (down in a Cavern, up in a building) from
 * a room of the earlier floor far from where that floor is entered, and the next floor grows
 * around its other end. Where both floors have six rooms or more, a second joins rooms that lie
 * over each other, as far from the first as both floors' rooms allow, so a party has two ways
 * between them.
 */

import type { CellPoint, DungeonDoor, DungeonRoom } from '../model';
import { cellKey, cellsOf, contains, floorRect, intersection, stepsWithin } from '../geometry';
import { type Rng, pick, weighted } from '../rng';
import { hops, neighbours } from '../roomGraph';
import { type FloorStack, stairEnd } from './floorStack';
import { type FloorSpace, type StairSpot, approachCells, spotFits, spotRect, spotsWithin } from './stairSpots';

/** Two ways between floors from this many normal rooms on each. */
export const TWO_CONNECTIONS_FROM = 6;
/** A second stairwell's rooms lie at least this many doors from the first's, on both floors. */
export const MIN_CONNECTION_SPREAD = 2;

export interface FloorShape {
  rooms: readonly DungeonRoom[];
  doors: readonly DungeonDoor[];
  stairs: readonly (StairSpot & { to: number })[];
}

export interface PlacedStair {
  room: number;
  spot: StairSpot;
}

export function spaceOf(floor: FloorShape, index: number, stack: FloorStack): FloorSpace {
  return { doors: floor.doors, stairs: floor.stairs, ends: floor.stairs.map((stair) => stairEnd(stack, index, stair.to)) };
}

export function normalRooms(floor: Pick<FloorShape, 'rooms'>): number {
  return floor.rooms.filter((room) => room.kind === 'room').length;
}

/** The rooms that hold a stairwell end, and room 0 (where the floor is entered). */
function anchors(floor: FloorShape): number[] {
  const holders = floor.stairs.map((stair) => floor.rooms.find((room) => room.kind === 'room' && rectHolds(room, stair))?.id ?? 0);
  return [0, ...holders];
}

function rectHolds(room: DungeonRoom, spot: StairSpot): boolean {
  return contains(floorRect(room), spotRect(spot));
}

/** Doors walked from the nearest of `from` to every room. */
function distanceFrom(floor: FloorShape, from: readonly number[]): number[] {
  const adjacent = neighbours(floor.rooms.length, floor.doors);
  const each = from.map((id) => hops(adjacent, id));
  return floor.rooms.map((room) => Math.min(...each.map((d) => d[room.id] ?? Infinity)));
}

function holdsStairs(room: DungeonRoom): boolean {
  return room.kind === 'room' && !room.rotunda && !room.boss && room.wing === 'regular';
}

/** The cells of the way straight in from the room's door from outside, across the room; none without one. */
function wayIn(room: DungeonRoom, doors: readonly DungeonDoor[]): CellPoint[] {
  const door = doors.find((d) => d.from === null && d.to === room.id);
  return door ? stepsWithin(floorRect(room), door, door.dir) : [];
}

/** The room a floor is entered by: room 0 where it is a normal room, else the normal room fewest doors from it. */
export function entranceRoom(floor: Pick<FloorShape, 'rooms' | 'doors'>): DungeonRoom | undefined {
  const reach = hops(neighbours(floor.rooms.length, floor.doors), 0);
  return floor.rooms.filter((room) => room.kind === 'room').sort((a, b) => (reach[a.id] ?? Infinity) - (reach[b.id] ?? Infinity) || a.id - b.id)[0];
}

/**
 * Where the first stairwell on from floor `index` to the next stands: in the room the floor is
 * entered by where `fromEntrance` and it can hold one (a gate tower's stair, a grand staircase),
 * else a room the farther from its entry and other stairs, the likelier; only where the next
 * floor's landing can stand round it (`lands`), and at least `across` cells wide.
 */
export function chooseOnward(rng: Rng, floor: FloorShape, index: number, stack: FloorStack, fromEntrance = false, lands: (spot: StairSpot) => boolean = () => true, across = 1): PlacedStair | null {
  const space = spaceOf(floor, index, stack);
  const end = stairEnd(stack, index, index + 1);
  const firstRoom = fromEntrance ? entranceRoom(floor) : undefined;
  if (firstRoom && holdsStairs(firstRoom)) {
    const spots = spotsWithin(floorRect(firstRoom), across).filter((spot) => spotFits(firstRoom, space, spot, end) && lands(spot));
    // The stairs stand beside the way in, never across it, on either floor.
    const way = new Set(wayIn(firstRoom, floor.doors).map((c) => cellKey(c.x, c.y)));
    const off = spots.filter((spot) => ![...cellsOf(spotRect(spot)), ...approachCells(spot, 'upper'), ...approachCells(spot, 'lower')].some((c) => way.has(cellKey(c.x, c.y))));
    const chosen = off.length > 0 ? off : spots;
    if (chosen.length > 0) return { room: firstRoom.id, spot: pick(rng, chosen) };
  }
  const distance = distanceFrom(floor, anchors(floor));
  let options = floor.rooms.filter(holdsStairs).map((room) => [room, ((distance[room.id] ?? 0) + 1) ** 2] as const);
  while (options.length > 0) {
    const room = weighted(rng, options);
    const spots = spotsWithin(floorRect(room), across).filter((spot) => spotFits(room, space, spot, end) && lands(spot));
    if (spots.length > 0) return { room: room.id, spot: pick(rng, spots) };
    options = options.filter(([other]) => other !== room);
  }
  return null;
}

/** Rooms of the earlier and later floor that lie over each other, the pairs farthest from the stairs already there first. */
function overlappingPairs(earlier: FloorShape, later: FloorShape): { a: DungeonRoom; b: DungeonRoom; spread: number }[] {
  const earlierFar = distanceFrom(earlier, anchors(earlier));
  const laterFar = distanceFrom(later, anchors(later));
  const pairs: { a: DungeonRoom; b: DungeonRoom; spread: number }[] = [];
  for (const a of earlier.rooms.filter(holdsStairs)) {
    for (const b of later.rooms.filter(holdsStairs)) {
      const spread = Math.min(earlierFar[a.id] ?? 0, laterFar[b.id] ?? 0);
      if (spread >= MIN_CONNECTION_SPREAD && intersection(floorRect(a), floorRect(b))) pairs.push({ a, b, spread });
    }
  }
  return pairs.sort((x, y) => y.spread - x.spread);
}

/**
 * A further stairwell between `earlier` (floor `index`) and `later` (floor `index + 1`): rooms that
 * lie over each other and hold the same rectangle on both, as far from the stairs between them
 * already as both floors allow (at least `MIN_CONNECTION_SPREAD` doors); null where none can stand.
 */
export function extraConnection(rng: Rng, earlier: FloorShape, later: FloorShape, index: number, stack: FloorStack, allowed: (spot: StairSpot) => boolean = () => true): StairSpot | null {
  const earlierSpace = spaceOf(earlier, index, stack);
  const laterSpace = spaceOf(later, index + 1, stack);
  const earlierEnd = stairEnd(stack, index, index + 1);
  const laterEnd = stairEnd(stack, index + 1, index);
  const spots: StairSpot[] = [];
  let widest = 0;
  for (const { a, b, spread } of overlappingPairs(earlier, later)) {
    if (spots.length > 0 && spread < widest * 0.75) break;
    const shared = intersection(floorRect(a), floorRect(b));
    const fitting = shared ? spotsWithin(shared).filter((spot) => spotFits(a, earlierSpace, spot, earlierEnd) && spotFits(b, laterSpace, spot, laterEnd) && allowed(spot)) : [];
    if (fitting.length === 0) continue;
    if (spots.length === 0) widest = spread;
    spots.push(...fitting);
  }
  return spots.length > 0 ? pick(rng, spots) : null;
}
