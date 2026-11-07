/**
 * A house's windows (report 2026-10-25-mansion-windows-research): on the bays of its facades
 * (`houseFacade.ts`), which are the same on every floor, so windows stand over windows. What a room
 * takes follows its kind and its wall: none in a store, one small window in a closet or a room of
 * eight cells, one tall window in a stair hall, windows only at a corridor's ends, in a main room
 * one to every bay of its wall up to three (five in a great room), fewer on side walls, in the
 * service rooms and under the attic's roof, and one small window in a cellar room that is no store.
 * Corners stay solid and a window keeps a cell from a cross wall. On a front that mirrors about the
 * axis a window whose twin is refused stays blind, so the front mirrors on every floor.
 */

import { cellKey, dir, doorCells } from '../../geometry';
import type { DungeonDoor, DungeonWindow, WindowSize } from '../../model';
import type { RoomTypeId } from '../../themes/roomTypes';
import { type EdgeRun, SIDES, holds, roomCells, runsOf } from './houseEdges';
import { type Edge, type Facade, alongEdge } from './houseFacade';
import type { StoreyKind } from './houseStorey';
import type { TypedRoom } from './houseZones';

const STORES: ReadonlySet<RoomTypeId> = new Set(['storeroom', 'wine-cellar']);
const CLOSETS: ReadonlySet<RoomTypeId> = new Set(['bathroom', 'dressing-room', 'servery']);
const GREAT: ReadonlySet<RoomTypeId> = new Set(['ballroom', 'portrait-gallery', 'drawing-room', 'saloon', 'entrance-hall', 'landing']);
/** A room of this many cells or fewer, or two cells wide, is lit like a closet. */
const SMALL_AREA = 8;

/** How a room is lit: not at all, at a corridor's ends, by a stair hall's tall window, by one small window, or by its wall's bays. */
type Lighting = 'none' | 'corridor' | 'stair' | 'one' | 'main';

/** The edge a window stands on, as a key. */
const windowKey = (w: Edge): string => `${cellKey(w.x, w.y)}>${w.dir.x},${w.dir.y}`;

function lightingOf(room: TypedRoom, kind: StoreyKind): Lighting {
  if (room.type && STORES.has(room.type)) return 'none';
  if (kind === 'cellar') return room.kind === 'room' && room.role !== 'stair-hall' ? 'one' : 'none';
  if (room.kind === 'corridor') return 'corridor';
  if (room.role === 'stair-hall') return 'stair';
  const small = (room.type !== null && CLOSETS.has(room.type)) || roomCells(room).length <= SMALL_AREA || Math.min(room.box.w, room.box.h) <= 2;
  return small ? 'one' : 'main';
}

/** The edges doors stand on, from either side. */
function doorEdges(doors: readonly DungeonDoor[]): Set<string> {
  const keys = new Set<string>();
  for (const door of doors) {
    for (const c of doorCells(door)) {
      keys.add(windowKey({ ...c, dir: door.dir }));
      keys.add(windowKey({ x: c.x + door.dir.x, y: c.y + door.dir.y, dir: dir(-door.dir.x, -door.dir.y) }));
    }
  }
  return keys;
}

export interface WindowFloorInput {
  frame: { width: number; symmetric: boolean };
  facade: Facade;
  kind: StoreyKind;
  rooms: readonly TypedRoom[];
  doors: readonly DungeonDoor[];
  inHouse: (x: number, y: number) => boolean;
  /** Edges of the floor below (the floor above, for a cellar) that hold a window or a door: a window there is preferred. */
  lined: ReadonlySet<string>;
}

/** One floor's windows as they are being placed, and the rules each room keeps. */
export class WindowFloor {
  readonly windows: DungeonWindow[] = [];
  private readonly keys = new Set<string>();
  private readonly doorKeys: Set<string>;

  constructor(private readonly input: WindowFloorInput) {
    this.doorKeys = doorEdges(input.doors);
  }

  /** Every edge of the floor that holds a window or a door, by key. */
  linedKeys(): Set<string> {
    return new Set([...this.keys, ...this.doorKeys]);
  }

  has(edge: Edge): boolean {
    return this.keys.has(windowKey(edge));
  }

  /** Whether `edge` holds a window or a door. */
  lined(edge: Edge): boolean {
    return this.has(edge) || this.doorKeys.has(windowKey(edge));
  }

  /** The room whose outer wall `edge` is, if any. */
  ownerOf(edge: Edge): number | null {
    const { rooms, inHouse } = this.input;
    if (inHouse(edge.x + edge.dir.x, edge.y + edge.dir.y)) return null;
    const id = rooms.findIndex((r) => holds(r, edge.x, edge.y));
    return id < 0 ? null : id;
  }

  /** Places every room's windows. */
  place(): void {
    this.input.rooms.forEach((room, id) => this.light(room, id));
    if (this.input.frame.symmetric && this.input.kind !== 'cellar') this.mirrorFront();
  }

