/**
 * How each way between two caves is passed once the main path is known. The main path is always
 * walked upright (the book's way on is a cave's largest exit), so a door on it is a walk whatever
 * it rolled, and a special route never lies on it; a hidden crawl is a crawl, a scree step and a
 * cave's mouth are walked. A cave that blocks its ways chokes a chamber's widest way off the main
 * path with breakdown; a cave whose water never runs calm drops every stream over a fall.
 */

import type { CaveWay } from '../../../caveModel';
import type { DungeonDoor, DungeonRoom } from '../../../model';
import { type Rng, chance } from '../../../rng';
import { CRAWL_WIDTH } from './caveExits';
import { type ChamberTier, tierIndex } from './caveSizes';

/** A way two cells wide, in feet: what a door on the main path is. */
export const LANE_WIDTH = 10;
/** The least a chamber is, beside another, for a walk between them to stand two cells wide off the main path. */
const WIDE_TIER: ChamberTier = 'triple';

/** A cave door's way, by its kind and whether the main path passes it. */
export function caveDoorWay(door: DungeonDoor, onLane: boolean): DungeonDoor {
  if (door.kind === 'secret') return { ...door, way: 'crawl', width: Math.min(door.width ?? CRAWL_WIDTH, CRAWL_WIDTH) };
  if (door.kind === 'steps' || door.from === null) return { ...door, way: 'walk' };
  if (onLane) return { ...door, way: 'walk', width: Math.max(door.width ?? LANE_WIDTH, LANE_WIDTH) };
  return { ...door, way: door.way ?? 'walk' };
}

/** Whether a walk off the main path may stand two cells wide: ten feet or more between two chambers of three rooms or larger. */
export function mayWalkWide(door: DungeonDoor, rooms: readonly DungeonRoom[]): boolean {
  const large = (id: number | null): boolean => {
    const tier = id === null ? undefined : rooms[id]?.tier;
    return tier !== undefined && tier !== 'junction' && tierIndex(tier) >= tierIndex(WIDE_TIER);
  };
  return door.way === 'walk' && (door.width ?? 0) >= LANE_WIDTH && large(door.from) && large(door.to);
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

/** Every door between two rooms a stream runs through is a fall: scree that drops downstream, walked. */
export function streamFalls(doors: readonly DungeonDoor[], streams: readonly (readonly number[])[]): DungeonDoor[] {
  const downstream = new Map<string, number>();
  for (const chain of streams) {
    for (let k = 0; k + 1 < chain.length; k++) {
      const [up, down] = [chain[k]!, chain[k + 1]!];
      downstream.set(`${Math.min(up, down)}:${Math.max(up, down)}`, down);
    }
  }
  return doors.map((door) => {
    if (door.from === null || door.to === null || door.kind === 'secret') return door;
    const down = downstream.get(`${Math.min(door.from, door.to)}:${Math.max(door.from, door.to)}`);
    if (down === undefined) return door;
    const fall: DungeonDoor = { ...door, kind: 'steps', way: 'walk' };
    if (down === door.to) fall.descends = true;
    else delete fall.descends;
    return fall;
  });
}
