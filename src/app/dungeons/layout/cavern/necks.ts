/**
 * A crawl, a squeeze or a letterbox is a neck of real rock, never a mark on open floor: a way drawn
 * narrow where the floor stays wide reads as stones someone set down there. At its door and for
 * one cell either side along the way the floor is one cell across, the cells beside the way given
 * to the rock before anything is shaped (`CaveGrid.turnToRock`), so the cave's own walls close in
 * round it with their ordinary outline and hatching. A passage that runs on along the way is cut
 * across its whole width there and narrows to two cells one row further; a chamber, or a passage
 * the way turns out of through its side, gives up only the two cells beside the one before the
 * door, and a chamber only where it keeps room for its 3 × 3 core and every way through it. A
 * chamber that cannot give up both, or a door whose own row cannot close round it, gives up the
 * way instead (`settleNecks`): it is walked (`walkLooseNecks`). The main path's pinches
 * (`pinchLane`) are necks too: the lane's second cell goes to the rock in all three rows, which it
 * passes there alone (`pinchCells`).
 */

import { floorRect, inRect } from '../../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import { type Rng, int } from '../../rng';
import { type CaveGrid, doorOwner } from './caveGrid';
import { tunnelReach } from './laneCells';
import { type Neck, type NeckCell, type Pinch, mayGive, settleNecks } from './neckCells';
import { doorOnLane } from './tunnels';
import { NARROW_WAYS, caveDoorWay } from './veins/doorWays';

/** How far past its own cells a passage may wind (`tunnelReach`), in cells: as far as a neck's rows reach past them. */
const WIND = 2;

type Floor = { rooms: readonly DungeonRoom[]; doors: readonly DungeonDoor[] };

/**
 * The rooms a neck's rock past the cells beside its way is held against: its own two, kept from
 * winding back. Any other room may bite into it as it swells, as into any rock, so the neck's rows
 * never stand as a straight wall along a passage beside it; the cells beside the way, in the door's
 * row and the rows either side, stay rock against all.
 */
const ownRooms = (door: DungeonDoor): number[] => [door.from, door.to].filter((id): id is number => id !== null);

/** Whether the door becomes a neck: an open way between two rooms that `shapeDoors` gives a crawl, a squeeze or a letterbox. */
function isNeck(grid: CaveGrid, door: DungeonDoor, k: number, lane: ReadonlySet<string>, pinched: ReadonlySet<number>): boolean {
  if (door.kind === 'secret' || door.kind === 'steps' || door.from === null || door.to === null) return false;
  return NARROW_WAYS.has(caveDoorWay(door, doorOnLane(door, k, lane, grid), pinched.has(k)).way ?? 'walk');
}

/**
 * Turns the cells `cell(1)`, `cell(2)` … up to `upTo` to rock while `may` allows each, stopping at
 * the first it does not, held against the rooms `against` names for that cell (all where it names
 * none); a cell already held firmly is passed over.
 */
function holdRun(grid: CaveGrid, cell: (j: number) => CellPoint, upTo: number, may: (c: CellPoint, j: number) => boolean, against: (j: number) => readonly number[] | undefined): void {
  for (let j = 1; j <= upTo; j++) {
    const c = cell(j);
    if (grid.heldFirmly(c.x, c.y)) continue;
    if (!grid.heldAsRock(c.x, c.y) && !may(c, j)) return;
    grid.turnToRock(c.x, c.y, against(j));
  }
}

/** Whether the way runs on along the passage past its door: a passage grown along the way, the door in its end wall. */
function runsOn(room: DungeonRoom, door: DungeonDoor, approach: CellPoint): boolean {
  return room.kind !== 'room' && (room.axis.x !== 0) === (door.dir.x !== 0) && inRect(floorRect(room), approach.x, approach.y);
}

/**
 * One passage side of a neck (`side` −1 the door's `from` room, 1 its `to` room). A passage the way
 * turns out of through its side gives up the two cells beside the one before the door that lie
 * outside its rectangle; one that runs on is cut across in the row before the door and narrows to
 * two cells the row after, each row held as far as the passage may wind past its own cells. In the
 * row before the door the cut alone makes the neck, so its last cell is held only as the seed
 * falls: held always, it turned every passage's winding the same way off its neck, against the
 * next passage, whose wall then ran straight.
 */
