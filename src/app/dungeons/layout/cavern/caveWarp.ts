/**
 * A cave floor bent as rock is: once every room has its cells, each room is read as a field (how
 * far each cell lies inside it, or out in the rock and the other rooms) and that field is read
 * again at places pushed aside by slow noise, the same push for the whole floor, with a finer
 * noise added for bays and pinches. Where the bent field says rock, the room gives its cell up
 * unless it needs it or would fall apart; where it says floor, the room takes the rock as a
 * chamber's swell or a tunnel's widening does. So a straight wall becomes a sweeping one, a
 * passage sways and swells, the rock between two rooms thickens and thins, and two walls never
 * run parallel for long; the guards repair whatever that leaves. Small pockets of rock left inside
 * a room are filled after (`fillPockets`).
 */

import { cellKey } from '../../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import type { Rng } from '../../rng';
import { fractalNoise } from '../../water/noise';
import { type CaveGrid, NEAR4, NEAR8, ROCK, doorOwner } from './caveGrid';
import { floorOf, mayWiden, releaseSpurs } from './bulges';
import { type Lobes, chamberLobes } from './chamberLobes';
import { wholeWithout } from './guards';

/** The slow warp: its period, and how far it moves where the field is read, in cells (the noise spans about ±0.7). */
const WARP = { period: 5, amount: 4.5 };
/** Bays and pinches: their period and how far they move the wall, in cells. */
const BAYS = { period: 2.6, amount: 2 };
/** How strongly a room keeps off another, per direction another lies within two cells. */
const APART = 0.35;
/** The most cells a piece of rock inside the floor may have and still be filled in. */
const POCKET = 4;
/** Rounds of taking rock, each reaching one cell further; and how far round a room its field is read. */
const ROUNDS = 3;
const REACH = ROUNDS + 3;

type Field = (x: number, y: number) => number;
type Push = (x: number, y: number) => readonly [number, number];

interface Floorish {
  rooms: readonly DungeonRoom[];
  doors: readonly DungeonDoor[];
}

/** Each cell's distance to the nearest cell of the other kind, by two chamfer passes (steps of 1 and √2). */
function chamfer(inside: Uint8Array, w: number, h: number, kind: number): Float64Array {
  const d = new Float64Array(w * h).map((_, i) => (inside[i] === kind ? Infinity : 0));
  const step = (i: number, gx: number, gy: number, dx: number, dy: number): void => {
    const nx = gx + dx;
    const ny = gy + dy;
    if (nx >= 0 && ny >= 0 && nx < w && ny < h) d[i] = Math.min(d[i]!, d[ny * w + nx]! + (dx && dy ? Math.SQRT2 : 1));
  };
  for (let gy = 0; gy < h; gy++) {
    for (let gx = 0; gx < w; gx++) {
      const i = gy * w + gx;
      step(i, gx, gy, -1, 0);
      step(i, gx, gy, -1, -1);
      step(i, gx, gy, 0, -1);
      step(i, gx, gy, 1, -1);
    }
  }
  for (let gy = h - 1; gy >= 0; gy--) {
    for (let gx = w - 1; gx >= 0; gx--) {
      const i = gy * w + gx;
      step(i, gx, gy, 1, 0);
      step(i, gx, gy, 1, 1);
      step(i, gx, gy, 0, 1);
      step(i, gx, gy, -1, 1);
    }
  }
  return d;
}

/** Half a cell less than the distance to the other kind, positive inside and negative outside: 0 on the wall between. */
function signedDistance(inside: Uint8Array, w: number, h: number): Float64Array {
  const toOut = chamfer(inside, w, h, 1);
  const toIn = chamfer(inside, w, h, 0);
  // A box without one kind reads as far from it, but never as infinitely.
  const far = w + h;
  return toOut.map((d, i) => (inside[i] ? Math.min(d, far) - 0.5 : 0.5 - Math.min(toIn[i]!, far)));
}

/**
 * How far each cell's middle lies inside the room (positive) or outside it (negative), half a cell
 * at its wall, over the room's cells and `REACH` round them; read between cells bilinearly.
 */
