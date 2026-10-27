import { cellKey, doorCells, roomArea } from '../../../../src/app/dungeons/geometry';
import { floorBelow, levelOf, stackOf } from '../../../../src/app/dungeons/floors/floorStack';
import type { CellDir, DungeonDoor, DungeonFloor, DungeonModel, DungeonRoom, DungeonWindow } from '../../../../src/app/dungeons/model';
import { SIDES, houseKeys, owners } from './houseCells';

/**
 * How a house's windows are placed (report 2026-10-25-mansion-windows-research, rules W1–W9),
 * checked on a generated model alone, apart from the planner: each returns the problems it finds.
 */

const STORES = new Set(['storeroom', 'wine-cellar']);
const CLOSETS = new Set(['bathroom', 'dressing-room', 'servery']);
const GREAT = new Set(['ballroom', 'portrait-gallery', 'drawing-room', 'saloon', 'entrance-hall', 'landing']);
const SMALL_AREA = 8;

const keyOf = (w: Pick<DungeonWindow, 'x' | 'y' | 'dir'>): string => `${cellKey(w.x, w.y)}>${w.dir.x},${w.dir.y}`;
/** The edge a key names, back from `keyOf`. */
function edgeOf(key: string): Pick<DungeonWindow, 'x' | 'y' | 'dir'> {
  const [x, y, dx, dy] = key.split(/[,>]/).map(Number) as [number, number, number, number];
  return { x, y, dir: { x: dx, y: dy } as CellDir };
}
export const area = roomArea;
const along = (dir: CellDir): CellDir => ({ x: dir.y === 0 ? 0 : 1, y: dir.y === 0 ? 1 : 0 }) as CellDir;

/** Whether a room is too small or too humble for more than one window: a closet, a bathroom, a servery, a room of eight cells and less or two cells wide. */
export const isSmallRoom = (room: DungeonRoom): boolean => CLOSETS.has(room.type ?? '') || (room.kind === 'room' && (area(room) <= SMALL_AREA || Math.min(room.w, room.h) <= 2));
export const isStore = (room: DungeonRoom): boolean => STORES.has(room.type ?? '');
const isStairHall = (room: DungeonRoom): boolean => room.type === 'staircase-hall';
/** A main room: lived in, lit by right (not a corridor, stair hall, store or closet). */
const isMainRoom = (room: DungeonRoom): boolean => room.kind === 'room' && !isStore(room) && !isSmallRoom(room) && !isStairHall(room);

/** Every edge of a floor where a door stands, from either side. */
function doorEdgeKeys(doors: readonly DungeonDoor[]): Set<string> {
  return new Set(doors.flatMap((d) => doorCells(d).flatMap((c) => [keyOf({ ...c, dir: d.dir }), keyOf({ x: c.x + d.dir.x, y: c.y + d.dir.y, dir: { x: -d.dir.x, y: -d.dir.y } as CellDir })])));
}

/** A floor's outer walls: which room each outer edge belongs to, by key. */
function outerEdges(floor: DungeonFloor): Map<string, number> {
  const house = houseKeys(floor);
  const out = new Map<string, number>();
  for (const [key, id] of owners(floor)) {
    const [x, y] = key.split(',').map(Number) as [number, number];
    for (const s of SIDES) if (!house.has(cellKey(x + s.x, y + s.y))) out.set(keyOf({ x, y, dir: s }), id);
  }
  return out;
}

/** The run of a room's outer edges through `edge` along its wall: its cells' positions along the wall, in order. */
function runThrough(outer: ReadonlyMap<string, number>, edge: Pick<DungeonWindow, 'x' | 'y' | 'dir'>, room: number): { at: number; cells: number[] } {
  const t = along(edge.dir);
  const at = (n: number): Pick<DungeonWindow, 'x' | 'y' | 'dir'> => ({ x: edge.x + t.x * n, y: edge.y + t.y * n, dir: edge.dir });
  let lo = 0;
  let hi = 0;
  while (outer.get(keyOf(at(lo - 1))) === room) lo--;
  while (outer.get(keyOf(at(hi + 1))) === room) hi++;
  const base = t.x * edge.x + t.y * edge.y;
  return { at: base, cells: Array.from({ length: hi - lo + 1 }, (_, k) => base + lo + k) };
}

