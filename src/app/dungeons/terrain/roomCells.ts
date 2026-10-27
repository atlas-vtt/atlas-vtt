/**
 * One room's floor as terrain sees it, cell by cell: which cells may take a piece (inside the
 * floor, round rooms only where the whole cell lies inside the circle), which must stay clear
 * (the cell before each door, every stairwell and the row it is reached from, cells a column
 * stands on), which are taken and whether they can be walked. Placing a piece is allowed only
 * while every cell that can be walked stays reachable from every other: a room never splits.
 *
 * Local coordinates follow the room's axis: `i` from the wall it was entered by (0) to its far
 * wall (`depth - 1`), `j` across it from 0 to `width - 1`.
 */

import type { CellDir, CellPoint, DungeonColumn, DungeonDoor, DungeonRoom, DungeonStair } from '../model';
import { cellKey, cellsOf, dir, doorSide, floorCellsOf, holdsCell } from '../geometry';
import { type StairEnd, approachCells, doorApproaches, spotRect } from '../floors/stairSpots';
import type { Footing } from './catalog';

const STEPS: readonly CellDir[] = [dir(1, 0), dir(-1, 0), dir(0, 1), dir(0, -1)];

/** A side of the room in its own frame: the far wall, the wall it was entered by, and the two across. */
export type WallSide = 'back' | 'left' | 'right' | 'near';
export const WALL_SIDES: readonly WallSide[] = ['back', 'left', 'right', 'near'];

export class RoomCells {
  readonly depth: number;
  readonly width: number;
  /** Cells that can take terrain, by key. */
  private readonly open = new Set<string>();
  /** Floor cells that can be walked when nothing stands on them, by key. */
  private readonly floor = new Set<string>();
  /** Cells that must stay clear, by key. */
  private readonly clear = new Set<string>();
  /** Taken cells and whether they can be walked. */
  private readonly taken = new Map<string, Footing>();
  /** Cells a placed piece needs kept clear (a bridge's landings, the foot of steps), by key. */
  private readonly held = new Set<string>();
  /** The cells every way through the room must reach: before its doors and onto its stairs. */
  readonly needed: CellPoint[];
  /** The floor's stairwells, the rows they are reached from and every cell beside them, by key: no hazard lies there and no bridge lands there. */
  private readonly byStairs = new Set<string>();
  /** The cells of the room's doors other than secret ones, which keep the wall whole, by key. */
  private readonly doorCells: Set<string>;
  /** Where doors on edges open, as `edgeSlot`s of the room's cell beside each and the way out across it. */
  private readonly edgeDoors: Set<string>;
  /** The main path's way through a cave, by key: nothing that blocks stands on it. */
  private readonly lane: ReadonlySet<string>;