  /** Whether the room under `edge` takes a window there that the floor above stands over it, and adds it (with its twin on a mirrored front). */
  takeFromAbove(edge: Edge): boolean {
    const twin = this.twinOf(edge);
    const pair = twin && windowKey(twin) !== windowKey(edge) ? [edge, twin] : [edge];
    if (!pair.every((e) => this.has(e) || this.accepts(e))) return false;
    for (const e of pair) if (!this.has(e)) this.add(e, this.ownerOf(e)!);
    return true;
  }

  private accepts(edge: Edge): boolean {
    const id = this.ownerOf(edge);
    if (id === null) return false;
    const room = this.input.rooms[id]!;
    const lighting = lightingOf(room, this.input.kind);
    const run = this.runsOf(room).find((r) => r.dir.x === edge.dir.x && r.dir.y === edge.dir.y && r.cells.some((c) => c.x === edge.x && c.y === edge.y));
    if (!run || !this.qualifies(edge, room, run)) return false;
    if (lighting === 'one') return !this.windows.some((w) => w.room === id);
    if (lighting !== 'main') return false;
    const onRun = run.cells.filter((c) => this.has({ ...c, dir: run.dir })).length;
    return onRun < this.capOf(room, run, this.input.facade.onAxis(edge));
  }

  private runsOf(room: TypedRoom): EdgeRun[] {
    return SIDES.flatMap((side) => runsOf(room, side, (x, y) => !this.input.inHouse(x, y)));
  }

  /**
   * Whether a window may stand on `edge` by its wall: no door there, corners solid, a cell clear of
   * cross walls on a wall of three cells or more, and a pier between it and any window beside it
   * (but in a corridor's end, whose two cells both take one).
   */
  private qualifies(edge: Edge, room: TypedRoom, run: EdgeRun): boolean {
    if (this.doorKeys.has(windowKey(edge))) return false;
    const { inHouse } = this.input;
    const t = { x: edge.dir.y !== 0 ? 1 : 0, y: edge.dir.y !== 0 ? 0 : 1 };
    for (const n of [-1, 1]) {
      const c = { x: edge.x + t.x * n, y: edge.y + t.y * n };
      if (!inHouse(c.x, c.y) || inHouse(c.x + edge.dir.x, c.y + edge.dir.y)) return false;
      if (room.kind !== 'corridor' && this.has({ ...c, dir: edge.dir }) && !this.input.facade.overEntrance(edge)) return false;
      if (run.cells.length >= 3 && room.kind !== 'corridor' && !holds(room, c.x, c.y)) return false;
    }
    return true;
  }

  /** The most windows a main room takes on a run: one to two cells beyond the corner cells, from one to three (five in a great room); on a mirrored front, every bay. */
  private capOf(room: TypedRoom, run: EdgeRun, onAxis: boolean): number {
    const n = run.cells.length;
    const bays = Math.max(1, Math.ceil((n - 2) / 2));
    if (onAxis) return bays;
    let cap = Math.min(bays, room.type && GREAT.has(room.type) ? 5 : 3);
    if (this.input.kind === 'attic') cap = 1;
    if (room.zone === 'service') cap = Math.min(cap, room.type === 'kitchen' ? 2 : 1);
    if (run.dir.x !== 0) cap = Math.min(cap, 2);
    return cap;
  }

  private add(edge: Edge, room: number, size?: WindowSize): void {
    this.windows.push({ x: edge.x, y: edge.y, dir: edge.dir, room, ...(size && { size }) });
    this.keys.add(windowKey(edge));
  }

  private remove(edge: Edge): void {
    const key = windowKey(edge);
    this.keys.delete(key);
    this.windows.splice(this.windows.findIndex((w) => windowKey(w) === key), 1);
  }

  /** How well a cell suits a window: over a window or door of the neighbouring floor first, then nearest the middle of its run, the longer run first. */
  private score(edge: Edge, run: EdgeRun): number {
    return (this.input.lined.has(windowKey(edge)) ? 0 : 1000) + Math.abs(alongEdge(edge) - middleOf(run)) * 2 - run.cells.length / 100;
  }