/** Whether a window may stand on `edge` of `room` by its wall alone: corners kept solid, a cell clear of cross walls on walls of three cells and more. */
function clearOfCorners(outer: ReadonlyMap<string, number>, edge: Pick<DungeonWindow, 'x' | 'y' | 'dir'>, room: number): string | null {
  const t = along(edge.dir);
  const sides = [-1, 1].map((n) => outer.get(keyOf({ x: edge.x + t.x * n, y: edge.y + t.y * n, dir: edge.dir })));
  if (sides.some((s) => s === undefined)) return 'at a corner';
  if (runThrough(outer, edge, room).cells.length >= 3 && sides.some((s) => s !== room)) return 'beside a cross wall';
  return null;
}

export const windowsOf = (floor: DungeonFloor): DungeonWindow[] => floor.windows ?? [];

/** The most windows a room may have on one wall `n` cells long: one per two cells beyond the corner cells, three at most (five in a great room). */
function windowCap(room: DungeonRoom, n: number): number {
  if (isStore(room)) return 0;
  if (isSmallRoom(room) || isStairHall(room)) return 1;
  return Math.max(1, Math.min(GREAT.has(room.type ?? '') ? 5 : 3, Math.ceil((n - 2) / 2)));
}

type Rule = (model: DungeonModel) => string[];

/** W1. A room's windows follow its kind and its wall's length: none in a store, one in a closet or a room of six cells, by length in the rest. */
export const windowsByRoom: Rule = (model) =>
  model.floors.flatMap((floor, i) => {
    const outer = outerEdges(floor);
    const out: string[] = [];
    for (const room of floor.rooms) {
      const own = windowsOf(floor).filter((w) => w.room === room.id);
      if (isStore(room) && own.length > 0) out.push(`floor ${i}: ${room.type} ${room.id} has ${own.length} windows`);
      if ((isSmallRoom(room) || isStairHall(room)) && own.length > 1) out.push(`floor ${i}: small room ${room.type} ${room.id} (${area(room)} cells) has ${own.length} windows`);
      const runs = new Map<string, number>();
      for (const w of own) {
        const run = runThrough(outer, w, room.id);
        const key = `${w.dir.x},${w.dir.y}@${run.at}:${run.cells[0]}`;
        runs.set(key, (runs.get(key) ?? 0) + 1);
        const n = run.cells.length;
        if ((runs.get(key) ?? 0) === windowCap(room, n) + 1) out.push(`floor ${i}: ${room.type ?? room.kind} ${room.id} has more than ${windowCap(room, n)} windows on a wall ${n} cells long`);
      }
    }
    return out;
  });

/** W1b. Every main room above ground with a wall of three cells or more outside has a window, or a glazed door to the outside (the hall's fanlight, the saloon's garden door). */
export const mainRoomsLit: Rule = (model) => {
  const stack = stackOf(model);
  return model.floors.flatMap((floor, i) => {
    if (levelOf(stack, i) < 0) return [];
    const outer = outerEdges(floor);
    return floor.rooms.flatMap((room) => {
      if (!isMainRoom(room) || windowsOf(floor).some((w) => w.room === room.id) || floor.doors.some((d) => d.from === null && d.to === room.id)) return [];
      const long = [...outer].some(([key, id]) => id === room.id && runThrough(outer, edgeOf(key), id).cells.length >= 3);
      return long ? [`floor ${i}: ${room.type} ${room.id} has an outer wall and no window`] : [];
    });
  });
};

