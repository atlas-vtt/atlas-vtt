/**
 * Which cells the main path may take on a cave floor and whose each becomes: a room's own cells
 * (its rectangle), a narrows' (its door cell and the wall cell beside it), or a tunnel's (its side
 * walls, where no other room's rectangle is near).
 */

import { type StairSpot, approachCells, spotRect } from '../../floors/stairSpots';
import { type CellRect, cellKey, cellsOf, doorCells, floorRect, inRect, wallRect } from '../../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import { type CaveFloorPlan, type CaveGrid, ROCK, doorOwner } from './caveGrid';

/** The rectangle a tunnel's cells lie in: its walls and, where it winds, the ring of rock round them. */
export function tunnelReach(room: DungeonRoom): CellRect {
  const r = wallRect(room);
  return { x0: r.x0 - TUNNEL_SWING, y0: r.y0 - TUNNEL_SWING, x1: r.x1 + TUNNEL_SWING, y1: r.y1 + TUNNEL_SWING };
}

/** Whether a tunnel may wind through the cell: one of its walls, or rock past them that no other room's walls hold and no entrance stands beside. */
export function inTunnelReach(floor: Pick<CaveFloorPlan, 'rooms' | 'doors'>, room: DungeonRoom, x: number, y: number): boolean {
  if (inRect(wallRect(room), x, y)) return true;
  return inRect(tunnelReach(room), x, y) && !floor.rooms.some((other) => other.id !== room.id && inRect(wallRect(other), x, y)) && !besideEntrance(floor.doors, x, y);
}

/**
 * Whether the cell touches a cell of a way in from outside (at a side or a corner). A cave taken
 * past its rooms' walls keeps off these, as a built room's wall does: floor there would stand on
 * the entrance's open mouth, and its wall would be left open with it.
 */
export function besideEntrance(doors: readonly DungeonDoor[], x: number, y: number): boolean {
  return doors.some((door) => door.from === null && doorCells(door).some((c) => Math.abs(c.x - x) <= 1 && Math.abs(c.y - y) <= 1));
}

/** How far past its rectangle a chamber may swell, in cells. */
export const CHAMBER_SWELL = 2;

/** How many cells the cell lies past the room's rectangle, 0 inside it. */
export function swellDistance(room: DungeonRoom, x: number, y: number): number {
  const r = floorRect(room);
  return Math.max(r.x0 - x, x - r.x1, r.y0 - y, y - r.y1, 0);
}

/**
 * Whether the cell lies in the room's swell: past its rectangle by `reach` cells at most, in rock no
 * room's rectangle holds, beside no way in from outside.
 */
export function inSwell(grid: Pick<CaveGrid, 'envelope'>, doors: readonly DungeonDoor[], room: DungeonRoom, x: number, y: number, reach = CHAMBER_SWELL): boolean {
  const away = swellDistance(room, x, y);
  return away > 0 && away <= reach && grid.envelope(x, y) === ROCK && !besideEntrance(doors, x, y);
}

/** How far past its walls a tunnel may wind, in cells. */
const TUNNEL_SWING = 1;

/** The entrance door's index, the first that leads in from outside and is no secret one. */
export function entranceDoor(floor: Pick<CaveFloorPlan, 'doors'>): number {
  return floor.doors.findIndex((door) => door.from === null && door.kind !== 'secret');
}

/** The doors a lane passes: between rooms one after the other on the route, and the entrance into its first. */
function laneDoorsOf(floor: Pick<CaveFloorPlan, 'doors'>, route: readonly number[]): number[] {
  const pairs = new Set(route.slice(1).map((id, k) => `${Math.min(id, route[k]!)}:${Math.max(id, route[k]!)}`));
  return floor.doors.flatMap((door, k) => {
    if (door.kind === 'secret') return [];
    if (door.from === null) return door.to === route[0] && k === entranceDoor(floor) ? [k] : [];
    return door.to !== null && pairs.has(`${Math.min(door.from, door.to)}:${Math.max(door.from, door.to)}`) ? [k] : [];
  });
}

/** The lane door the cell stands beside, in the wall it is set in, if one does: of two, one whose own cell is lane (`inLane`). */
function besideDoor(floor: Pick<CaveFloorPlan, 'doors'>, doors: readonly number[], x: number, y: number, inLane: (k: number) => boolean = () => true): number | undefined {
  const beside = doors.filter((k) => {
    const door = floor.doors[k]!;
    return Math.abs(x - door.x) + Math.abs(y - door.y) === 1 && (x - door.x) * door.dir.x + (y - door.y) * door.dir.y === 0;
  });
  return beside.find(inLane) ?? beside[0];
}

/** Whose a lane cell would be, or null where the lane may not go: off the route, on a stairwell other than `ends`', or `banned`. */
export type LaneOwner = (x: number, y: number) => number | null;

/**
 * Whose a lane cell would be. With `swell`, a chamber's lane may also wind out into the rock its
 * chamber may swell into, and keeps off the rows every stairwell but its own ends is reached from.
 */
