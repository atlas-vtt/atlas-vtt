/**
 * A crawl, a squeeze or a letterbox is a neck of real rock, never a mark on open floor: a way drawn
 * narrow where the floor stays wide reads as stones someone set down there. At its door and for
 * one cell either side along the way the floor is one cell across, the rest of those rows given to
 * the rock before anything is shaped (`CaveGrid.turnToRock`), so the cave's own walls close in
 * round it with their ordinary outline and hatching. A passage that runs on along the way is cut
 * across its whole width there and narrows to two cells one row further; a chamber, or a passage
 * the way turns out of through its side, gives up only the two cells beside the one before the
 * door, and a chamber only where it keeps room for its 3 × 3 core and every way through it, so its
 * floor stays whole. The main path's pinches (`pinchLane`) are necks
 * too: the lane's second cell goes to the rock in all three rows, which it passes there alone
 * (`pinchCells`).
 */

import { cellKey, floorRect, inRect } from '../../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import { type CaveGrid, NEAR4, ROCK, doorOwner, unkey } from './caveGrid';
import { stairsJoinRound } from './chambers';
import { tunnelReach } from './laneCells';
import { doorOnLane } from './tunnels';
import { NARROW_WAYS, caveDoorWay } from './veins/doorWays';

/** How far along the wall either side of a neck's door the rock is held, in cells: past the cells beside the door no two rooms may meet. */
const WALL_RUN = 3;
/** How far across a passage a neck's rows reach, in cells: a passage three cells wide with the door at its edge, and a cell it may wind into. */
const ACROSS_RUN = 4;

type Floor = { rooms: readonly DungeonRoom[]; doors: readonly DungeonDoor[] };

/** A neck's cells by how far they lie along the way from its door (`t`) and across it (`j`, signed). */
type NeckCell = (t: number, j: number) => CellPoint;

/** Whether the door becomes a neck: an open way between two rooms that `shapeDoors` gives a crawl, a squeeze or a letterbox. */
function isNeck(grid: CaveGrid, door: DungeonDoor, k: number, lane: ReadonlySet<string>, pinched: ReadonlySet<number>): boolean {
  if (door.kind === 'secret' || door.kind === 'steps' || door.from === null || door.to === null) return false;
  return NARROW_WAYS.has(caveDoorWay(door, doorOnLane(door, k, lane, grid), pinched.has(k)).way ?? 'walk');
}

/**
 * Turns the cells `cell(1)`, `cell(2)` … up to `upTo` to rock while `may` allows each, stopping at
 * the first it does not; a cell already held is passed over.
 */
function holdRun(grid: CaveGrid, cell: (j: number) => CellPoint, upTo: number, may: (c: CellPoint, j: number) => boolean): void {
  for (let j = 1; j <= upTo; j++) {
    const c = cell(j);
    if (grid.heldAsRock(c.x, c.y)) continue;
    if (!may(c, j)) return;
    grid.turnToRock(c.x, c.y);
  }
}

/** Whether the way runs on along the passage past its door: a passage grown along the way, the door in its end wall. */
function runsOn(room: DungeonRoom, door: DungeonDoor, approach: CellPoint): boolean {
  return room.kind !== 'room' && (room.axis.x !== 0) === (door.dir.x !== 0) && inRect(floorRect(room), approach.x, approach.y);
}

/** A pinch of the main path whose neck is being held: the lane's cells, and the owner number of the pinch's door. */
interface Pinch {
  lane: ReadonlySet<string>;
  door: number;
}

/**
 * Whether the room may give the cell to its neck: rock, or (through a `pinch`) the room's own lane
 * cell where no other door's open cell lies beside it, as one does beside the cell before the
 * lane's next crossing; never another room's rectangle, a core, a stairwell or the cell before a
 * door.
 */
function mayGive(grid: CaveGrid, room: DungeonRoom, c: CellPoint, pinch?: Pinch): boolean {
  if (![ROCK, room.id].includes(grid.envelope(c.x, c.y))) return false;
  const owner = grid.owner(c.x, c.y);
  if (owner === ROCK) return true;
  if (!pinch || owner !== room.id || !pinch.lane.has(cellKey(c.x, c.y))) return false;
  // A door's cell held as rock (beside another pinch) is rock already.
  return !NEAR4.some(([dx, dy]) => {
    const other = grid.owner(c.x + dx, c.y + dy);
    return other <= -2 && other !== pinch.door && !grid.heldAsRock(c.x + dx, c.y + dy);
  });
}

/**
 * Whether the chamber keeps, without `without`, a 3 × 3 block of its rectangle it may take (where
 * its core will stand), everything it must keep joined round its stairwells (`stairsJoinRound`),
 * and two cells of floor it holds already (or narrows) beside each cell it must keep but the
 * neck's own `approach`, which the way joins on: a neck never costs a chamber its core, a way
 * through it or a cell before another door, or the lane, left as a spur.
 */
