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
import { FloorGraph } from './floorGraph';
import { type WallSide, edgeSlot, insideRound, sideBeyond, touches } from './roomFrame';

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
  private floorGraph: FloorGraph | null = null;

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
      if (!insideRound(room, c, [0.5], 0)) continue;
      const key = cellKey(c.x, c.y);
      this.floor.add(key);
      if (insideRound(room, c, [0, 1], 0.05) && !this.clear.has(key) && !columns.some((col) => touches(col, c))) this.open.add(key);
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
   * leave the room whole: a hazard never takes the last place for cover. One walk of the room finds
   * every cell whose loss would split it, so a chamber of hundreds of cells costs no flood fill per cell.
   */
  keepsCover(cells: readonly CellPoint[], over: readonly CellPoint[] = []): boolean {
    if (!cells.every((c) => this.isFree(c)) || cells.some((c) => this.inLane(c))) return false;
    const own = new Set(cells.map((c) => cellKey(c.x, c.y)));
    const spared = new Set(over.map((c) => cellKey(c.x, c.y)));
    const graph = this.graph();
    const walkable = this.walkable(new Set([...own].filter((key) => !spared.has(key))));
    if (!this.needed.every((c) => walkable[graph.numberOf(c) ?? -1] === 1)) return false;
    const { of, sizes } = graph.pieces(walkable);
    let cut: Uint8Array | null = null;
    // With the room in one piece, any cell but one it hangs together by; in two, only a lone cell that is the second.
    const takes = (c: CellPoint): boolean => {
      if (spared.has(cellKey(c.x, c.y))) return sizes.length === 1;
      const v = graph.numberOf(c) as number;
      if (sizes.length === 2) return sizes[of[v] as number] === 1;
      if (sizes.length !== 1 || (sizes[0] as number) < 2) return false;
      cut ??= graph.cutCells(walkable, v);
      return cut[v] === 0;
    };
    for (let i = 0; i < this.depth; i++) {
      for (let j = 0; j < this.width; j++) {
        const c = this.cell(i, j);
        if (!own.has(cellKey(c.x, c.y)) && this.isFree(c) && !this.inLane(c) && takes(c)) return true;
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
    return sideBeyond(this.axis, this.across, side);
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
    const graph = this.graph();
    const walkable = this.walkable(extra);
    return graph.pieces(walkable).sizes.length === 1 && this.needed.every((c) => walkable[graph.numberOf(c) ?? -1] === 1);
  }

  /** Which floor cells can be walked with `extra` blocked too, by the graph's numbers. */
  private walkable(extra: ReadonlySet<string>): Uint8Array {
    const { keys } = this.graph();
    const out = new Uint8Array(keys.length);
    keys.forEach((key, v) => {
      out[v] = this.taken.get(key) !== 'block' && !extra.has(key) ? 1 : 0;
    });
    return out;
  }

  /** The floor as a graph, numbered once the first time it is asked for. */
  private graph(): FloorGraph {
    this.floorGraph ??= new FloorGraph([...this.floor].map((key) => key.split(',').map(Number) as [number, number]).map(([x, y]) => ({ x, y })));
    return this.floorGraph;
  }
}