export function laneOwners(grid: CaveGrid, floor: CaveFloorPlan, route: readonly number[], ends: readonly ReadonlySet<string>[], banned: ReadonlySet<string> = new Set(), lane?: ReadonlySet<string>, swell = false): LaneOwner {
  const onRoute = new Set(route);
  const laneDoors = laneDoorsOf(floor, route);
  const stairCells = new Set(floor.stairs.flatMap((s: StairSpot) => [...cellsOf(spotRect(s)), ...(swell ? [...approachCells(s, 'upper'), ...approachCells(s, 'lower')] : [])]).map((c) => cellKey(c.x, c.y)));
  const routeRooms = route.map((id) => floor.rooms[id]).filter((room): room is DungeonRoom => room !== undefined);
  const tunnels = routeRooms.filter((room) => room.kind !== 'room');
  const chambers = routeRooms.filter((room) => room.kind === 'room');
  const memo = new Map<string, number | null>();
  // Out in the swell, the lane keeps two cells off every room's rectangle, so two rooms' lanes meet only at their narrows.
  const nearOtherRoom = (x: number, y: number, room: number): boolean => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const envelope = grid.envelope(x + dx, y + dy);
        if (envelope !== ROCK && envelope !== room) return true;
      }
    }
    return false;
  };
  const ownerOf = (x: number, y: number, key: string): number | null => {
    if (stairCells.has(key) && !ends.some((end) => end.has(key))) return null;
    const envelope = grid.envelope(x, y);
    if (envelope !== ROCK) return onRoute.has(envelope) ? envelope : null;
    const owner = grid.owner(x, y);
    if (owner !== ROCK) return laneDoors.some((k) => owner === doorOwner(k)) ? owner : null;
    const beside = besideDoor(floor, laneDoors, x, y, (k) => lane?.has(cellKey(floor.doors[k]!.x, floor.doors[k]!.y)) ?? true);
    if (beside !== undefined) return grid.mayClaim(x, y, doorOwner(beside)) ? doorOwner(beside) : null;
    const tunnel = tunnels.find((room) => inTunnelReach(floor, room, x, y) && grid.mayClaim(x, y, room.id));
    if (tunnel || !swell) return tunnel?.id ?? null;
    return chambers.find((room) => inSwell(grid, floor.doors, room, x, y) && !nearOtherRoom(x, y, room.id) && grid.mayClaim(x, y, room.id))?.id ?? null;
  };
  return (x, y) => {
    const key = cellKey(x, y);
    // Read anew each time: a lane that is found again bans more cells.
    if (banned.has(key)) return null;
    let owner = memo.get(key);
    if (owner === undefined) {
      owner = ownerOf(x, y, key);
      memo.set(key, owner);
    }
    return owner;
  };
}

/** A lane cell whose owner may not touch a neighbour's (both lane cells, or one already shaped), which may be given up, or null. */
export function laneConflict(grid: CaveGrid, lane: readonly CellPoint[], owners: LaneOwner): string | null {
  const own = new Map(lane.map((c) => [cellKey(c.x, c.y), owners(c.x, c.y) ?? ROCK] as const));
  const ownerAt = (x: number, y: number): number => own.get(cellKey(x, y)) ?? grid.owner(x, y);
  const spare = (c: CellPoint): boolean => grid.envelope(c.x, c.y) === ROCK && grid.owner(c.x, c.y) === ROCK;
  for (const c of lane) {
    const owner = ownerAt(c.x, c.y);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (dx === 0 && dy === 0) continue;
        const n = { x: c.x + dx, y: c.y + dy };
        if (grid.mayTouchAt(owner, ownerAt(n.x, n.y), c.x, c.y, n.x, n.y, ownerAt)) continue;
        const nIsLane = own.has(cellKey(n.x, n.y));
        return cellKey(...(spare(c) || !nIsLane || !spare(n) ? ([c.x, c.y] as const) : ([n.x, n.y] as const)));
      }
    }
  }
  return null;
}

/**
 * A wall cell beside a lane door that the lane may not keep: it crosses the wall straight, through
 * the door cell and one cell beside it, each with the lane on both sides (inside only, at an
 * entrance), and never so that the narrows runs into another door's cell.
 */
export function crossingConflict(grid: CaveGrid, floor: CaveFloorPlan, route: readonly number[], lane: readonly CellPoint[]): string | null {
  const keys = new Set(lane.map((c) => cellKey(c.x, c.y)));
  const doors = laneDoorsOf(floor, route);
  const passed = doors.filter((k) => keys.has(cellKey(floor.doors[k]!.x, floor.doors[k]!.y)));
  for (const k of doors) {
    const door = floor.doors[k]!;
    const beside = [-1, 1].map((s) => ({ x: door.x + s * door.dir.y, y: door.y + s * door.dir.x })).filter((c) => keys.has(cellKey(c.x, c.y)));
    if (!passed.includes(k)) {
      // The lane takes the wall beside a door only through a door it passes.
      const stray = beside.find((c) => besideDoor(floor, passed, c.x, c.y) === undefined);
      if (stray) return cellKey(stray.x, stray.y);
      continue;
    }
    if (beside.length > 1) return cellKey(beside[1]!.x, beside[1]!.y);
    for (const c of beside) {
      const across = [{ x: c.x + door.dir.x, y: c.y + door.dir.y }, ...(door.from === null ? [] : [{ x: c.x - door.dir.x, y: c.y - door.dir.y }])];
      if (!across.every((a) => keys.has(cellKey(a.x, a.y)))) return cellKey(c.x, c.y);
      const along = { x: c.x * 2 - door.x, y: c.y * 2 - door.y };
      const next = grid.owner(along.x, along.y);
      if (next <= -2 && next !== doorOwner(k)) return cellKey(c.x, c.y);
    }
  }
  return null;
}

/** Gives every lane cell its owner for good, as `laneOwners` read them before anything was claimed. */
export function claimLane(grid: CaveGrid, floor: CaveFloorPlan, route: readonly number[], lane: readonly CellPoint[], swell = false): void {
  const keys = new Set(lane.map((c) => cellKey(c.x, c.y)));
  const owners = laneOwners(grid, floor, route, [keys], new Set(), keys, swell);
  const given = lane.map((c) => [c, owners(c.x, c.y)] as const);
  for (const [c, owner] of given) if (owner !== null) grid.require(owner, [c]);
}