function holdPassage(rng: Rng, grid: CaveGrid, room: DungeonRoom, door: DungeonDoor, cell: NeckCell, side: number, pinch: Pinch | undefined): void {
  const approach = cell(side, 0);
  if (!runsOn(room, door, approach)) {
    const beside = [-1, 1].map((s) => cell(side, s)).filter((c) => !grid.heldFirmly(c.x, c.y) && !inRect(floorRect(room), c.x, c.y) && mayGive(grid, room, c, pinch));
    for (const c of beside) grid.turnToRock(c.x, c.y);
    return;
  }
  const reach = tunnelReach(room);
  const inReach = (c: CellPoint): boolean => inRect(reach, c.x, c.y);
  const own = ownRooms(door);
  const r = floorRect(room);
  // How many of the passage's own cells lie across the way on side `s` of its line.
  const inside = (s: number): number => {
    let n = 0;
    while (inRect(r, cell(side, s * (n + 1)).x, cell(side, s * (n + 1)).y)) n++;
    return n;
  };
  for (const s of [-1, 1]) holdRun(grid, (j) => cell(side, s * j), inside(s) + WIND - int(rng, 0, 1), (c, j) => inReach(c) && mayGive(grid, room, c, j === 1 ? pinch : undefined), (j) => (j === 1 ? undefined : own));
  const next = cell(2 * side, 0);
  if (!inRect(r, next.x, next.y)) return;
  for (const s of [-1, 1]) holdRun(grid, (j) => cell(2 * side, s * (j + 1)), inside(s) + WIND - 1, (c) => inReach(c) && mayGive(grid, room, c), () => own);
  // Two cells wide there: the cell beside it away from the passage's middle goes, else the other.
  const middle = door.dir.x !== 0 ? (r.y0 + r.y1) / 2 - next.y : (r.x0 + r.x1) / 2 - next.x;
  const towards = middle > 0 ? 1 : -1;
  const taper = [-towards, towards].map((s) => cell(2 * side, s)).find((c) => !grid.heldAsRock(c.x, c.y) && inReach(c) && mayGive(grid, room, c));
  if (taper) grid.turnToRock(taper.x, taper.y, own);
}

/**
 * Gives the rock round every crawl, squeeze and letterbox its cells (`pinched`, the main path's
 * pinches from `pinchLane`), once the lane is claimed and before the chambers' cores are kept, so a
 * core keeps off a neck. Returns the doors whose neck could not be held (`settleNecks`), by index,
 * which hold no rock and are walked.
 */
export function holdNecks(rng: Rng, grid: CaveGrid, floor: Floor, lane: ReadonlySet<string>, pinched: ReadonlySet<number>): Set<number> {
  const necks: Neck[] = floor.doors.flatMap((door, k) => {
    if (!isNeck(grid, door, k, lane, pinched)) return [];
    // `j` runs across the way as `pinchLane`'s cell beside the door does.
    const cell: NeckCell = (t, j) => ({ x: door.x + t * door.dir.x + j * door.dir.y, y: door.y + t * door.dir.y + j * door.dir.x });
    const sides = [-1, 1].map((side) => ({ side, room: floor.rooms[(side < 0 ? door.from : door.to)!] }));
    return [{ door, k, cell, pinch: pinched.has(k) ? { lane, door: doorOwner(k) } : undefined, sides }];
  });
  const { loose, plans } = settleNecks(grid, necks);
  for (const { door, k, cell, pinch, sides } of necks) {
    if (loose.has(k)) continue;
    // In the door's own row only the cells beside it: past them the grid keeps the two rooms apart itself (`mayTouchAt`),
    // and rock held further along the wall stood straight beside the passage the wall belongs to.
    for (const c of [cell(0, -1), cell(0, 1)]) if (!grid.heldFirmly(c.x, c.y)) grid.turnToRock(c.x, c.y);
    const plan = plans.get(k);
    for (const c of plan?.gives ?? []) grid.turnToRock(c.x, c.y);
    for (const { room, cells } of plan?.keeps ?? []) grid.require(room, cells);
    for (const { side, room } of sides) if (room && room.kind !== 'room') holdPassage(rng, grid, room, door, cell, side, pinch);
  }
  return loose;
}