/** W2. Windows stand only in outer walls, never on a door, never at a corner of the house, a cell clear of cross walls. */
export const windowsClearOfCorners: Rule = (model) =>
  model.floors.flatMap((floor, i) => {
    const outer = outerEdges(floor);
    const doors = doorEdgeKeys(floor.doors);
    return windowsOf(floor).flatMap((w) => {
      const key = keyOf(w);
      if (outer.get(key) !== w.room) return [`floor ${i}: window ${key} is in no outer wall of room ${w.room}`];
      if (doors.has(key)) return [`floor ${i}: window ${key} on a door`];
      const room = floor.rooms[w.room]!;
      // A corridor's end may be two cells wide: both take a window, side by side.
      const problem = room.kind === 'corridor' ? null : clearOfCorners(outer, w, w.room);
      return problem ? [`floor ${i}: window ${key} of ${room.type ?? room.kind} ${room.id} ${problem}`] : [];
    });
  });

/** W3. A corridor has windows only in its end walls. */
export const corridorsAtEnds: Rule = (model) =>
  model.floors.flatMap((floor, i) =>
    windowsOf(floor).flatMap((w) => {
      const room = floor.rooms[w.room]!;
      if (room.kind !== 'corridor') return [];
      const long = room.w >= room.h ? 'x' : 'y';
      return w.dir[long] === 0 ? [`floor ${i}: corridor ${room.id} (${room.w}×${room.h}) has a window in its side`] : [];
    }),
  );

/** W4. A stair hall has one tall window where it has an outer wall, and only a stair hall has one. */
export const stairHallTall: Rule = (model) => {
  const stack = stackOf(model);
  return model.floors.flatMap((floor, i) => {
    const outer = outerEdges(floor);
    const doors = doorEdgeKeys(floor.doors);
    const out: string[] = [];
    for (const w of windowsOf(floor)) if (w.size === 'tall' && !isStairHall(floor.rooms[w.room]!)) out.push(`floor ${i}: a tall window in ${floor.rooms[w.room]!.type}`);
    if (levelOf(stack, i) < 0) return out;
    for (const room of floor.rooms.filter(isStairHall)) {
      const own = windowsOf(floor).filter((w) => w.room === room.id);
      const free = [...outer].some(([key, id]) => id === room.id && takesWindow(outer, doors, key, id));
      if (free && (own.length !== 1 || own[0]!.size !== 'tall')) out.push(`floor ${i}: stair hall ${room.id} has ${own.length} windows, ${own.filter((w) => w.size === 'tall').length} tall`);
    }
    return out;
  });
};

/** W5. A cellar has a few small windows: one in each room that is no store, none in a store or a passage. */
export const cellarWindows: Rule = (model) => {
  const stack = stackOf(model);
  return model.floors.flatMap((floor, i) => {
    if (levelOf(stack, i) >= 0) return windowsOf(floor).filter((w) => w.size === 'small' && !isSmallRoom(floor.rooms[w.room]!)).map((w) => `floor ${i}: a small window ${keyOf(w)} in a ${floor.rooms[w.room]!.type}`);
    const out: string[] = [];
    for (const w of windowsOf(floor)) {
      const room = floor.rooms[w.room]!;
      if (w.size !== 'small') out.push(`floor ${i}: cellar window ${keyOf(w)} is not small`);
      if (room.kind !== 'room' || isStore(room) || isStairHall(room)) out.push(`floor ${i}: cellar window in ${room.type ?? room.kind}`);
    }
    for (const room of floor.rooms) if (windowsOf(floor).filter((w) => w.room === room.id).length > 1) out.push(`floor ${i}: cellar room ${room.id} has more than one window`);
    const outer = outerEdges(floor);
    const doors = doorEdgeKeys(floor.doors);
    const lit = floor.rooms.filter((r) => r.kind === 'room' && !isStore(r) && !isStairHall(r) && [...outer].some(([key, id]) => id === r.id && takesWindow(outer, doors, key, id)));
    if (lit.length > 0 && windowsOf(floor).length === 0) out.push(`floor ${i}: the cellar has no window`);
    return out;
  });
};

