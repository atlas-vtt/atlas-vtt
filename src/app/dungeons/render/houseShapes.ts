/**
 * The floors of a house as drawn (`DungeonFloor.walls === 'edges'`): its walls stand on the edges
 * between cells, so each room's floor is its rectangle drawn back from every edge it shares with
 * the house by half an inner wall and from the house's outside by half an outer wall, and a doorway
 * is a thin floor across its edge that joins the two rooms. Everything else inside the outer walls'
 * outer face is masonry (`house/houseWalls.ts`): an inner wall a thin partition, an outer wall solid.
 */

import { cellKey, cellsBox, doorCells, houseCells } from '../geometry';
import type { CellDir, DungeonDoor, DungeonFloor, DungeonRoom, DungeonWindow, WindowSize } from '../model';
import { cellsShapes, shapeBounds, type FloorShape, type PolyShape, type RectShape, type Vec } from './geometry';

/** An inner wall's thickness, in cells: wider than the widest wall ink (0.073), so the wall rings of two rooms never meet. */
export const INNER_WALL = 0.1;
/** An outer wall's thickness, in cells: solid masonry of 1.7 ft, the cell edge its middle line. */
export const OUTER_WALL = 0.34;
/** How far a doorway's floor reaches past the floors it joins, so the two become one. */
const OVERLAP = 0.01;
/**
 * A window's span along its edge, by its size: wall stays at each end, so neighbouring windows never
 * run together. A stair hall's tall window takes most of its cell, a closet's or cellar's small one
 * little more than a third.
 */
const WINDOW_INSET: Readonly<Record<WindowSize | 'facade', number>> = { facade: 0.18, tall: 0.08, small: 0.31 };

const SIDES: readonly CellDir[] = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
];

/** The cells across a room's side towards `side`. */
function beyond(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h'>, side: CellDir): Vec[] {
  if (side.y !== 0) {
    const y = side.y < 0 ? room.y - 1 : room.y + room.h;
    return Array.from({ length: room.w }, (_, k) => ({ x: room.x + k, y }));
  }
  const x = side.x < 0 ? room.x - 1 : room.x + room.w;
  return Array.from({ length: room.h }, (_, k) => ({ x, y: room.y + k }));
}

/** How far a room's floor stands back from its side towards `side`: half an outer wall where any of it faces the outside. */
function sideInset(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h'>, side: CellDir, house: ReadonlySet<string>): number {
  return beyond(room, side).every((c) => house.has(cellKey(c.x, c.y))) ? INNER_WALL / 2 : OUTER_WALL / 2;
}

/**
 * A room's floor in a house: its rectangle drawn back from each side by half the wall that stands
 * there; a room a chimney stack was cut from, its outline drawn back edge by edge.
 */
export function houseRoomShape(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h' | 'cells'>, house: ReadonlySet<string>): RectShape | PolyShape {
  if (room.cells) return { kind: 'poly', rings: cellsShapes(room.cells).slice(0, 1).map((shape) => insetRing(shape.rings[0] ?? [], house)) };
  const [top, right, bottom, left] = SIDES.map((side) => sideInset(room, side, house)) as [number, number, number, number];
  return { kind: 'rect', x: room.x + left, y: room.y + top, w: room.w - left - right, h: room.h - top - bottom };
}

/**
 * A clockwise ring of cell corners drawn back into the room, each unit of edge by half the wall
 * beyond it: perpendicular runs meet at the corner of their lines, runs in line with another inset
 * step between them.
 */
function insetRing(ring: readonly Vec[], house: ReadonlySet<string>): Vec[] {
  const units: { p: Vec; t: Vec; d: number }[] = [];
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    const t = { x: Math.sign(b.x - a.x), y: Math.sign(b.y - a.y) };
    for (let k = 0; k < len; k++) {
      const p = { x: a.x + t.x * k, y: a.y + t.y * k };
      // Inward is to the right of the way round; the cell beyond lies half a cell the other way from the unit's middle.
      const out = { x: t.y, y: -t.x };
      const beyond = cellKey(Math.floor(p.x + t.x / 2 + out.x / 2), Math.floor(p.y + t.y / 2 + out.y / 2));
      units.push({ p, t, d: house.has(beyond) ? INNER_WALL / 2 : OUTER_WALL / 2 });
    }
  });
  const runs: { p: Vec; t: Vec; d: number }[] = [];
  for (const u of units) {
    const last = runs[runs.length - 1];
    if (last && last.t.x === u.t.x && last.t.y === u.t.y && last.d === u.d) continue;
    runs.push(u);
  }
  const first = runs[0];
  const lastRun = runs[runs.length - 1];
  if (runs.length > 1 && first && lastRun && first.t.x === lastRun.t.x && first.t.y === lastRun.t.y && first.d === lastRun.d) runs.shift();
  const offset = (r: { p: Vec; t: Vec; d: number }): number => (r.t.y === 0 ? r.p.y + -r.t.x * -r.d : r.p.x + -r.t.y * r.d);
  const out: Vec[] = [];
  runs.forEach((r, i) => {
    const next = runs[(i + 1) % runs.length]!;
    if (r.t.x === next.t.x && r.t.y === next.t.y) {
      const q = next.p;
      const n = { x: -r.t.y, y: r.t.x };
      out.push({ x: q.x + n.x * r.d, y: q.y + n.y * r.d }, { x: q.x + n.x * next.d, y: q.y + n.y * next.d });
      return;
    }
    out.push(r.t.y === 0 ? { x: offset(next), y: offset(r) } : { x: offset(r), y: offset(next) });
  });
  return out;
}