  constructor(
    readonly room: DungeonRoom,
    doors: readonly DungeonDoor[],
    stairs: readonly DungeonStair[],
    endOf: (stair: DungeonStair) => StairEnd,
    columns: readonly DungeonColumn[],
    lane: ReadonlySet<string> = new Set(),
  ) {
    const horizontal = room.axis.x !== 0;
    this.depth = horizontal ? room.w : room.h;
    this.width = horizontal ? room.h : room.w;
    this.lane = lane;
    const own = (c: CellPoint): boolean => holdsCell(room, c.x, c.y);
    const inside = stairs.filter((s) => cellsOf(spotRect(s)).every(own));
    const stairCells = inside.flatMap((s) => cellsOf(spotRect(s)));
    const approaches = inside.flatMap((s) => approachCells(s, endOf(s)));
    this.needed = [...doorApproaches(room, doors), ...approaches].filter(own);
    const shown = doors.filter((d) => d.kind !== 'secret' && (d.from === room.id || d.to === room.id));
    this.doorCells = new Set(shown.filter((d) => !d.edge).map((d) => cellKey(d.x, d.y)));
    // A door on an edge is no cell: it opens beyond the room's own cell beside it, towards the room across.
    this.edgeDoors = new Set(
      shown.filter((d) => d.edge).flatMap((d) => doorSide(d, room.id).map((c) => edgeSlot(c, d.from === room.id ? d.dir : { x: -d.dir.x, y: -d.dir.y }))),
    );
    for (const c of [...stairCells, ...this.needed]) this.clear.add(cellKey(c.x, c.y));
    // Every stairwell of the floor counts, not only this room's: a cave chamber may reach beside another's.
    const stairway = stairs.flatMap((s) => [...cellsOf(spotRect(s)), ...approachCells(s, endOf(s))]);
    for (const c of stairway) for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) this.byStairs.add(cellKey(c.x + dx, c.y + dy));
    for (const c of floorCellsOf(room)) {
      if (!this.inside(c, [0.5], 0)) continue;
      const key = cellKey(c.x, c.y);
      this.floor.add(key);
      if (this.inside(c, [0, 1], 0.05) && !this.clear.has(key) && !columns.some((col) => touches(col, c))) this.open.add(key);
    }
  }

  /** The cell at `i` along the room's axis (from its near wall) and `j` across. */
  cell(i: number, j: number): CellPoint {
    const { room } = this;
    if (room.axis.x !== 0) return { x: room.axis.x > 0 ? room.x + i : room.x + room.w - 1 - i, y: room.y + j };
    return { x: room.x + j, y: room.axis.y > 0 ? room.y + i : room.y + room.h - 1 - i };
  }

  /** The cells of the local rectangle from (i, j), `di` deep and `dj` wide. */
  block(i: number, j: number, di: number, dj: number): CellPoint[] {
    const out: CellPoint[] = [];
    for (let a = i; a < i + di; a++) for (let b = j; b < j + dj; b++) out.push(this.cell(a, b));
    return out;
  }

  /** The room's axis: from its near wall towards its far wall. */
  get axis(): CellDir {
    return this.room.axis;
  }

  /** Across the room, the way `j` grows. */
  get across(): CellDir {
    return this.room.axis.x !== 0 ? dir(0, 1) : dir(1, 0);
  }

  /** Floor cells that can be walked when nothing stands on them. */
  get floorCount(): number {
    return this.floor.size;
  }

  /** Whether every cell can take a piece now. */
  fits(cells: readonly CellPoint[]): boolean {
    return cells.length > 0 && cells.every((c) => this.isFree(c));
  }

  isFree(c: CellPoint): boolean {
    const key = cellKey(c.x, c.y);
    return this.open.has(key) && !this.taken.has(key) && !this.held.has(key);
  }

  /** Whether the cell is a stairwell, the row it is reached from, or beside either: a hazard keeps off it and no bridge lands on it. */
  nearStairs(c: CellPoint): boolean {
    return this.byStairs.has(cellKey(c.x, c.y));
  }

  /** Whether the cell lies on a cave's main path. */
  inLane(c: CellPoint): boolean {
    return this.lane.has(cellKey(c.x, c.y));
  }

  /** Whether the cell is floor of this room, taken or not. */
  isFloor(c: CellPoint): boolean {
    return this.floor.has(cellKey(c.x, c.y));
  }

  /**
   * Whether the cell and the eight round it are this room's floor: a cave's drawn outline may wander
   * a fifth of a cell into any cell beside its rock, so a hole cut there would open under its wall.
   */
  clearOfRock(c: CellPoint): boolean {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (!this.floor.has(cellKey(c.x + dx, c.y + dy))) return false;
    return true;
  }

  /** Whether the cell holds a piece that cannot be walked. */
  isBlocked(c: CellPoint): boolean {
    return this.taken.get(cellKey(c.x, c.y)) === 'block';
  }

  /** Whether `cells` could be taken with `footing` and the room stay whole: every walkable cell still reaches every other. */
  allows(cells: readonly CellPoint[], footing: Footing, over: readonly CellPoint[] = []): boolean {
    if (!this.fits(cells)) return false;
    if (footing === 'walk') return true;
    if (cells.some((c) => this.inLane(c))) return false;
    const extra = new Set(cells.map((c) => cellKey(c.x, c.y)));
    for (const c of over) extra.delete(cellKey(c.x, c.y));
    return this.whole(extra);
  }

  /**
   * Whether, with `cells` blocked (but `over`), one more free cell could still take cover and
   * leave the room whole: a hazard never takes the last place for cover.
   */
  keepsCover(cells: readonly CellPoint[], over: readonly CellPoint[] = []): boolean {
    const own = new Set(cells.map((c) => cellKey(c.x, c.y)));
    for (let i = 0; i < this.depth; i++) {
      for (let j = 0; j < this.width; j++) {
        const c = this.cell(i, j);
        if (!own.has(cellKey(c.x, c.y)) && this.isFree(c) && this.allows([...cells, c], 'block', over)) return true;
      }
    }
    return false;
  }

  /** Takes `cells`; a bridge passes `walk` over cells of the hole it crosses. */
  take(cells: readonly CellPoint[], footing: Footing): void {
    for (const c of cells) this.taken.set(cellKey(c.x, c.y), footing);
  }

  /** Lays a walkable crossing over taken cells. */
  bridge(cells: readonly CellPoint[]): void {
    for (const c of cells) this.taken.set(cellKey(c.x, c.y), 'walk');
  }

  /** Keeps cells clear of any later piece: where a bridge lands, before a platform's steps. */
  keepClear(cells: readonly CellPoint[]): void {
    for (const c of cells) this.held.add(cellKey(c.x, c.y));
  }

  /** How many cells can still take a piece. */
  freeCount(): number {
    let n = 0;
    for (const key of this.open) if (!this.taken.has(key) && !this.held.has(key)) n++;
    return n;
  }

  /** How many floor cells are taken by pieces that cannot be walked. */
  blockedCount(): number {
    let n = 0;
    for (const footing of this.taken.values()) if (footing === 'block') n++;
    return n;
  }

  /** The way out of the room through `side`. */
  beyond(side: WallSide): CellDir {
    const { axis, across } = this;
    switch (side) {
      case 'back':
        return axis;
      case 'near':
        return dir(-axis.x, -axis.y);
      case 'right':
        return across;
      case 'left':
        return dir(-across.x, -across.y);
    }
  }

  /** The way along the wall of `side`, the order its wall cells come in. */
  alongWall(side: WallSide): CellDir {
    return side === 'back' || side === 'near' ? this.across : this.axis;
  }

  /** Every floor cell whose neighbour beyond `side` is no floor of the room, along the wall in order. */
  wallCells(side: WallSide): CellPoint[] {
    const d = this.beyond(side);
    const along = this.alongWall(side);
    return [...this.floor]
      .map((key) => key.split(',').map(Number) as [number, number])
      .filter(([x, y]) => !this.floor.has(cellKey(x + d.x, y + d.y)))
      .map(([x, y]) => ({ x, y }))
      .sort((a, b) => a.x * along.x + a.y * along.y - (b.x * along.x + b.y * along.y));
  }

  /** Whether a door (not a secret one) opens in the wall beyond `c` on `side`. */
  doorOn(side: WallSide, c: CellPoint): boolean {
    const d = this.beyond(side);
    return this.doorCells.has(cellKey(c.x + d.x, c.y + d.y)) || this.edgeDoors.has(edgeSlot(c, d));
  }

  /** Whether the cell lies off every way through the room (its lanes, what they keep clear, a cave's main path), whatever stands there. */
  offWays(c: CellPoint): boolean {
    const key = cellKey(c.x, c.y);
    return this.open.has(key) && !this.held.has(key) && !this.lane.has(key);
  }

  /** Whether the cell is one every way through the room keeps: a stairwell, the row it is reached from, the cell before a door. */
  isKeptClear(c: CellPoint): boolean {
    return this.clear.has(cellKey(c.x, c.y));
  }

  /** Whether a piece already stands on the cell, walkable or not. */
  isTaken(c: CellPoint): boolean {
    return this.taken.has(cellKey(c.x, c.y));
  }

  /** Whether every walkable floor cell, with `extra` blocked too, reaches every other. */
  private whole(extra: ReadonlySet<string>): boolean {
    const walkable = (key: string): boolean => this.floor.has(key) && this.taken.get(key) !== 'block' && !extra.has(key);
    const start = [...this.floor].find(walkable);
    if (start === undefined) return false;
    const seen = new Set([start]);
    const queue = [start];
    for (let head = 0; head < queue.length; head++) {
      const [x, y] = (queue[head] as string).split(',').map(Number) as [number, number];
      for (const d of STEPS) {
        const key = cellKey(x + d.x, y + d.y);
        if (seen.has(key) || !walkable(key)) continue;
        seen.add(key);
        queue.push(key);
      }
    }
    let count = 0;
    for (const key of this.floor) if (walkable(key)) count++;
    return seen.size === count && this.needed.every((c) => seen.has(cellKey(c.x, c.y)));
  }

  /** Whether the points of the cell at `at` (0 a corner, 0.5 its middle) lie `margin` inside the circle of a round room. */
  private inside(c: CellPoint, at: readonly number[], margin: number): boolean {
    const { room } = this;
    if (!room.rotunda) return true;
    const cx = room.x + room.w / 2;
    const cy = room.y + room.h / 2;
    const r = Math.sqrt(room.w * room.w + 1) / 2 - margin;
    return at.every((dx) => at.every((dy) => Math.hypot(c.x + dx - cx, c.y + dy - cy) <= r));
  }
}

/** Whether a column stands on or touches the cell. */
function touches(column: DungeonColumn, c: CellPoint): boolean {
  const dx = Math.max(c.x - column.x, 0, column.x - (c.x + 1));
  const dy = Math.max(c.y - column.y, 0, column.y - (c.y + 1));
  return Math.hypot(dx, dy) < column.radius + 0.05;
}

/** The edge of cell `c` towards `d`, as a key. */
function edgeSlot(c: CellPoint, d: CellPoint): string {
  return `${cellKey(c.x, c.y)}>${d.x},${d.y}`;
}
