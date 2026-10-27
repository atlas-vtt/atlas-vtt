/**
 * Grows a floor's room tree breadth first from its first room: the room behind the entrance, or
 * on every later floor the room around the landing of the stairs from the floor before. Every queued room
 * draws from a stream of its own seed, so two rooms queued with one seed grow the same subtree.
 */

import type { CellDir, CellPoint } from '../model';
import type { DungeonParams } from '../params';
import { type CellRect, contains, rectsClash, rectsTouch } from '../geometry';
import type { KeyedRng } from '../rng';
import { type Branch, branchesOf } from './branches';
import { type RoomSize, drawDoorKind, drawSize } from './sizes';
import { REGULAR_ZONE, type WorkLayout, type WorkRoom, doorMayOpen, isNormal, roomAt, roomRect } from './workLayout';

/** Corridors do not count towards size; this keeps a corridor maze from growing forever. */
const MAX_TOTAL_ROOMS = 400;

/** Where a floor's first room stands, and on a floor below the entry its size, fixed by the landing. */
export interface FloorRoot {
  origin: CellPoint;
  axis: CellDir;
  seed: number;
  /** The room holds the landing of the stairs from above: no door leads in, and it keeps this size. */
  landing?: RoomSize;
  /** The least depth of the first room, walls included, where it is a normal room: a gate passage long enough to hold murder holes. */
  minDepth?: number;
}

interface QueuedRoom {
  parent: number | null;
  origin: CellPoint;
  axis: CellDir;
  flip: boolean;
  seed: number;
  group: number;
  fallbacks: Branch[];
}

/** Whether a room of this shape may stand here: walls may be shared, floors never, and the reserved ground stays clear. */
export function roomFits(layout: WorkLayout, rect: CellRect, ignore: ReadonlySet<number>, first: boolean): boolean {
  if (!first && layout.reserved && rectsTouch(rect, layout.reserved)) return false;
  if (layout.within && !contains(layout.within, rect)) return false;
  return layout.rooms.every((room) => room.removed || ignore.has(room.id) || !rectsClash(rect, roomRect(room)));
}

export function normalCount(layout: WorkLayout): number {
  return layout.rooms.filter((room) => !room.removed && isNormal(room)).length;
}

function newRoom(layout: WorkLayout, item: QueuedRoom, size: RoomSize, fixed: boolean): WorkRoom {
  return {
    id: layout.rooms.length,
    origin: item.origin,
    axis: item.axis,
    width: size.width,
    depth: size.depth,
    group: item.group,
    parent: item.parent,
    removed: false,
    wing: 'regular',
    zone: REGULAR_ZONE,
    rotunda: false,
    colonnade: false,
    fixed,
    boss: false,
    ...(size.passage && { passage: size.passage }),
  };
}

/**
 * The tree grown from `root` until the params' most rooms. On the entry floor (`reserved` set) the
 * first room is entered by an opening from the outside at its origin; a landing has no way in.
 */
export function growTree(rngOf: KeyedRng, params: DungeonParams, root: FloorRoot, base: Pick<WorkLayout, 'reserved' | 'within' | 'blocked'>): WorkLayout {
  const layout: WorkLayout = { rooms: [], doors: [], ...base };
  const queue: QueuedRoom[] = [{ parent: null, origin: root.origin, axis: root.axis, flip: false, seed: root.seed, group: 0, fallbacks: [] }];
  let groups = 1;
  let normals = 0;
  for (let head = 0; head < queue.length; head++) {
    if (normals >= params.maxRooms || layout.rooms.length >= MAX_TOTAL_ROOMS) break;
    const item = queue[head] as QueuedRoom;
    const first = item.parent === null;
    const rng = rngOf(item.seed);
    const drawn = first && root.landing ? root.landing : drawSize(rng, params);
    const size = first && root.minDepth !== undefined && isNormal(drawn) ? { ...drawn, depth: Math.max(drawn.depth, root.minDepth) } : drawn;
    const room = newRoom(layout, item, size, first && root.landing !== undefined);
    const fits = first || (roomFits(layout, roomRect(room), new Set(), false) && doorMayOpen(layout, item.origin, item.axis));
    if (!fits) {
      const [next, ...rest] = item.fallbacks;
      if (next) queue.push({ ...next, fallbacks: rest, parent: item.parent, group: item.group });
      continue;
    }
    layout.rooms.push(room);
    if (item.parent !== null) {
      const parent = roomAt(layout, item.parent);
      layout.doors.push({ x: item.origin.x, y: item.origin.y, dir: item.axis, kind: drawDoorKind(rng, !isNormal(parent) && !isNormal(room)), from: item.parent, to: room.id, loop: false });
    } else if (!root.landing) {
      layout.doors.push({ x: item.origin.x, y: item.origin.y, dir: item.axis, kind: 'opening', from: null, to: room.id, loop: false });
    }
    if (isNormal(room)) normals++;
    for (const group of branchesOf(rng, room, item.flip, params)) {
      const id = groups++;
      group.forEach((branch) => queue.push({ ...branch, parent: room.id, group: id }));
    }
  }
  return layout;
}