/** Whether the outer edge `key` of room `id` could hold a window: clear of corners, cross walls and doors. */
function takesWindow(outer: ReadonlyMap<string, number>, doors: ReadonlySet<string>, key: string, id: number): boolean {
  return clearOfCorners(outer, edgeOf(key), id) === null && !doors.has(key);
}

/** The line of the main front and its axis (twice the mirror's x) from the front door. */
export function mainFront(model: DungeonModel): { y: number; dir: CellDir; axis2: number } {
  const front = model.floors[0]!.doors[0]!;
  return { y: front.y + front.dir.y, dir: { x: 0, y: -front.dir.y } as CellDir, axis2: 2 * front.x + 1 + (front.wide ? front.wide.x : 0) };
}

/** Whether a floor's footprint mirrors about the axis: a wing that stops lower on one side leaves the floors above it lopsided. */
export function floorMirrors(floor: DungeonFloor, axis2: number): boolean {
  const keys = houseKeys(floor);
  return [...keys].every((k) => {
    const [x, y] = k.split(',').map(Number) as [number, number];
    return keys.has(cellKey(axis2 - 1 - x, y));
  });
}

/**
 * W6. In a house whose footprint mirrors, the main front's windows mirror about the front door on
 * every floor; a room whose every twin is refused (a store, a closet lit already, a cross wall) keeps
 * one window of its own.
 */
export const frontMirrors = (isMirrored: (m: DungeonModel) => boolean): Rule => (model) => {
  if (!isMirrored(model)) return [];
  const stack = stackOf(model);
  const { y, dir, axis2 } = mainFront(model);
  return model.floors.flatMap((floor, i) => {
    if (levelOf(stack, i) < 0 || !floorMirrors(floor, axis2)) return [];
    const outer = outerEdges(floor);
    const doors = doorEdgeKeys(floor.doors);
    const keys = new Set(windowsOf(floor).map(keyOf));
    return windowsOf(floor)
      .filter((w) => w.dir.x === dir.x && w.dir.y === dir.y && Math.abs(w.y - y) <= 1)
      .flatMap((w) => {
        const twin = { x: axis2 - 1 - w.x, y: w.y, dir: w.dir };
        if (keys.has(keyOf(twin))) return [];
        const lone = windowsOf(floor).filter((u) => u.room === w.room).length === 1;
        const id = outer.get(keyOf(twin));
        const room = id === undefined ? null : floor.rooms[id]!;
        const refused = !room || room.kind !== 'room' || isStore(room) || (isSmallRoom(room) && windowsOf(floor).some((u) => u.room === id)) || clearOfCorners(outer, twin, id!) !== null || doors.has(keyOf(twin));
        return lone && refused ? [] : [`floor ${i}: front window ${keyOf(w)} has no mirror`];
      });
  });
};

/**
 * W7. Windows stand over windows: a window over an outer wall of the floor below stands over a
 * window or a door there, unless the room below takes none there by its own rules (a store, a
 * closet with its one window, a passage, a stair hall, a corner or cross wall, a wall that has its
 * window, a side wall of a room lit from its front), or on a mirrored front its twin there is blind.
 */