function chamberKeeps(grid: CaveGrid, room: DungeonRoom, without: ReadonlySet<string>, approach: CellPoint): boolean {
  if (without.size === 0) return true;
  const r = floorRect(room);
  const may = (x: number, y: number): boolean => !without.has(cellKey(x, y)) && (grid.holds(x, y, room.id) || (inRect(r, x, y) && grid.mayClaim(x, y, room.id)));
  let block = false;
  for (let y = r.y0; !block && y + 2 <= r.y1; y++) {
    for (let x = r.x0; !block && x + 2 <= r.x1; x++) block = [0, 1, 2].every((dy) => [0, 1, 2].every((dx) => may(x + dx, y + dy)));
  }
  const open = (x: number, y: number): boolean => (!without.has(cellKey(x, y)) && grid.holds(x, y, room.id)) || (grid.owner(x, y) <= -2 && grid.doors[-2 - grid.owner(x, y)]?.kind !== 'secret');
  const kept = grid.required(room.id);
  const spur = [...without].some((k) => {
    const c = unkey(k);
    return NEAR4.some(([dx, dy]) => {
      const n = { x: c.x + dx, y: c.y + dy };
      return (n.x !== approach.x || n.y !== approach.y) && kept.has(cellKey(n.x, n.y)) && NEAR4.filter(([ex, ey]) => open(n.x + ex, n.y + ey)).length < 2;
    });
  });
  return block && !spur && stairsJoinRound(grid, room, { cells: [...without], row: [] });
}

/** One side of a neck (`side` −1 the door's `from` room, 1 its `to` room): its row before the door, and where the passage runs on, the row after it narrowed to two. */
function holdSide(grid: CaveGrid, room: DungeonRoom, door: DungeonDoor, cell: NeckCell, side: number, pinch: Pinch | undefined): void {
  const approach = cell(side, 0);
  if (!runsOn(room, door, approach)) {
    // A chamber, or a passage turning out through its side: only the two cells beside the one before the door, a passage's outside its rectangle.
    const own = (c: CellPoint): boolean => room.kind === 'room' || !inRect(floorRect(room), c.x, c.y);
    const beside = [-1, 1].map((s) => cell(side, s)).filter((c) => !grid.heldAsRock(c.x, c.y) && own(c) && mayGive(grid, room, c, pinch));
    // Both where the chamber keeps its core and its ways, else the one it can spare.
    const spared = [beside, ...beside.map((c) => [c])].find((cells) => room.kind !== 'room' || chamberKeeps(grid, room, new Set(cells.map((c) => cellKey(c.x, c.y))), approach));
    for (const c of spared ?? []) grid.turnToRock(c.x, c.y);
    return;
  }
  const reach = tunnelReach(room);
  const inReach = (c: CellPoint): boolean => inRect(reach, c.x, c.y);
  for (const s of [-1, 1]) holdRun(grid, (j) => cell(side, s * j), ACROSS_RUN, (c, j) => inReach(c) && mayGive(grid, room, c, j === 1 ? pinch : undefined));
  const next = cell(2 * side, 0);
  if (!inRect(floorRect(room), next.x, next.y)) return;
  for (const s of [-1, 1]) holdRun(grid, (j) => cell(2 * side, s * (j + 1)), ACROSS_RUN - 1, (c) => inReach(c) && mayGive(grid, room, c));
  // Two cells wide there: the cell beside it away from the passage's middle goes, else the other.
  const r = floorRect(room);
  const middle = door.dir.x !== 0 ? (r.y0 + r.y1) / 2 - next.y : (r.x0 + r.x1) / 2 - next.x;
  const towards = middle > 0 ? 1 : -1;
  const taper = [-towards, towards].map((s) => cell(2 * side, s)).find((c) => !grid.heldAsRock(c.x, c.y) && inReach(c) && mayGive(grid, room, c));
  if (taper) grid.turnToRock(taper.x, taper.y);
}

/**
 * Gives the rock round every crawl, squeeze and letterbox its cells (`pinched`, the main path's
 * pinches from `pinchLane`), once the lane is claimed and before the chambers' cores are kept, so a
 * core keeps off a neck.
 */
export function holdNecks(grid: CaveGrid, floor: Floor, lane: ReadonlySet<string>, pinched: ReadonlySet<number>): void {
  floor.doors.forEach((door, k) => {
    if (!isNeck(grid, door, k, lane, pinched)) return;
    // `j` runs across the way as `pinchLane`'s cell beside the door does.
    const cell: NeckCell = (t, j) => ({ x: door.x + t * door.dir.x + j * door.dir.y, y: door.y + t * door.dir.y + j * door.dir.x });
    for (const s of [-1, 1]) holdRun(grid, (j) => cell(0, s * j), WALL_RUN, (c) => grid.envelope(c.x, c.y) === ROCK && grid.owner(c.x, c.y) === ROCK);
    const pinch = pinched.has(k) ? { lane, door: doorOwner(k) } : undefined;
    for (const side of [-1, 1]) {
      const room = floor.rooms[(side < 0 ? door.from : door.to)!];
      if (room) holdSide(grid, room, door, cell, side, pinch);
    }
  });
}
