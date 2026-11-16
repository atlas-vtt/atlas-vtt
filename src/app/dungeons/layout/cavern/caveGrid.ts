/**
 * Who owns each cell of a cave floor while it is shaped: a room, a door, or rock. A room claims
 * cells only where no cell of another room, and no door of other rooms, touches them (side or
 * corner), so two rooms meet only through their doors. The cells before doors, stairwells and the
 * rows they are reached from are claimed from the start and never given up.
 */

import { approachCells, type StairSpot, spotRect, stairwellCells } from '../../floors/stairSpots';
import { cellKey, cellsOf, doorCells, doorSide, floorRect, inRect, wallRect } from '../../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../../model';

/** A floor as shaping reads it, planned or being planned: its stairwells by their rectangles (and the floor each leads to, where known). */
export interface CaveFloorPlan {
  rooms: readonly DungeonRoom[];
  doors: readonly DungeonDoor[];
  stairs: readonly (StairSpot & { to?: number; link?: number })[];
}

export const ROCK = -1;

/** The owner number of the door at `index` of the floor's doors. */
export function doorOwner(index: number): number {
  return -2 - index;
}

const isDoor = (owner: number): boolean => owner <= -2;
const doorIndex = (owner: number): number => -2 - owner;

/** How far past a room's walls a cave may reach: a tunnel one cell beyond its side walls. */
const MARGIN = 3;