function depthField(cells: readonly CellPoint[], mine: (x: number, y: number) => boolean): Field {
  const x0 = Math.min(...cells.map((c) => c.x)) - REACH;
  const y0 = Math.min(...cells.map((c) => c.y)) - REACH;
  const w = Math.max(...cells.map((c) => c.x)) + REACH - x0 + 1;
  const h = Math.max(...cells.map((c) => c.y)) + REACH - y0 + 1;
  const inside = new Uint8Array(w * h);
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) if (mine(x0 + gx, y0 + gy)) inside[gy * w + gx] = 1;
  const depth = signedDistance(inside, w, h);
  const read = (gx: number, gy: number): number => {
    const cx = Math.max(0, Math.min(w - 1, gx));
    const cy = Math.max(0, Math.min(h - 1, gy));
    return depth[cy * w + cx]! - Math.abs(gx - cx) - Math.abs(gy - cy);
  };
  return (x, y) => {
    const fx = x - 0.5 - x0;
    const fy = y - 0.5 - y0;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const u = fx - ix;
    const v = fy - iy;
    const top = read(ix, iy) * (1 - u) + read(ix + 1, iy) * u;
    const bottom = read(ix, iy + 1) * (1 - u) + read(ix + 1, iy + 1) * u;
    return top * (1 - v) + bottom * v;
  };
}

/** The floor's slow push and its bays, shared by every room so a passage sways as one. */
function floorNoise(rng: Rng): { push: Push; bays: Field } {
  const wx = fractalNoise(rng, 1, 0.5, WARP.period);
  const wy = fractalNoise(rng, 1, 0.5, WARP.period);
  const bays = fractalNoise(rng, 2, 0.5, BAYS.period);
  return { push: (x, y) => [x + WARP.amount * wx(x, y), y + WARP.amount * wy(x, y)], bays: (x, y) => BAYS.amount * bays(x, y) };
}

/** Whether the cell lies in a 2 × 2 block of floor. */
function inBlock(isFloor: (x: number, y: number) => boolean, c: CellPoint): boolean {
  return [[-1, -1], [0, -1], [-1, 0], [0, 0]].some(([ax, ay]) => [0, 1].every((dx) => [0, 1].every((dy) => isFloor(c.x + ax! + dx, c.y + ay! + dy))));
}

/** Bends one room: what its bent field puts in the rock it gives up, what it puts in its floor it takes. */
function warpRoom(grid: CaveGrid, floor: Floorish, room: DungeonRoom, noise: { push: Push; bays: Field }, isFloor: (x: number, y: number) => boolean, lobes?: Lobes): void {
  const cells = grid.cellsOf(room.id);
  if (cells.length === 0) return;
  const own = new Set(floor.doors.flatMap((door, k) => (door.kind !== 'secret' && (door.from === room.id || door.to === room.id) ? [doorOwner(k)] : [])));
  const depth = depthField(cells, (x, y) => grid.holds(x, y, room.id) || own.has(grid.owner(x, y)));
  const others = (x: number, y: number): boolean => {
    const owner = grid.owner(x, y);
    return owner !== ROCK && owner !== room.id && !own.has(owner);
  };
  // Rock between two rooms is thicker than a wall: a cell beside another room's leans to the rock.
  const crowded = (c: CellPoint): number => NEAR8.filter(([dx, dy]) => [1, 2].some((k) => others(c.x + dx * k, c.y + dy * k))).length;
  const wants = (c: CellPoint): boolean => {
    const [px, py] = noise.push(c.x + 0.5, c.y + 0.5);
    return depth(px, py) + noise.bays(c.x + 0.5, c.y + 0.5) - APART * crowded(c) > 0;
  };
  const required = grid.required(room.id);
  // What the bent field and the lobes make of a cell never changes while the room is bent: read once a cell.
  const given = new Map<string, boolean>();
  const gives = (c: CellPoint): boolean => {
    const k = cellKey(c.x, c.y);
    let out = given.get(k);
    if (out === undefined) {
      out = (!wants(c) || lobes?.bitten(c.x, c.y) === true) && lobes?.grows(c.x, c.y) !== true;
      given.set(k, out);
    }
    return out;
  };
  // A cell is given up only where no floor beside it is left with fewer than two floor cells beside
  // it, nor, in a chamber, without a 2 × 2 block of floor: a chamber gets no new one-cell neck.
  const floorWithout = (c: CellPoint) => (x: number, y: number): boolean => (x !== c.x || y !== c.y) && isFloor(x, y);
  const leavesThin = (c: CellPoint): boolean => {
    const rest = floorWithout(c);
    return NEAR4.some(([dx, dy]) => {
      const n = { x: c.x + dx, y: c.y + dy };
      if (!isFloor(n.x, n.y)) return false;
      if (NEAR4.filter(([ex, ey]) => rest(n.x + ex, n.y + ey)).length < 2) return true;
      return room.kind === 'room' && grid.holds(n.x, n.y, room.id) && !inBlock(rest, n);
    });
  };
  for (const c of cells) if (!required.has(cellKey(c.x, c.y)) && gives(c) && !leavesThin(c) && wholeWithout(grid, room, c)) grid.release(c.x, c.y);
  const taken: CellPoint[] = [];
  for (let round = 0; round < ROUNDS; round++) {
    const options = new Map<string, CellPoint>();
    for (const c of grid.cellsOf(room.id)) {
      for (const [dx, dy] of NEAR4) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (grid.owner(n.x, n.y) === ROCK) options.set(cellKey(n.x, n.y), n);
      }
    }
    for (const c of [...options.values()].sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (gives(c) || !mayWiden(grid, floor, room, c, isFloor)) continue;
      grid.claim(c.x, c.y, room.id);
      taken.push(c);
    }
  }
  releaseSpurs(grid, room.id, taken, isFloor);
}