/** A house floor's shapes, worked out once: its cells, each room's floor, and every doorway's (a secret door's too). */
export interface HouseLayout {
  cells: ReadonlySet<string>;
  roomShapes: Map<number, FloorShape>;
  doorways: ReadonlyMap<DungeonDoor, RectShape>;
}

export function houseLayout(floor: Pick<DungeonFloor, 'rooms' | 'stacks'>, shown: ReadonlyMap<number, DungeonRoom>, doors: readonly DungeonDoor[]): HouseLayout {
  const cells = houseCells(floor);
  const roomShapes = new Map<number, FloorShape>([...shown.values()].map((room) => [room.id, houseRoomShape(room, cells)] as const));
  return { cells, roomShapes, doorways: new Map(doors.map((door) => [door, doorwayShape(door, shown, cells, roomShapes)] as const)) };
}

/** The line a door on an edge stands on: its two ends, from the first cell's side. */
export function doorEdge(door: Pick<DungeonDoor, 'x' | 'y' | 'dir' | 'wide'>): [Vec, Vec] {
  const b = cellsBox(doorCells(door));
  const [x0, x1, y0, y1] = [b.x, b.x + b.w, b.y, b.y + b.h];
  const { dir } = door;
  if (dir.y !== 0) {
    const y = dir.y > 0 ? y1 : y0;
    return [{ x: x0, y }, { x: x1, y }];
  }
  const x = dir.x > 0 ? x1 : x0;
  return [{ x, y: y0 }, { x, y: y1 }];
}

/**
 * A doorway's floor: a rectangle across its edge, through the wall to the floor of the room on each
 * side (past it by a hair, so the floors join), or to the wall's outer face where a side is outside;
 * along its edge never past either room's floor, so one as long as the side it is in leaves the
 * walls round the corners whole.
 */
export function doorwayShape(door: DungeonDoor, rooms: ReadonlyMap<number, DungeonRoom>, house: ReadonlySet<string>, roomShapes?: ReadonlyMap<number, FloorShape>): RectShape {
  const [a, b] = doorEdge(door);
  const vertical = door.dir.y !== 0;
  const shapes = [door.from, door.to].flatMap((id) => {
    const room = id === null ? undefined : rooms.get(id);
    return room ? [shapeBounds(roomShapes?.get(room.id) ?? houseRoomShape(room, house))] : [];
  });
  const lo = Math.max(vertical ? a.x : a.y, ...shapes.map((s) => (vertical ? s.minX : s.minY)));
  const hi = Math.min(vertical ? b.x : b.y, ...shapes.map((s) => (vertical ? s.maxX : s.maxY)));
  const reach = (id: number | null, side: CellDir): number => {
    const room = id === null ? undefined : rooms.get(id);
    return room ? sideInset(room, side, house) + OVERLAP : OUTER_WALL / 2;
  };
  const back = reach(door.from, door.dir);
  const on = reach(door.to, { x: -door.dir.x, y: -door.dir.y } as CellDir);
  if (vertical) {
    const top = door.dir.y > 0 ? a.y - back : a.y - on;
    return { kind: 'rect', x: lo, y: top, w: hi - lo, h: back + on };
  }
  const left = door.dir.x > 0 ? a.x - back : a.x - on;
  return { kind: 'rect', x: left, y: lo, w: back + on, h: hi - lo };
}

/** How far a door's outer face lies from its middle: half its cell, or a house's outer wall. */
export function mouthDepth(door: Pick<DungeonDoor, 'edge'>): number {
  return door.edge ? OUTER_WALL / 2 : 0.5;
}

/** A window's edge: where the glass stands, inset from the cell's corners, from one end to the other. */
export function windowSpan(window: Pick<DungeonWindow, 'x' | 'y' | 'dir' | 'size'>): [Vec, Vec] {
  const [a, b] = doorEdge({ x: window.x, y: window.y, dir: window.dir });
  const t = { x: b.x - a.x, y: b.y - a.y };
  const inset = WINDOW_INSET[window.size ?? 'facade'];
  return [
    { x: a.x + t.x * inset, y: a.y + t.y * inset },
    { x: b.x - t.x * inset, y: b.y - t.y * inset },
  ];
}

/** The ground a window's wall leaves open: across its span, from inside the floor's edge out past the wall by `beyond` cells. */
export function windowClearing(window: Pick<DungeonWindow, 'x' | 'y' | 'dir' | 'size'>, beyondWall: number): Vec[] {
  const [a, b] = windowSpan(window);
  const { dir } = window;
  const inner = OUTER_WALL / 2 + 0.02;
  const outer = OUTER_WALL / 2 + beyondWall;
  return [
    { x: a.x - dir.x * inner, y: a.y - dir.y * inner },
    { x: b.x - dir.x * inner, y: b.y - dir.y * inner },
    { x: b.x + dir.x * outer, y: b.y + dir.y * outer },
    { x: a.x + dir.x * outer, y: a.y + dir.y * outer },
  ];
}
