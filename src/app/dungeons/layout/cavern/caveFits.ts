/**
 * Whether a floor's layout can be shaped into a cave that keeps its token-fit rules: the main path
 * fits two cells wide, and with it taken every chamber still has room for a 3 × 3 block of its own,
 * and every chamber holding a stairwell can join the row it is entered from to the rest of its floor
 * round it. Asked of every attempt at a Cavern floor, so a floor that cannot is grown anew.
 */

import { type StairEnd, type StairSpot, approachCells, spotRect } from '../../floors/stairSpots';
import { cellKey, cellsOf, contains, floorRect } from '../../geometry';
import type { DungeonRoom } from '../../model';
import { CaveGrid, type CaveFloorPlan, ROCK } from './caveGrid';
import { type Takes, reserveCores, stairsJoinRound, takesOf } from './chambers';
import { type LaneEnd, claimLane, clearOfLane, laneEnds, mainRoute, wideLane } from './mainPath';

const keysOf = (cells: readonly { x: number; y: number }[]): string[] => cells.map((c) => cellKey(c.x, c.y));

/** The chamber whose rectangle holds the stairwell, if one does. */
function chamberOf(rooms: readonly DungeonRoom[], spot: StairSpot): DungeonRoom | undefined {
  return rooms.find((room) => room.kind === 'room' && contains(floorRect(room), spotRect(spot)));
}

/** The floor's grid with its main path from `from` to `to` claimed and every chamber's core kept; null where either does not fit. */
function laidGrid(floor: CaveFloorPlan, from: LaneEnd, to: LaneEnd, index: number): CaveGrid | null {
  const grid = new CaveGrid(floor, index);
  const route = mainRoute(floor, from, to);
  const lane = wideLane(grid, floor, route, from, to);
  if (!lane) return null;
  claimLane(grid, floor, route, lane);
  return reserveCores(grid, floor.rooms) ? grid : null;
}

/** Whether every chamber of the floor that holds a stairwell joins what it keeps round its stairwells on `grid` (`stairsJoinRound`). */
export function stairsJoin(grid: CaveGrid, floor: CaveFloorPlan): boolean {
  const holders = new Set(floor.stairs.flatMap((spot) => chamberOf(floor.rooms, spot) ?? []));
  return [...holders].every((room) => stairsJoinRound(grid, room));
}

/**
 * Whether every way in from outside opens on the floor's edge: the ground before it (the cell
 * outside its door) has no room's floor beyond it the way it faces, anywhere across the floor.
 * The first room grows at the origin and the floor round it, so a mouth could open into a bay
 * the rest of the cave closes round, and "opens to the outside to the west" then pointed into
 * more cave. Read from the rooms' rectangles, whose floor keeps to the door's line: the shaping
 * swells a cell past it at most, to the ground's line, and holds the rock beyond (`holdPastMouths`).
 */
export function mouthsOnEdge(floor: Pick<CaveFloorPlan, 'rooms' | 'doors'>): boolean {
  return floor.doors.every((door) => {
    if (door.from !== null) return true;
    // How far along the way out a point lies; the ground before the door lies one further than the door.
    const along = (x: number, y: number): number => -(x * door.dir.x + y * door.dir.y);
    const ground = along(door.x, door.y) + 1;
    return floor.rooms.every((room) => {
      const r = floorRect(room);
      return Math.max(along(r.x0, r.y0), along(r.x1, r.y1)) < ground;
    });
  });
}

/**
 * Holds every cell further out than the ground before a way in from outside as rock, across the
 * whole grid, so no chamber swells or tunnel winds past it: the rooms' rectangles keep to the line
 * (`mouthsOnEdge`), and the floor shaped round them must too.
 */
export function holdPastMouths(grid: CaveGrid, floor: Pick<CaveFloorPlan, 'doors'>): void {
  const { x0, y0, w, h } = grid.box();
  for (const door of floor.doors) {
    if (door.from !== null) continue;
    const along = (x: number, y: number): number => -(x * door.dir.x + y * door.dir.y);
    const ground = along(door.x, door.y) + 1;
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) if (along(x, y) > ground && grid.owner(x, y) === ROCK) grid.holdAsRock(x, y);
  }
}

export function caveFits(floor: CaveFloorPlan, from: LaneEnd, to: LaneEnd, index: number): boolean {
  const grid = laidGrid(floor, from, to, index);
  return grid !== null && stairsJoin(grid, floor);
}

/**
 * Where a further stairwell may end on cave floor `index`, its `end` there, once the floor is laid
 * with its own stairs: clear of the main path (`clearOfLane`), and with its row joined to the rest
 * of its chamber round every stairwell the chamber then holds (`stairsJoinRound`).
 */
export function furtherStairFits(floor: CaveFloorPlan, index: number, end: StairEnd): (spot: StairSpot) => boolean {
  const clear = clearOfLane(floor, index);
  const [from, to] = laneEnds(index, index + 2, floor, false);
  const grid = laidGrid(floor, from, to, index);
  // The floor stays as laid: what each chamber may take is worked out once, and each spot's answer
  // is kept, since every attempt at the next floor asks of the same spots again.
  const takes = new Map<number, Takes>();
  const known = new Map<string, boolean>();
  const fits = (spot: StairSpot): boolean => {
    if (!clear(spot)) return false;
    const room = chamberOf(floor.rooms, spot);
    // A floor whose own main path or cores do not fit takes no further way: nothing could be checked.
    if (!grid || !room) return false;
    let own = takes.get(room.id);
    if (!own) {
      own = takesOf(grid, room);
      takes.set(room.id, own);
    }
    return stairsJoinRound(grid, room, { cells: keysOf(cellsOf(spotRect(spot))), row: keysOf(approachCells(spot, end)) }, own);
  };
  return (spot) => {
    const key = `${spot.x},${spot.y},${spot.w},${spot.h},${spot.down.x},${spot.down.y}`;
    let answer = known.get(key);
    if (answer === undefined) {
      answer = fits(spot);
      known.set(key, answer);
    }
    return answer;
  };
}
