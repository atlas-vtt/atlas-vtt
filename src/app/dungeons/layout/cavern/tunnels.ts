/**
 * A cave's tunnels: each corridor and junction becomes a passage that winds between its openings
 * (Boris the Brave's chiselled paths): every cell it may take, its rectangle and the walls round
 * it, is taken away in a seeded order, the cells near the straight way first, unless that would cut
 * the openings apart. The main path's tunnels keep their lane, two cells wide; a side passage is
 * one or two wide, and a broad walk between two great chambers three. Every door becomes a
 * narrows; one the lane passes is two cells wide, but where the only way on is a crawl.
 */

import { doorApproaches } from '../../floors/stairSpots';
import { cellKey, cellsOf, dir, floorRect, inRect } from '../../geometry';
import type { CellDir, CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import type { Rng } from '../../rng';
import { type CaveGrid, NEAR4, NEAR8, ROCK, doorOwner, unkey } from './caveGrid';
import { inTunnelReach, tunnelReach } from './laneCells';
import { caveDoorWay, mayWalkWide, onlyNarrowWaysOn } from './veins/doorWays';

/** How many cells across a tunnel runs: one or two, three only for a broad walk between two great chambers. */
export type TunnelWidth = 1 | 2 | 3;

/** How strongly the cells off the winding way go first, so what is left follows it. */
const WIGGLE = 1.5;
/** How far a way swings aside between its ends, in cells, and how long a stretch one bend takes. */
const MEANDER: readonly [number, number] = [1, 2];
const BEND_LENGTH = 7;


const key = (c: CellPoint): string => cellKey(c.x, c.y);

/** The cells inside a tunnel's doors: where its way must reach. */
export function tunnelEnds(grid: CaveGrid, room: DungeonRoom, doors: readonly DungeonDoor[]): CellPoint[] {
  const rect = floorRect(room);
  return doorApproaches(room, doors).filter((c) => inRect(rect, c.x, c.y) && (grid.owner(c.x, c.y) === ROCK || grid.holds(c.x, c.y, room.id)));
}

/** The cells on ways through `alive` from the first kept cell to every other, or null where one cannot be reached. */
function witness(alive: ReadonlySet<string>, keep: readonly string[]): Set<string> | null {
  const [first] = keep;
  if (first === undefined) return new Set();
  const back = new Map<string, string>([[first, first]]);
  const queue = [first];
  for (let head = 0; head < queue.length; head++) {
    const c = unkey(queue[head]!);
    for (const [dx, dy] of NEAR4) {
      const k = cellKey(c.x + dx, c.y + dy);
      if (!alive.has(k) || back.has(k)) continue;
      back.set(k, queue[head]!);
      queue.push(k);
    }
  }
  const out = new Set<string>();
  for (const k of keep) {
    if (!back.has(k)) return null;
    for (let at = k; !out.has(at); at = back.get(at)!) {
      out.add(at);
      if (at === first) break;
    }
  }
  return out;
}

/** How near the cell lies to a winding way from the first end to each other: 1 on it, 0 two cells off. */
function meanderNearness(rng: Rng, ends: readonly CellPoint[]): (c: CellPoint) => number {
  const [first, ...rest] = ends;
  if (!first || rest.length === 0) return () => 0;
  const ways = rest.map((end) => {
    const ex = end.x - first.x;
    const ey = end.y - first.y;
    const length = Math.hypot(ex, ey) || 1;
    return { end, ex, ey, length, swing: (rng() < 0.5 ? -1 : 1) * (MEANDER[0] + rng() * (MEANDER[1] - MEANDER[0])), bends: 1 + Math.floor(length / BEND_LENGTH), phase: rng() * Math.PI };
  });
  return (c) => {
    let best = Infinity;
    for (const way of ways) {
      const dx = c.x - first.x;
      const dy = c.y - first.y;
      const t = Math.max(0, Math.min(1, (dx * way.ex + dy * way.ey) / (way.length * way.length)));
      const side = (dx * way.ey - dy * way.ex) / way.length;
      // The way swings to either side between its ends, and is held to them at both.
      const offset = way.swing * Math.sin(Math.PI * t) * Math.sin(Math.PI * t * way.bends + way.phase);
      best = Math.min(best, Math.abs(side - offset));
    }
    return Math.max(0, 1 - best / 2);
  };
}

/** Grows a one-cell way to `size` across where the cells allow: each cell joins a `size` × `size` block of the way. */
function widen(alive: Set<string>, may: ReadonlySet<string>, size: 2 | 3): void {
  const span = Array.from({ length: size }, (_, k) => k);
  // The blocks a cell may join, the one it ends first: their order picks which block fits.
  const back = [...span].reverse();
  const block = (cells: ReadonlySet<string>, ax: number, ay: number): boolean => span.every((dx) => span.every((dy) => cells.has(cellKey(ax + dx, ay + dy))));
  for (const k of [...alive].sort()) {
    const c = unkey(k);
    const anchors = back.flatMap((dy) => back.map((dx) => [c.x - dx, c.y - dy] as const));
    if (anchors.some(([ax, ay]) => block(alive, ax, ay))) continue;
    const fits = anchors.find(([ax, ay]) => block(may, ax, ay));
    if (fits) for (const dx of span) for (const dy of span) alive.add(cellKey(fits[0] + dx, fits[1] + dy));
  }
}

/** Whether a cell lies beside (or at the corner of) another room's floor rectangle: a wall it shares with that room. */
function besideOtherFloor(grid: CaveGrid, room: DungeonRoom, c: CellPoint): boolean {
  return NEAR8.some(([dx, dy]) => ![ROCK, room.id].includes(grid.envelope(c.x + dx, c.y + dy)));
}

/**
 * Carves the tunnel of `room` (a corridor or junction) between `ends`, within its rectangle and
 * the walls round it, keeping the lane cells it holds and widening to `width`. With `spareWalls`
 * it leaves a wall it shares with another room's rectangle to that room: a cell taken there
 * stands beside the other's floor, which can then no longer be taken, and a long passage laid
 * along it would be cut in two. Where sparing them leaves no way between the passage's ends (its
 * own rectangle crowded by a neighbour's, the way round it only past another's wall), it spares none.
 */
export function carveTunnel(rng: Rng, grid: CaveGrid, room: DungeonRoom, ends: readonly CellPoint[], width: TunnelWidth, lane: ReadonlySet<string>, rooms: readonly DungeonRoom[] = [room], spareWalls = false): void {
  const reach = tunnelReach(room);
  const own = floorRect(room);
  const mayOf = (spare: boolean): Set<string> =>
    new Set(
      cellsOf(reach)
        .filter((c) => grid.holds(c.x, c.y, room.id) || (inTunnelReach({ rooms, doors: grid.doors }, room, c.x, c.y) && [ROCK, room.id].includes(grid.envelope(c.x, c.y)) && grid.mayClaim(c.x, c.y, room.id) && !(spare && !inRect(own, c.x, c.y) && besideOtherFloor(grid, room, c))))
        .map(key),
    );
  const wanted = [...new Set([...ends.map(key), ...grid.required(room.id), ...lane])];
  const keepOf = (cells: ReadonlySet<string>): string[] => wanted.filter((k) => cells.has(k));
  const spared = mayOf(spareWalls);
  const may = spareWalls && !witness(spared, keepOf(spared)) ? mayOf(false) : spared;
  const keep = keepOf(may);
  const kept = new Set(keep);
  const alive = new Set(may);
  let way = witness(alive, keep);
  if (way) {
    const near = meanderNearness(rng, ends);
    const order = [...may]
      .filter((k) => !kept.has(k))
      .map((k) => [k, rng() - WIGGLE * near(unkey(k))] as const)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    for (const [k] of order) {
      alive.delete(k);
      if (!way.has(k)) continue;
      const next = witness(alive, keep);
      if (next) way = next;
      else alive.add(k);
    }
  }
  if (width > 1) widen(alive, may, width === 3 ? 3 : 2);
  for (const c of cellsOf(reach)) {
    const k = key(c);
    if (alive.has(k)) grid.claim(c.x, c.y, room.id);
    else if (grid.holds(c.x, c.y, room.id)) grid.release(c.x, c.y);
  }
}

/** Whether the main path passes the door: its lane runs through the door's cell, which the grid (where given) gave this door. */
export function doorOnLane(door: DungeonDoor, k: number, lane: ReadonlySet<string>, grid?: Pick<CaveGrid, 'owner'>): boolean {
  return lane.has(cellKey(door.x, door.y)) && (!grid || grid.owner(door.x, door.y) === doorOwner(k));
}

/**
 * The cell beside a door that a walk two cells wide off the main path takes, claimed for it: rock
 * between the two rooms' floor, which the door may take without touching anything else.
 */
function widenWalk(grid: CaveGrid, door: DungeonDoor, k: number): CellDir | undefined {
  if (door.from === null || door.to === null) return undefined;
  const along = [dir(door.dir.y, door.dir.x), dir(-door.dir.y, -door.dir.x)];
  const side = along.find((d) => {
    const x = door.x + d.x;
    const y = door.y + d.y;
    return grid.owner(x, y) === ROCK && grid.owner(x - door.dir.x, y - door.dir.y) === door.from && grid.owner(x + door.dir.x, y + door.dir.y) === door.to && grid.mayClaim(x, y, doorOwner(k));
  });
  if (side) grid.claim(door.x + side.x, door.y + side.y, doorOwner(k));
  return side;
}

/** The wall cell beside a door that the lane takes with it, as the lane's two cells cross the wall there. */
function laneBeside(door: DungeonDoor, k: number, lane: ReadonlySet<string>, grid?: Pick<CaveGrid, 'owner'>): CellDir | undefined {
  const along = [dir(door.dir.y, door.dir.x), dir(-door.dir.y, -door.dir.x)];
  return along.find((d) => lane.has(cellKey(door.x + d.x, door.y + d.y)) && (!grid || grid.owner(door.x + d.x, door.y + d.y) === doorOwner(k)));
}

/**
 * The doors where the main path pinches to one cell (`onlyNarrowWaysOn`), by index, with the wall
 * cell beside each that the lane took held as rock on the grid, so the floor is shaped round a
 * narrows of one cell. Asked once the lane is claimed, before anything else is shaped.
 */
export function pinchLane(grid: CaveGrid, floor: { rooms: readonly DungeonRoom[]; doors: readonly DungeonDoor[] }, lane: ReadonlySet<string>): Set<number> {
  const pinched = new Set<number>();
  floor.doors.forEach((door, k) => {
    if (door.kind === 'secret' || door.kind === 'steps' || !doorOnLane(door, k, lane, grid) || !onlyNarrowWaysOn(door, floor.rooms)) return;
    const beside = laneBeside(door, k, lane, grid);
    const cell = beside && { x: door.x + beside.x, y: door.y + beside.y };
    if (cell && cornersRound(lane, cell)) return;
    pinched.add(k);
    if (cell) grid.holdAsRock(cell.x, cell.y);
  });
  return pinched;
}

/**
 * Whether two lane cells would meet only at a corner round `cell` were it rock: where the lane turns
 * through a narrows (a passage that leads on round a corner), its cells beside the wall cell meet
 * diagonally, and they are kept, so the path cannot pinch there.
 */
function cornersRound(lane: ReadonlySet<string>, cell: CellPoint): boolean {
  const on = (x: number, y: number): boolean => lane.has(cellKey(x, y));
  return [-1, 1].some((dx) => [-1, 1].some((dy) => on(cell.x + dx, cell.y) && on(cell.x, cell.y + dy) && !on(cell.x + dx, cell.y + dy)));
}

/**
 * The doors as a cave has them: every door a narrows (an opening), two cells wide where the lane
 * passes it and the wall cell beside it (and the grid, where given, gave that cell to this door);
 * secret doors stay crawls and steps a scree slope. With `rooms` (a cave with the book's rules)
 * every door is given its way: a walk on the main path, else what its exit rolled
 * (`caveDoorWay`); a walk of ten feet between two large chambers also stands two cells wide off
 * the main path, where the grid lets the door take the cell beside it. A door in `pinched`
 * (`pinchLane`) stays one cell on the main path, passed as narrow as it rolled, and the wall cell
 * beside it goes back to the rock.
 */
export function shapeDoors(doors: readonly DungeonDoor[], lane: ReadonlySet<string>, grid?: CaveGrid, rooms?: readonly DungeonRoom[], pinched: ReadonlySet<number> = new Set()): DungeonDoor[] {
  return doors.map((door, k) => {
    const kind = door.kind === 'door' ? 'opening' : door.kind;
    const onLane = doorOnLane(door, k, lane, grid);
    const wide = onLane ? laneBeside(door, k, lane, grid) : undefined;
    const pinch = pinched.has(k);
    if (pinch && wide && grid) grid.release(door.x + wide.x, door.y + wide.y);
    const shaped = { ...door, kind, ...(wide && !pinch && kind !== 'secret' && { wide }) };
    if (!rooms) return shaped;
    const way = caveDoorWay(shaped, onLane, pinch);
    const besides = !onLane && grid && kind === 'opening' && mayWalkWide(way, rooms) ? widenWalk(grid, way, k) : undefined;
    return besides ? { ...way, wide: besides } : way;
  });
}