  private light(room: TypedRoom, id: number): void {
    const lighting = lightingOf(room, this.input.kind);
    if (lighting === 'none') return;
    const { facade } = this.input;
    // Front and back first, so a corner room's side wall knows it is lit already.
    const runs = this.runsOf(room).sort((p, q) => Math.abs(q.dir.y) - Math.abs(p.dir.y));
    const cells = (run: EdgeRun): Edge[] => this.candidates(room, run);
    const best = (pool: { e: Edge; run: EdgeRun }[]): Edge | undefined => [...pool].sort((p, q) => this.score(p.e, p.run) - this.score(q.e, q.run))[0]?.e;
    const all = runs.flatMap((run) => cells(run).map((e) => ({ e, run })));
    if (lighting === 'corridor') {
      const long: 'x' | 'y' = room.box.w >= room.box.h ? 'x' : 'y';
      for (const run of runs.filter((r) => r.dir[long] !== 0)) {
        const ok = cells(run);
        if (ok.length !== run.cells.length) continue;
        const n = run.cells.length;
        for (const e of n <= 2 ? ok : ok.slice((n - 1) >> 1, (n >> 1) + 1)) this.add(e, id);
      }
      return;
    }
    if (lighting === 'stair') {
      const e = best(all);
      if (e) this.add(e, id, 'tall');
      return;
    }
    if (lighting === 'one') {
      const cellar = this.input.kind === 'cellar';
      const e = best(all.filter(({ e }) => cellar || facade.isBay(e)));
      if (e) this.add(e, id, 'small');
      return;
    }
    let lit = 0;
    for (const run of runs) {
      const bays = cells(run).filter((e) => facade.isBay(e));
      const onAxis = bays.length > 0 && facade.onAxis(bays[0]!);
      const cap = run.dir.x !== 0 && lit > 0 ? 1 : this.capOf(room, run, onAxis);
      const chosen = evenly(bays, cap, middleOf(run), (e) => this.input.lined.has(windowKey(e)));
      for (const e of chosen) this.add(e, id);
      lit += chosen.length;
    }
    // A main room the bays miss takes one window off them, in the middle of a wall that is no mirrored front.
    if (lit === 0) {
      const e = best(all.filter(({ e }) => !(this.input.frame.symmetric && facade.onAxis(e))));
      if (e) this.add(e, id);
    }
  }

  /** The edges of a run a window may stand on. */
  private candidates(room: TypedRoom, run: EdgeRun): Edge[] {
    return run.cells.map((c) => ({ ...c, dir: run.dir })).filter((e) => this.qualifies(e, room, run));
  }

  private twinOf(edge: Edge): Edge | null {
    const { frame, facade } = this.input;
    return frame.symmetric && facade.onAxis(edge) ? { x: frame.width - 1 - edge.x, y: edge.y, dir: edge.dir } : null;
  }

  /** On a front that mirrors about the axis, a window whose twin is refused stays blind; a main room left dark there takes a pair of twins. */
  private mirrorFront(): void {
    for (const w of [...this.windows]) {
      const twin = this.twinOf(w);
      if (twin && w.size !== 'tall' && !this.has(twin)) this.remove(w);
    }
    this.input.rooms.forEach((room, id) => {
      if (lightingOf(room, this.input.kind) !== 'main' || this.windows.some((w) => w.room === id)) return;
      // A pair on the bays first, else the twins nearest the wall's middle.
      for (const onBays of [true, false]) {
        for (const run of this.runsOf(room)) {
          const pairs = this.candidates(room, run)
            .filter((e) => {
              const twin = this.twinOf(e);
              // Twins either side of the axis would touch.
              return (!onBays || this.input.facade.isBay(e)) && twin !== null && Math.abs(twin.x - e.x) !== 1;
            })
            .sort((p, q) => this.score(p, run) - this.score(q, run));
          if (pairs.some((e) => this.takeFromAbove(e))) return;
        }
      }
      // Where every twin is refused, light comes before the mirror: one window, on a wall off the mirrored front where the room has one.
      const runs = this.runsOf(room);
      const lone = runs.flatMap((run) => this.candidates(room, run).map((e) => ({ e, run })));
      const rank = ({ e, run }: { e: Edge; run: EdgeRun }): number => (this.twinOf(e) ? 10_000 : 0) + this.score(e, run);
      const e = lone.sort((p, q) => rank(p) - rank(q))[0]?.e;
      if (e) this.add(e, id);
    });
  }
}

/** The middle of a run along its wall. */
const middleOf = (run: EdgeRun): number => {
  const [first, last] = [run.cells[0]!, run.cells[run.cells.length - 1]!];
  return run.dir.y !== 0 ? (first.x + last.x) / 2 : (first.y + last.y) / 2;
};

/** `k` of `cells` (in order along their wall) that follow each other: as many over windows below as can be, then about the wall's middle `mid`. */
function evenly(cells: readonly Edge[], k: number, mid: number, lined: (e: Edge) => boolean): Edge[] {
  if (cells.length <= k) return [...cells];
  let best: Edge[] = [];
  let bestScore = Infinity;
  for (let s = 0; s + k <= cells.length; s++) {
    const pick = cells.slice(s, s + k);
    const value = pick.filter((e) => !lined(e)).length * 1000 + Math.abs((alongEdge(pick[0]!) + alongEdge(pick[k - 1]!)) / 2 - mid);
    if (value < bestScore) {
      bestScore = value;
      best = pick;
    }
  }
  return best;
}
