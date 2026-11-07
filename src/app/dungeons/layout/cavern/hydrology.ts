/**
 * Where a cave's floor lies low and where its water stands and runs (report §6.9 rule 1): every
 * room has a height, each floor a whole step below the one above plus slow noise; water stands in
 * rooms lower than every room beside them (basins), runs to them down chains of rooms that fall
 * all the way (streams), and a boss room may hold a lake behind a dam.
 */

import type { CaveFloor, DungeonFloor, DungeonRoom } from '../../model';
import { type Rng, floorStream, int } from '../../rng';
import { neighbours } from '../../roomGraph';
import type { CaveSites } from './caveSites';
import { fractalNoise } from '../../water/noise';

/** The height step between floors, against noise in [0, 1). */
export const FLOOR_DROP = 10;
/** Cells over which the floor rises and falls. */
const HEIGHT_PERIOD = 18;
/** At this water level every low room holds water. */
const FULL_LEVEL = 0.9;

/**
 * By room id: −index × `FLOOR_DROP` plus slow noise at the room's middle; lower is deeper. Each
 * floor further down is more broken, so it has more low rooms for its water.
 */
export function caveHeights(seed: number, index: number, rooms: readonly DungeonRoom[]): number[] {
  const noise = fractalNoise(floorStream(seed, 'cave', index, 'heights'), 2, 0.5, HEIGHT_PERIOD / (1 + index / 2));
  return rooms.map((room) => {
    const n = 0.5 + 0.7 * noise(room.x + room.w / 2, room.y + room.h / 2);
    return -index * FLOOR_DROP + Math.min(0.999, Math.max(0, n));
  });
}

/** The chambers a room's passages lead to: its neighbours, through tunnels to the chambers beyond them. */
function nextChambers(floor: Pick<DungeonFloor, 'rooms' | 'doors'>, adjacent: readonly number[][], room: number): number[] {
  const out = new Set<number>();
  const seen = new Set([room]);
  const queue = [...(adjacent[room] ?? [])];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head]!;
    if (seen.has(at)) continue;
    seen.add(at);
    if (floor.rooms[at]?.kind === 'room') out.add(at);
    else queue.push(...(adjacent[at] ?? []));
  }
  return [...out];
}

/**
 * The chambers lower than every chamber their passages lead to, lowest first: where water may
 * stand. On the cave's deepest floor (`lowest`), where none is, its lowest chamber but the boss's:
 * the bottom of the whole cave, where its water ends up.
 */
export function lowRooms(floor: Pick<DungeonFloor, 'rooms' | 'doors'>, heights: readonly number[], lowest = false): number[] {
  const adjacent = neighbours(floor.rooms.length, floor.doors);
  const height = (id: number): number => heights[id] ?? 0;
  const chambers = floor.rooms.filter((room) => room.kind === 'room' && room.wing === 'regular' && !room.boss).sort((a, b) => height(a.id) - height(b.id) || a.id - b.id);
  const low = chambers.filter((room) => nextChambers(floor, adjacent, room.id).every((n) => height(n) > height(room.id))).map((room) => room.id);
  return low.length === 0 && lowest && chambers[0] ? [chambers[0].id] : low;
}

/** How many of a cave's low rooms hold water at `level`: about a third at 0.3, two thirds at 0.6. */
export function basinCount(lows: number, level: number): number {
  return level <= 0 ? 0 : Math.max(lows ? 1 : 0, Math.round(lows * Math.min(1, level / FULL_LEVEL)));
}

/**
 * The floor's basins (`take` of its low rooms, lowest first; unset, as many as `level` gives), the
 * streams that run to them and the dammed lakes it may hold; none when `dry`.
 */
export function hydrology(rng: Rng, floor: Pick<DungeonFloor, 'rooms' | 'doors'>, heights: readonly number[], level: number, dry: boolean, take?: number, lowest = false): Pick<CaveFloor, 'basins' | 'streams' | 'dams'> {
  if (dry || level <= 0) return { basins: [], streams: [], dams: [] };
  const adjacent = neighbours(floor.rooms.length, floor.doors);
  const height = (id: number): number => heights[id] ?? 0;
  const lows = lowRooms(floor, heights, lowest);
  const basins = lows.slice(0, take ?? basinCount(lows.length, level));
  const taken = new Set(basins);
  const streams: number[][] = [];
  for (const basin of basins) {
    const chain = [basin];
    for (let length = int(rng, 1, 3); chain.length <= length; ) {
      const at = chain[chain.length - 1]!;
      const up = (adjacent[at] ?? []).filter((n) => !taken.has(n) && height(n) > height(at) && floor.rooms[n]?.wing === 'regular' && !floor.rooms[n]?.boss).sort((a, b) => height(a) - height(b) || a - b);
      const next = up[0];
      if (next === undefined) break;
      chain.push(next);
      taken.add(next);
    }
    if (chain.length > 1) streams.push(chain.reverse());
  }
  const boss = floor.rooms.find((room) => room.boss);
  return { basins, streams, dams: boss ? [boss.id] : [] };
}

/** Hops from the mouth a lived-in cave's water lies at most: its hollows lie within two, a hop from it. */
const SPRING_REACH = 2;

/**
 * For a lived-in cave: a spring in the lowest chamber within two hops of the mouth, where no water
 * lies near enough to live by. It runs, a stream of its own that gathers nowhere, so it brings the
 * entry floor no lake and the deepest floor keeps the most water.
 */
export function springByTheMouth(floor: Pick<DungeonFloor, 'rooms' | 'cave'>, site: CaveSites): void {
  const cave = floor.cave;
  if (!cave) return;
  const near = (room: number): boolean => (site.hopsFromMouth[room] ?? Infinity) <= SPRING_REACH;
  if (floor.rooms.some((room) => near(room.id) && site.nearWater(room.id, 1))) return;
  const spring = floor.rooms
    .filter((room) => room.kind === 'room' && room.wing === 'regular' && !room.boss && near(room.id))
    .sort((a, b) => (cave.heights[a.id] ?? 0) - (cave.heights[b.id] ?? 0) || a.id - b.id)[0];
  if (spring) cave.streams.push([spring.id]);
}