/** The rock pieces cut off from the rock round the floor, of `POCKET` cells or fewer: too small to draw as a pillar. */
function smallPockets(grid: CaveGrid): CellPoint[][] {
  const { x0, y0, w, h } = grid.box();
  const rock = new Uint8Array(w * h);
  for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) if (grid.owner(x0 + gx, y0 + gy) === ROCK) rock[gy * w + gx] = 1;
  const seen = new Uint8Array(w * h);
  const out: CellPoint[][] = [];
  for (let start = 0; start < w * h; start++) {
    if (!rock[start] || seen[start]) continue;
    const piece = [start];
    seen[start] = 1;
    let open = false;
    for (let head = 0; head < piece.length; head++) {
      const i = piece[head]!;
      const gx = i % w;
      const gy = Math.floor(i / w);
      for (const [dx, dy] of NEAR4) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) open = true;
        else if (rock[ny * w + nx] && !seen[ny * w + nx]) {
          seen[ny * w + nx] = 1;
          piece.push(ny * w + nx);
        }
      }
    }
    if (!open && piece.length <= POCKET) out.push(piece.map((i) => ({ x: x0 + (i % w), y: y0 + Math.floor(i / w) })));
  }
  return out;
}

/**
 * Gives every small pocket of rock left inside the floor to the room round it, where one room alone
 * surrounds it and may take it whole: the outline could draw it only as a square.
 */
export function fillPockets(grid: CaveGrid): void {
  for (const pocket of smallPockets(grid)) {
    const owners = new Set(pocket.flatMap((c) => NEAR8.map(([dx, dy]) => grid.owner(c.x + dx, c.y + dy))).filter((o) => o !== ROCK));
    const [owner] = owners;
    if (owners.size !== 1 || owner === undefined || owner < 0 || !pocket.every((c) => grid.mayClaim(c.x, c.y, owner))) continue;
    for (const c of pocket) grid.claim(c.x, c.y, owner);
  }
}

/** Bends every room of the shaped floor, in turn. */
export function warpCave(rng: Rng, grid: CaveGrid, floor: Floorish, faults: readonly number[]): void {
  const isFloor = floorOf(grid, floor.doors);
  const noise = floorNoise(rng);
  for (const room of floor.rooms) warpRoom(grid, floor, room, noise, isFloor, room.kind === 'room' ? chamberLobes(rng, room, faults) : undefined);
}
