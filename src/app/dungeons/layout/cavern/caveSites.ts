/**
 * What a cave's floors know of their rooms beyond the layout, for its room types, terrain, water
 * and life: how far each room lies from the mouth (doors and stairwells walked), where water
 * stands or runs, the lane, the fault line crossing a room, which rooms lie deep, which near water.
 * Read from planned floors and finished ones alike.
 */

import { spotRect } from '../../floors/stairSpots';
import { cellKey, cellsOf, holdsCell } from '../../geometry';
import type { CaveFault, DungeonFloor } from '../../model';
import { neighbours } from '../../roomGraph';

export interface CaveSites {
  floor: number;
  deepest: boolean;
  /** Doors and stairwells walked from the entrance, by room id. */
  hopsFromMouth: readonly number[];
  /** Basins and stream rooms. */
  water: ReadonlySet<number>;
  lane: ReadonlySet<string>;
  /** A fault line that crosses three or more of the room's cells. */
  faultOf(room: number): CaveFault | null;
  /** On the deepest floor of several; on one, the boss room or in the last third by hops. */
  deep(room: number): boolean;
  nearWater(room: number, hops?: number): boolean;
}

type SiteFloor = Pick<DungeonFloor, 'rooms' | 'doors' | 'stairs' | 'cave'>;

/** A fault line crosses a cell where it passes within half a cell of its middle. */
const CROSSING = 0.5;
const CROSSED_CELLS = 3;

/** The room holding a stairwell's cells. */
function stairRoom(floor: SiteFloor, stair: DungeonFloor['stairs'][number]): number | undefined {
  const cells = cellsOf(spotRect(stair));
  return floor.rooms.find((room) => room.kind === 'room' && cells.every((c) => holdsCell(room, c.x, c.y)))?.id;
}

/** Hops from the entrance over every floor: doors on a floor, stairwells between them. */
function hopsFromMouth(floors: readonly SiteFloor[]): number[][] {
  const out = floors.map((floor) => floor.rooms.map(() => Infinity));
  const start = floors[0]?.doors.find((door) => door.from === null)?.to;
  if (start === undefined || start === null) return out;
  const adjacent = floors.map((floor) => neighbours(floor.rooms.length, floor.doors));
  const queue: [number, number][] = [[0, start]];
  out[0]![start] = 0;
  for (let head = 0; head < queue.length; head++) {
    const [f, room] = queue[head]!;
    const here = out[f]![room]!;
    const next: [number, number][] = (adjacent[f]![room] ?? []).map((n) => [f, n]);
    for (const stair of floors[f]!.stairs) {
      if (stairRoom(floors[f]!, stair) !== room) continue;
      const other = floors[stair.to]?.stairs.find((s) => s.link === stair.link);
      const there = other && stairRoom(floors[stair.to]!, other);
      if (there !== undefined) next.push([stair.to, there]);
    }
    for (const [g, n] of next) {
      if (out[g]![n] !== Infinity) continue;
      out[g]![n] = here + 1;
      queue.push([g, n]);
    }
  }
  return out;
}

function crossings(fault: CaveFault, cells: readonly { x: number; y: number }[]): number {
  const sin = Math.sin(fault.angle);
  const cos = Math.cos(fault.angle);
  return cells.filter((c) => Math.abs((c.x + 0.5 - fault.x) * sin - (c.y + 0.5 - fault.y) * cos) <= CROSSING).length;
}

/** The sites of every floor, built once and shared by the theme's facts and the terrain. */
export function caveSites(floors: readonly SiteFloor[]): CaveSites[] {
  const hops = hopsFromMouth(floors);
  return floors.map((floor, index) => {
    const cave = floor.cave;
    const water = new Set([...(cave?.basins ?? []), ...(cave?.streams.flat() ?? [])]);
    const own = hops[index]!;
    const reach = Math.max(0, ...own.filter(Number.isFinite));
    const adjacent = neighbours(floor.rooms.length, floor.doors);
    const several = floors.length > 1;
    const deepest = index === floors.length - 1;
    return {
      floor: index,
      deepest,
      hopsFromMouth: own,
      water,
      lane: new Set((cave?.lane ?? []).map((c) => cellKey(c.x, c.y))),
      faultOf: (room) => {
        const cells = floor.rooms[room]?.cells ?? [];
        return cave?.faults.find((fault) => crossings(fault, cells) >= CROSSED_CELLS) ?? null;
      },
      deep: (room) => (several ? deepest : floor.rooms[room]?.boss === true || (Number.isFinite(own[room]) && (own[room] ?? 0) >= (reach * 2) / 3)),
      nearWater: (room, within = 1) => {
        let ring = [room];
        const seen = new Set(ring);
        for (let step = 0; step <= within; step++) {
          if (ring.some((id) => water.has(id))) return true;
          ring = ring.flatMap((id) => adjacent[id] ?? []).filter((id) => !seen.has(id) && seen.add(id));
        }
        return false;
      },
    };
  });
}