export const windowsOverWindows = (isMirrored: (m: DungeonModel) => boolean): Rule => (model) => {
  const stack = stackOf(model);
  const axis2 = mainFront(model).axis2;
  const mirror = isMirrored(model);
  const out: string[] = [];
  model.floors.forEach((floor, i) => {
    const below = floorBelow(stack, i);
    if (below === null || levelOf(stack, i) <= 0) return;
    const under = model.floors[below]!;
    const outer = outerEdges(under);
    const windows = new Set(windowsOf(under).map(keyOf));
    const doors = doorEdgeKeys(under.doors);
    for (const w of windowsOf(floor)) {
      const key = keyOf(w);
      const id = outer.get(key);
      if (id === undefined || windows.has(key) || doors.has(key) || w.size === 'tall') continue;
      const room = under.rooms[id]!;
      const own = windowsOf(under).filter((u) => u.room === id);
      const run = runThrough(outer, w, id);
      const onRun = own.some((u) => u.dir.x === w.dir.x && u.dir.y === w.dir.y && runThrough(outer, u, id).cells[0] === run.cells[0]);
      const twin = keyOf({ x: axis2 - 1 - w.x, y: w.y, dir: w.dir });
      const blindTwin = mirror && w.dir.y !== 0 && outer.has(twin) && !windows.has(twin);
      const refuses = room.kind !== 'room' || isStore(room) || isStairHall(room) || (isSmallRoom(room) && own.length > 0) || clearOfCorners(outer, w, id) !== null || onRun || (w.dir.x !== 0 && own.length > 0) || blindTwin;
      if (!refuses) out.push(`floor ${i}: window ${key} over a blank wall of ${room.type} ${id}`);
    }
  });
  return out;
};

/** W8. Windows keep a pier between them: never two side by side but at a corridor's end or over an entrance two cells wide. */
export const piersBetween: Rule = (model) => {
  const ground = model.floors[0]!;
  // An entrance's column: its way out and its cells along the wall, on whatever row a floor's wall stands.
  const entrances = new Set(ground.doors.filter((d) => d.from === null).flatMap((d) => doorCells(d).map((c) => `${-d.dir.x},${-d.dir.y}@${d.dir.y !== 0 ? c.x : c.y}`)));
  const overEntrance = (w: Pick<DungeonWindow, 'x' | 'y' | 'dir'>): boolean => entrances.has(`${w.dir.x},${w.dir.y}@${w.dir.y !== 0 ? w.x : w.y}`);
  return model.floors.flatMap((floor, i) => {
    const keys = new Set(windowsOf(floor).map(keyOf));
    return windowsOf(floor).flatMap((w) => {
      const t = along(w.dir);
      const next = { x: w.x + t.x, y: w.y + t.y, dir: w.dir };
      if (!keys.has(keyOf(next))) return [];
      const corridor = w.room === windowsOf(floor).find((u) => keyOf(u) === keyOf(next))!.room && floor.rooms[w.room]!.kind === 'corridor';
      return corridor || (overEntrance(w) && overEntrance(next)) ? [] : [`floor ${i}: windows ${keyOf(w)} and the next side by side`];
    });
  });
};

/** W9. A room's windows on one wall are evenly spaced and stand about its middle, within half a bay of three cells. */
export const evenlySpaced: Rule = (model) =>
  model.floors.flatMap((floor, i) => {
    const outer = outerEdges(floor);
    const groups = new Map<string, { at: number[]; mid: number }>();
    for (const w of windowsOf(floor)) {
      if (w.size === 'tall') continue;
      const run = runThrough(outer, w, w.room);
      const t = along(w.dir);
      const key = `${w.room}:${w.dir.x},${w.dir.y}:${run.cells[0]}`;
      const g = groups.get(key) ?? { at: [], mid: (run.cells[0]! + run.cells[run.cells.length - 1]!) / 2 };
      g.at.push(t.x * w.x + t.y * w.y);
      groups.set(key, g);
    }
    return [...groups].flatMap(([key, { at, mid }]) => {
      const sorted = [...at].sort((p, q) => p - q);
      const gaps = sorted.slice(1).map((u, k) => u - sorted[k]!);
      const centre = (sorted[0]! + sorted[sorted.length - 1]!) / 2;
      const out: string[] = [];
      if (gaps.some((g) => g !== gaps[0])) out.push(`floor ${i}: windows of ${key} unevenly spaced (${sorted.join(',')})`);
      if (Math.abs(centre - mid) > 1.5) out.push(`floor ${i}: windows of ${key} stand ${Math.abs(centre - mid)} cells off the wall's middle`);
      return out;
    });
  });
