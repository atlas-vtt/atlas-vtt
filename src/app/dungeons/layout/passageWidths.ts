/**
 * The widths of a Fortress's passages, fitted once its floor is laid. Its corridors and junctions
 * grow three cells across (`DungeonParams.passageFloor`), so the rooms beside them keep their
 * distance; then a passage on the main way stays three wide, any other gives up a side where none of
 * its doors stands and is two wide, and one a reason keeps narrow gives up both: a secret way, the
 * way in from a postern (the second entrance), a stair passage (steps). Where two passages open
 * into each other, the opening is two cells wide where both run on beside it, so no neck is left.
 */

import { type CellRect, cellKey, cellsOf, dir, floorRect, inRect, perpendicular } from '../geometry';
import type { CellDir, DungeonDoor, DungeonRoom } from '../model';
import { hops, neighbours, openDoor, shortestPath } from '../roomGraph';
import type { CompactLayout } from './compact';

const back = (d: CellDir): CellDir => dir(-d.x, -d.y);

const isPassage = (room: DungeonRoom | undefined): boolean => room !== undefined && room.kind !== 'room';

const toRoom = (room: DungeonRoom, r: CellRect): DungeonRoom => ({ ...room, x: r.x0, y: r.y0, w: r.x1 - r.x0 + 1, h: r.y1 - r.y0 + 1 });

/** Passages a reason keeps one cell wide: in a secret wing, behind a secret door or steps, or the way in from a postern. */
function keptNarrow(layout: CompactLayout): Set<number> {
  const narrow = new Set(layout.rooms.filter((room) => room.wing === 'secret').map((room) => room.id));
  const entrance = layout.doors.find((door) => door.from === null);
  for (const door of layout.doors) {
    const postern = door.from === null && door !== entrance;
    if (door.kind !== 'secret' && door.kind !== 'steps' && !postern) continue;
    for (const id of [door.from, door.to]) if (id !== null) narrow.add(id);
  }
  return narrow;
}

/** The rooms of the main way, from the first room through every door but secret ones to the boss room, else the farthest normal room. */
function mainWay(layout: CompactLayout): Set<number> {
  const adjacent = neighbours(layout.rooms.length, layout.doors, openDoor);
  const far = hops(adjacent, 0);
  const reached = layout.rooms.filter((room) => room.kind === 'room' && Number.isFinite(far[room.id]));
  const farthest = reached.reduce<number | undefined>((best, room) => (best === undefined || far[room.id]! > far[best]! ? room.id : best), undefined);
  return new Set(shortestPath(adjacent, 0, layout.rooms.find((room) => room.boss)?.id ?? farthest ?? 0));
}

/** The floor without its outermost row or column on `side`. */
function without(r: CellRect, side: CellDir): CellRect {
  if (side.x > 0) return { ...r, x1: r.x1 - 1 };
  if (side.x < 0) return { ...r, x0: r.x0 + 1 };
  if (side.y > 0) return { ...r, y1: r.y1 - 1 };
  return { ...r, y0: r.y0 + 1 };
}

/** Whether a door cell lies in a wall of the floor's cells, orthogonally beside one of them. */
function touches(r: CellRect, door: DungeonDoor): boolean {
  return inRect({ ...r, y0: r.y0 - 1, y1: r.y1 + 1 }, door.x, door.y) || inRect({ ...r, x0: r.x0 - 1, x1: r.x1 + 1 }, door.x, door.y);
}

/** The axes a passage runs across: a corridor's one, square to the way it grew, both of a junction's. */
function acrossAxes(room: DungeonRoom): CellDir[] {
  if (room.kind === 'junction') return [dir(1, 0), dir(0, 1)];
  return [perpendicular(room.axis).x !== 0 ? dir(1, 0) : dir(0, 1)];
}

/** The passage given up to `drop` sides on each axis it runs across, the side farther from the floor's middle first, never one a door stands against. */
function narrowed(room: DungeonRoom, doors: readonly DungeonDoor[], drop: number, middle: { x: number; y: number }): DungeonRoom {
  const own = doors.filter((door) => door.from === room.id || door.to === room.id);
  let r = floorRect(room);
  for (const axis of acrossAxes(room)) {
    const centre = axis.x !== 0 ? (r.x0 + r.x1 + 1) / 2 : (r.y0 + r.y1 + 1) / 2;
    const towards = (axis.x !== 0 ? middle.x : middle.y) >= centre ? axis : back(axis);
    let left = drop;
    for (const side of [back(towards), towards]) {
      const extent = axis.x !== 0 ? r.x1 - r.x0 + 1 : r.y1 - r.y0 + 1;
      if (left === 0 || extent === 1) break;
      const kept = without(r, side);
      // A door only the dropped row or column reached would be cut off.
      if (own.some((door) => !touches(kept, door))) continue;
      r = kept;
      left -= 1;
    }
  }
  return toRoom(room, r);
}

/** An opening between two passages, two cells wide where the cell beside it is wall between both passages' floors and no door. */
function widenOpening(door: DungeonDoor, rooms: readonly DungeonRoom[], owner: ReadonlyMap<string, number>, doorAt: Map<string, DungeonDoor>): DungeonDoor {
  if (door.kind !== 'opening' || door.from === null || door.to === null) return door;
  if (!isPassage(rooms[door.from]) || !isPassage(rooms[door.to])) return door;
  const p = perpendicular(door.dir);
  for (const side of [p, back(p)]) {
    const x = door.x + side.x;
    const y = door.y + side.y;
    if (owner.has(cellKey(x, y)) || doorAt.has(cellKey(x, y))) continue;
    if (owner.get(cellKey(x - door.dir.x, y - door.dir.y)) !== door.from || owner.get(cellKey(x + door.dir.x, y + door.dir.y)) !== door.to) continue;
    const wide = { ...door, wide: side };
    doorAt.set(cellKey(x, y), wide);
    return wide;
  }
  return door;
}

/** The layout with its passages fitted (see the file's comment); rooms keep their ids and kinds. */
export function fitPassages(layout: CompactLayout): CompactLayout {
  const narrow = keptNarrow(layout);
  const main = mainWay(layout);
  const xs = layout.rooms.flatMap((room) => [room.x, room.x + room.w]);
  const ys = layout.rooms.flatMap((room) => [room.y, room.y + room.h]);
  const middle = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const rooms = layout.rooms.map((room) => {
    if (!isPassage(room) || main.has(room.id)) return room;
    return narrowed(room, layout.doors, narrow.has(room.id) ? 2 : 1, middle);
  });
  const owner = new Map(rooms.flatMap((room) => cellsOf(floorRect(room)).map((c) => [cellKey(c.x, c.y), room.id] as const)));
  const doorAt = new Map(layout.doors.map((door) => [cellKey(door.x, door.y), door]));
  return { rooms, doors: layout.doors.map((door) => widenOpening(door, rooms, owner, doorAt)) };
}
