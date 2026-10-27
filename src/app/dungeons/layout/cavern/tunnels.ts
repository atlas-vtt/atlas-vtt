/**
 * A cave's tunnels: each corridor and junction becomes a passage that winds between its openings
 * (Boris the Brave's chiselled paths): every cell it may take, its rectangle and the walls round
 * it, is taken away in a seeded order, the cells near the straight way first, unless that would cut
 * the openings apart. The main path's tunnels keep their lane, two cells wide; a side passage is
 * one or two wide. Every door becomes a narrows; one the lane passes is two cells wide.
 */

import { doorApproaches } from '../../floors/stairSpots';
import { cellKey, cellsOf, dir, floorRect, inRect } from '../../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import type { Rng } from '../../rng';
import { type CaveGrid, NEAR4, ROCK, doorOwner, unkey } from './caveGrid';
import { inTunnelReach, tunnelReach } from './laneCells';

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

/** Grows a one-cell way to two where the cells allow: each cell joins a 2 × 2 block of the way. */
function widen(alive: Set<string>, may: ReadonlySet<string>): void {
  const block = (cells: ReadonlySet<string>, ax: number, ay: number): boolean => [0, 1].every((dx) => [0, 1].every((dy) => cells.has(cellKey(ax + dx, ay + dy))));
  for (const k of [...alive].sort()) {
    const c = unkey(k);
    const anchors = [[c.x - 1, c.y - 1], [c.x, c.y - 1], [c.x - 1, c.y], [c.x, c.y]] as const;
    if (anchors.some(([ax, ay]) => block(alive, ax, ay))) continue;
    const fits = anchors.find(([ax, ay]) => block(may, ax, ay));
    if (fits) for (const dx of [0, 1]) for (const dy of [0, 1]) alive.add(cellKey(fits[0] + dx, fits[1] + dy));
  }
}

/**
 * Carves the tunnel of `room` (a corridor or junction) between `ends`, within its rectangle and
 * the walls round it, keeping the lane cells it holds and widening to `width`.
 */
export function carveTunnel(rng: Rng, grid: CaveGrid, room: DungeonRoom, ends: readonly CellPoint[], width: 1 | 2, lane: ReadonlySet<string>, rooms: readonly DungeonRoom[] = [room]): void {
  const reach = tunnelReach(room);
  const may = new Set(
    cellsOf(reach)
      .filter((c) => grid.holds(c.x, c.y, room.id) || (inTunnelReach({ rooms, doors: grid.doors }, room, c.x, c.y) && [ROCK, room.id].includes(grid.envelope(c.x, c.y)) && grid.mayClaim(c.x, c.y, room.id)))
      .map(key),
  );
  const keep = [...new Set([...ends.map(key), ...grid.required(room.id), ...lane])].filter((k) => may.has(k));
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
  if (width === 2) widen(alive, may);
  for (const c of cellsOf(reach)) {
    const k = key(c);
    if (alive.has(k)) grid.claim(c.x, c.y, room.id);
    else if (grid.holds(c.x, c.y, room.id)) grid.release(c.x, c.y);
  }
}

/**
 * The doors as a cave has them: every door a narrows (an opening), two cells wide where the lane
 * passes it and the wall cell beside it (and the grid, where given, gave that cell to this door);
 * secret doors stay crawls and steps a scree slope.
 */
export function shapeDoors(doors: readonly DungeonDoor[], lane: ReadonlySet<string>, grid?: Pick<CaveGrid, 'owner'>): DungeonDoor[] {
  return doors.map((door, k) => {
    const kind = door.kind === 'door' ? 'opening' : door.kind;
    const along = [dir(door.dir.y, door.dir.x), dir(-door.dir.y, -door.dir.x)];
    const ours = (x: number, y: number): boolean => lane.has(cellKey(x, y)) && (!grid || grid.owner(x, y) === doorOwner(k));
    const wide = ours(door.x, door.y) ? along.find((d) => ours(door.x + d.x, door.y + d.y)) : undefined;
    return { ...door, kind, ...(wide && kind !== 'secret' && { wide }) };
  });
}
