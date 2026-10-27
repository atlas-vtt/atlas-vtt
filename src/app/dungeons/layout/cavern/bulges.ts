/**
 * Caves past their rooms' straight sides: once every chamber and tunnel has its cells, a chamber's
 * lobes may swell up to two cells past its rectangle into free rock, and a tunnel widens here and
 * there, so no wall runs straight along a rectangle's edge. Only rock that touches nothing it may
 * not touch is taken (`CaveGrid.mayClaim`), never a cell of another room's rectangle or beside an
 * entrance, never so two floor cells meet only at a corner; and a cell left with fewer than two floor cells beside it is
 * given back, so no thin spur is left.
 */

import { cellKey } from '../../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../model';
import type { Rng } from '../../rng';
import { fractalNoise } from '../../water/noise';
import { type CaveGrid, NEAR4, ROCK, doorOwner } from './caveGrid';
import type { ChamberField } from './chamberField';
import { CHAMBER_SWELL, inSwell, inTunnelReach, swellDistance } from './laneCells';

/** The least field a cell past the rectangle needs to be taken. */
const SWELL_FIELD = -0.1;
/** Where a tunnel widens: the noise above this, changing over this many cells. */
const WIDEN_ABOVE = 0.08;
const WIDEN_PERIOD = 2.5;

type Score = (x: number, y: number) => number;

/** Whether the cell is floor as drawn: owned, and not a crawl. */
export function floorOf(grid: CaveGrid, doors: readonly DungeonDoor[]): (x: number, y: number) => boolean {
  const crawls = new Set(doors.flatMap((door, k) => (door.kind === 'secret' ? [doorOwner(k)] : [])));
  return (x, y) => {
    const owner = grid.owner(x, y);
    return owner !== ROCK && !crawls.has(owner);
  };
}

/** Whether making the cell floor would leave it touching a floor cell only at a corner. */
function pinches(isFloor: (x: number, y: number) => boolean, c: CellPoint): boolean {
  return [-1, 1].some((dx) => [-1, 1].some((dy) => isFloor(c.x + dx, c.y + dy) && !isFloor(c.x + dx, c.y) && !isFloor(c.x, c.y + dy)));
}

/** Whether the cell would complete a 3 × 3 block of the owner's cells: a tunnel stays one or two wide. */
function completesBlock(grid: CaveGrid, owner: number, c: CellPoint): boolean {
  const own = (x: number, y: number): boolean => (x === c.x && y === c.y) || grid.holds(x, y, owner);
  for (let ay = c.y - 2; ay <= c.y; ay++) for (let ax = c.x - 2; ax <= c.x; ax++) if ([0, 1, 2].every((dx) => [0, 1, 2].every((dy) => own(ax + dx, ay + dy)))) return true;
  return false;
}

interface Swell {
  owner: number;
  /** Whether the owner may take the rock cell, besides the grid's own rules. */
  may: (c: CellPoint) => boolean;
  score: Score;
  /** How many rings of cells round the owner it may take. */
  rounds: number;
}

/** Takes the cells `swell` allows, best first, ring by ring; then gives back every taken cell left thin. */
function swellInto(grid: CaveGrid, doors: readonly DungeonDoor[], swell: Swell): void {
  const isFloor = floorOf(grid, doors);
  const taken: CellPoint[] = [];
  for (let round = 0; round < swell.rounds; round++) {
    const options = new Map<string, CellPoint>();
    for (const c of grid.cellsOf(swell.owner)) {
      for (const [dx, dy] of NEAR4) {
        const n = { x: c.x + dx, y: c.y + dy };
        if (grid.owner(n.x, n.y) === ROCK) options.set(cellKey(n.x, n.y), n);
      }
    }
    const ranked = [...options.values()].filter(swell.may).map((c) => [c, swell.score(c.x, c.y)] as const).sort((a, b) => b[1] - a[1] || a[0].y - b[0].y || a[0].x - b[0].x);
    for (const [c] of ranked) {
      if (!swell.may(c) || !grid.mayClaim(c.x, c.y, swell.owner) || pinches(isFloor, c)) continue;
      grid.claim(c.x, c.y, swell.owner);
      taken.push(c);
    }
  }
  releaseSpurs(grid, swell.owner, taken, isFloor);
}

/** Gives back every taken cell left with fewer than two floor cells beside it, until none is: no spur is left. */
export function releaseSpurs(grid: CaveGrid, owner: number, taken: readonly CellPoint[], isFloor: (x: number, y: number) => boolean): void {
  for (let changed = true; changed; ) {
    changed = false;
    for (const c of taken) {
      if (!grid.holds(c.x, c.y, owner) || NEAR4.filter(([dx, dy]) => isFloor(c.x + dx, c.y + dy)).length >= 2) continue;
      grid.release(c.x, c.y);
      changed = true;
    }
  }
}

/** Whether a tunnel may widen into the cell: where it may wind, on no other room's rectangle, never to three cells both ways. */
function widenCell(grid: CaveGrid, floor: { rooms: readonly DungeonRoom[]; doors: readonly DungeonDoor[] }, room: DungeonRoom, c: CellPoint): boolean {
  return inTunnelReach(floor, room, c.x, c.y) && [ROCK, room.id].includes(grid.envelope(c.x, c.y)) && !completesBlock(grid, room.id, c);
}

/** Whether the room may take the rock cell as a chamber's swell or a tunnel's widening may, besides the grid's own rules. */
export function mayWiden(grid: CaveGrid, floor: { rooms: readonly DungeonRoom[]; doors: readonly DungeonDoor[] }, room: DungeonRoom, c: CellPoint, isFloor = floorOf(grid, floor.doors)): boolean {
  if (!grid.mayClaim(c.x, c.y, room.id) || pinches(isFloor, c)) return false;
  if (room.kind !== 'room') return widenCell(grid, floor, room, c);
  return swellDistance(room, c.x, c.y) === 0 || inSwell(grid, floor.doors, room, c.x, c.y);
}

/** Swells a chamber past its rectangle where its field reaches, into rock no room's rectangle holds. */
export function swellChamber(grid: CaveGrid, doors: readonly DungeonDoor[], room: DungeonRoom, field: ChamberField): void {
  swellInto(grid, doors, {
    owner: room.id,
    may: (c) => inSwell(grid, doors, room, c.x, c.y) && field(c.x, c.y) >= SWELL_FIELD,
    score: field,
    rounds: CHAMBER_SWELL,
  });
}

/** Where the floor's tunnels widen: high where they do. One per floor, as every tunnel reads it at its own cells. */
export function widenNoise(rng: Rng): Score {
  return fractalNoise(rng, 1, 0.5, WIDEN_PERIOD);
}

/** Widens a tunnel by a cell where `noise` is high, where it may wind (`inTunnelReach`), never to three cells both ways. */
export function widenTunnel(noise: Score, grid: CaveGrid, floor: { rooms: readonly DungeonRoom[]; doors: readonly DungeonDoor[] }, room: DungeonRoom): void {
  swellInto(grid, floor.doors, {
    owner: room.id,
    may: (c) => widenCell(grid, floor, room, c) && noise(c.x, c.y) > WIDEN_ABOVE,
    score: noise,
    rounds: 1,
  });
}