/** The steps to a cell's four side neighbours, and with them to its eight. */
export const NEAR4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
export const NEAR8: readonly (readonly [number, number])[] = [...NEAR4, [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** The cell a `cellKey` names. */
export function unkey(key: string): CellPoint {
  const comma = key.indexOf(',');
  return { x: Number(key.slice(0, comma)), y: Number(key.slice(comma + 1)) };
}

/** The rows a stairwell is reached from on this floor. */
function stairRows(stair: StairSpot & { to?: number }, index: number): CellPoint[] {
  if (stair.to === undefined || index < 0) return [...approachCells(stair, 'upper'), ...approachCells(stair, 'lower')];
  return approachCells(stair, stair.to > index ? 'upper' : 'lower');
}

export class CaveGrid {
  private readonly x0: number;
  private readonly y0: number;
  private readonly w: number;
  private readonly h: number;
  private readonly owners: Int32Array;
  private readonly envelopes: Int32Array;
  private readonly cells = new Map<number, Set<number>>();
  private readonly needed = new Map<number, Set<string>>();
  private readonly held = new Set<number>();
  /** Cells held as rock against some rooms only (`turnToRock`'s `against`), by index: any other room may take them. */
  private readonly heldAgainst = new Map<number, ReadonlySet<number>>();
  /** The cells claimed from the start, by key: before each door, every stairwell and the row it is reached from. */
  private readonly anchors = new Set<string>();
  readonly doors: readonly DungeonDoor[];
  /** Every stairwell's cells, by key: kept floor that no way between the room's other floor may cross. */
  readonly stairCells: ReadonlySet<string>;

  /** `index`, the floor's own, tells which end of each stairwell lies on it; unset, both rows a stairwell is reached from are kept. */
  constructor(floor: CaveFloorPlan, index = -1) {
    this.doors = floor.doors;
    this.stairCells = stairwellCells(floor.stairs);
    const rects = floor.rooms.map((room) => wallRect(room));
    const xs = [...rects.flatMap((r) => [r.x0, r.x1]), ...floor.doors.map((d) => d.x)];
    const ys = [...rects.flatMap((r) => [r.y0, r.y1]), ...floor.doors.map((d) => d.y)];
    this.x0 = Math.min(...xs) - MARGIN;
    this.y0 = Math.min(...ys) - MARGIN;
    this.w = Math.max(...xs) + MARGIN - this.x0 + 1;
    this.h = Math.max(...ys) + MARGIN - this.y0 + 1;
    this.owners = new Int32Array(this.w * this.h).fill(ROCK);
    this.envelopes = new Int32Array(this.w * this.h).fill(ROCK);
    for (const room of floor.rooms) for (const c of cellsOf(floorRect(room))) this.envelopes[this.index(c.x, c.y)] = room.id;
    floor.doors.forEach((door, k) => {
      for (const c of doorCells(door)) this.claim(c.x, c.y, doorOwner(k));
    });
    // Each room's door approaches (`doorApproaches`), in the doors' order, read in one pass over the doors.
    const approaches = new Map<number, CellPoint[]>();
    for (const door of floor.doors) {
      for (const id of door.from === door.to ? [door.from] : [door.from, door.to]) {
        if (id === null) continue;
        const list = approaches.get(id) ?? [];
        list.push(...doorSide(door, id));
        approaches.set(id, list);
      }
    }
    for (const room of floor.rooms) {
      const rect = floorRect(room);
      const stairs = floor.stairs.filter((s) => cellsOf(spotRect(s)).every((c) => inRect(rect, c.x, c.y)));
      const own = [
        ...(approaches.get(room.id) ?? []),
        ...stairs.flatMap((s) => [...cellsOf(spotRect(s)), ...stairRows(s, index)]),
      ].filter((c) => inRect(rect, c.x, c.y));
      this.require(room.id, own);
      for (const c of own) this.anchors.add(cellKey(c.x, c.y));
    }
  }

  private index(x: number, y: number): number {
    const gx = x - this.x0;
    const gy = y - this.y0;
    return gx < 0 || gy < 0 || gx >= this.w || gy >= this.h ? -1 : gy * this.w + gx;
  }

  /** The cells the grid covers: every room's walls and three cells beyond. */
  box(): { x0: number; y0: number; w: number; h: number } {
    return { x0: this.x0, y0: this.y0, w: this.w, h: this.h };
  }

  /** Room id, `doorOwner(i)`, or `ROCK`. */
  owner(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? ROCK : (this.owners[i] ?? ROCK);
  }

  /** The room whose rectangle holds the cell, else `ROCK`. */
  envelope(x: number, y: number): number {
    const i = this.index(x, y);
    return i < 0 ? ROCK : (this.envelopes[i] ?? ROCK);
  }

  claim(x: number, y: number, owner: number): void {
    const i = this.index(x, y);
    if (i < 0) return;
    // A room another hold let take the cell (`mayClaim`) makes it floor.
    if (this.heldAgainst.delete(i)) this.held.delete(i);
    const before = this.owners[i] ?? ROCK;
    if (before !== ROCK) this.cells.get(before)?.delete(i);
    this.owners[i] = owner;
    let own = this.cells.get(owner);
    if (!own) {
      own = new Set();
      this.cells.set(owner, own);
    }
    own.add(i);
  }

  release(x: number, y: number): void {
    const i = this.index(x, y);
    if (i < 0) return;
    this.cells.get(this.owners[i] ?? ROCK)?.delete(i);
    this.owners[i] = ROCK;
  }

  /** Whether two owners may touch: a room only its own doors, a door only its two rooms and the doors of either (a junction's). */
  private mayTouch(owner: number, other: number): boolean {
    if (other === ROCK || other === owner) return true;
    const ownerIsDoor = isDoor(owner);
    if (ownerIsDoor && isDoor(other)) {
      const a = this.doors[doorIndex(owner)];
      const b = this.doors[doorIndex(other)];
      return a !== undefined && b !== undefined && [a.from, a.to].some((room) => room !== null && (room === b.from || room === b.to));
    }
    if (ownerIsDoor === isDoor(other)) return false;
    const door = this.doors[doorIndex(ownerIsDoor ? owner : other)];
    const room = ownerIsDoor ? other : owner;
    return door !== undefined && (door.from === room || door.to === room);
  }

  /**
   * Whether `owner` at (x, y) may touch `other` at (nx, ny), with owners read through `ownerAt`:
   * a room its own doors, a door its two rooms, and two rooms only round the narrows that joins
   * them, both beside its cells (two tunnels turning through one narrows).
   */
  mayTouchAt(owner: number, other: number, x: number, y: number, nx: number, ny: number, ownerAt: (x: number, y: number) => number = (cx, cy) => this.owner(cx, cy)): boolean {
    if (this.mayTouch(owner, other)) return true;
    if (isDoor(owner) || isDoor(other) || owner === ROCK || other === ROCK) return false;
    // A cell held as rock beside a pinch of the main path is no part of the narrows two rooms may meet round.
    const byDoor = (k: number, cx: number, cy: number): boolean => NEAR8.some(([dx, dy]) => ownerAt(cx + dx, cy + dy) === doorOwner(k) && !this.heldAsRock(cx + dx, cy + dy));
    // A crawl is rock as drawn, so nothing meets round it.
    return this.doors.some((door, k) => door.kind !== 'secret' && ((door.from === owner && door.to === other) || (door.from === other && door.to === owner)) && byDoor(k, x, y) && byDoor(k, nx, ny));
  }

  /** Whether `owner`, a room, may take the cell at index `i` though it is held: it is held against other rooms only. */
  private mayBite(i: number, owner: number): boolean {
    const against = this.heldAgainst.get(i);
    return against !== undefined && owner >= 0 && !against.has(owner);
  }

  /** Whether `owner` may take the rock cell: nothing it may not touch lies beside it or at its corners, and it is not held as rock (against it). */
  mayClaim(x: number, y: number, owner: number): boolean {
    const i = this.index(x, y);
    if (i < 0 || (this.held.has(i) && !this.mayBite(i, owner)) || (this.owners[i] !== ROCK && this.owners[i] !== owner)) return false;
    return NEAR8.every(([dx, dy]) => this.mayTouchAt(owner, this.owner(x + dx, y + dy), x, y, x + dx, y + dy));
  }

  cellsOf(owner: number): CellPoint[] {
    return [...(this.cells.get(owner) ?? [])].sort((a, b) => a - b).map((i) => ({ x: (i % this.w) + this.x0, y: Math.floor(i / this.w) + this.y0 }));
  }

  /** Whether the cell belongs to `owner`. */
  holds(x: number, y: number, owner: number): boolean {
    return this.owner(x, y) === owner;
  }

  /**
   * Keeps the cell its owner's, so no room takes it, but rock as drawn (`heldAsRock`): the wall cell
   * beside a door where the main path pinches to one cell, which every pass that shapes the floor
   * round it must read as rock from the start.
   */
  holdAsRock(x: number, y: number): void {
    const i = this.index(x, y);
    if (i >= 0) this.held.add(i);
  }

  /**
   * Gives the cell to the rock for good: no owner, needed by no one, and held so nothing takes it
   * again (`mayClaim`): the rock either side of a narrow way's neck (`holdNecks`), which every pass
   * that shapes the floor must leave alone. Held only `against` some rooms (the neck's own, kept
   * from winding back), any other room may still bite into it as it swells, so the rock round a
   * neck never stands as a straight wall beside another passage; a later hold against all wins.
   */
  turnToRock(x: number, y: number, against?: readonly number[]): void {
    const i = this.index(x, y);
    if (i < 0) return;
    const before = this.held.has(i) ? (this.heldAgainst.get(i) ?? null) : undefined;
    this.release(x, y);
    const k = cellKey(x, y);
    for (const set of this.needed.values()) set.delete(k);
    this.held.add(i);
    if (!against || before === null) this.heldAgainst.delete(i);
    else this.heldAgainst.set(i, new Set([...(before ?? []), ...against]));
  }

  /**
   * Gives back a cell `holdAsRock` held, still its owner's: the wall cell beside a pinch of the main
   * path whose neck could not be held, which the lane then passes two cells wide.
   */
  letGo(x: number, y: number): void {
    const i = this.index(x, y);
    if (i < 0) return;
    this.held.delete(i);
    this.heldAgainst.delete(i);
  }

  /**
   * Whether the cell was claimed from the start: the cell before a door, a stairwell or the row it is
   * reached from, which the terrain keeps clear and the stairs are walked across, so no neck may
   * turn it to rock (`turnToRock`).
   */
  anchored(x: number, y: number): boolean {
    return this.anchors.has(cellKey(x, y));
  }

  /** Whether the cell is held as rock against every room (`holdAsRock`, `turnToRock` without `against`). */
  heldFirmly(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.held.has(i) && !this.heldAgainst.has(i);
  }

  /** Whether the cell is held as rock (`holdAsRock`, `turnToRock`). */
  heldAsRock(x: number, y: number): boolean {
    const i = this.index(x, y);
    return i >= 0 && this.held.has(i);
  }

  /** Claims cells for `owner` that it may never give up. */
  require(owner: number, cells: readonly CellPoint[]): void {
    let set = this.needed.get(owner);
    if (!set) {
      set = new Set();
      this.needed.set(owner, set);
    }
    for (const c of cells) {
      this.claim(c.x, c.y, owner);
      set.add(cellKey(c.x, c.y));
    }
  }

  /** Cells that may never be given up: before doors, stairwells and their rows, the lane. */
  required(owner: number): ReadonlySet<string> {
    return this.needed.get(owner) ?? new Set();
  }
}
