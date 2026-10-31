/**
 * Whether a floor's layout can be shaped into a cave that keeps its token-fit rules: the main path
 * fits two cells wide, and with it taken every chamber still has room for a 3 × 3 block of its own,
 * and every chamber holding a stairwell can join the row it is entered from to the rest of its floor
 * round it. Asked of every attempt at a Cavern floor, so a floor that cannot is grown anew.
 */

import { type StairEnd, type StairSpot, approachCells, spotRect } from '../../floors/stairSpots';
import { cellKey, cellsOf, contains, floorRect } from '../../geometry';
import type { DungeonRoom } from '../../model';
import { CaveGrid, type CaveFloorPlan } from './caveGrid';
import { reserveCores, stairsJoinRound } from './chambers';
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
  return (spot) => {
    if (!clear(spot)) return false;
    const room = chamberOf(floor.rooms, spot);
    // A floor whose own main path or cores do not fit takes no further way: nothing could be checked.
    if (!grid || !room) return false;
    return stairsJoinRound(grid, room, { cells: keysOf(cellsOf(spotRect(spot))), row: keysOf(approachCells(spot, end)) });
  };
}
