/**
 * The layout while it is being built: rooms keep the door cell they grew from, their axis, and
 * their size with walls, so growing and trimming change one number. `compact.ts` turns it into
 * the model's floor rectangles once it is done.
 */

import type { CellDir, CellPoint, DoorKind, RoomKind, Wing } from '../model';
import { type CellRect, cellKey, perpendicular } from '../geometry';

export interface WorkRoom {
  id: number;
  /** The door cell in the near wall the room grew from. */
  origin: CellPoint;
  axis: CellDir;
  /** Walls included; odd, so the origin is centred. */
  width: number;
  /** Walls included, counted from the origin's row. */
  depth: number;
  group: number;
  parent: number | null;
  removed: boolean;
  wing: Wing;
  /** Rooms of one zone may be joined by ordinary doors: the regular rooms, each secret wing. */
  zone: number;
  rotunda: boolean;
  colonnade: boolean;
  /** Holds the landing of the stairs a floor grows from: it keeps its size and corners. */
  fixed: boolean;
  boss: boolean;
  /** A passage grown wider than a cell (`DungeonParams.passageFloor`): its kind, which its size alone would not tell. */
  passage?: PassageKind;
}

export type PassageKind = Exclude<RoomKind, 'room'>;

export interface WorkDoor {
  x: number;
  y: number;
  dir: CellDir;
  kind: DoorKind;
  from: number | null;
  to: number | null;
  descends?: true;
  /** Added by the loop pass, not part of the grown tree. */
  loop: boolean;
}

export interface WorkLayout {
  rooms: WorkRoom[];
  doors: WorkDoor[];
  /** Cells no room but the first may cover: the ground before the entrance. */
  reserved: CellRect | null;
  /** Where every room must lie, walls included: over or under the floor before, for every floor after the entrance floor. */
  within: CellRect | null;
  /** Floor cells no door may open onto: a stairwell's, and the cells it is reached from. */
  blocked: ReadonlySet<string>;
}

export const REGULAR_ZONE = 0;

/** Whether a door may stand here: neither of the floor cells it joins is blocked. */
export function doorMayOpen(layout: WorkLayout, cell: CellPoint, dir: CellDir): boolean {
  return !layout.blocked.has(cellKey(cell.x - dir.x, cell.y - dir.y)) && !layout.blocked.has(cellKey(cell.x + dir.x, cell.y + dir.y));
}

/** Cell at `i` along the axis and `j` across it, from the origin. */
export function localCell(room: Pick<WorkRoom, 'origin' | 'axis'>, i: number, j: number): CellPoint {
  const p = perpendicular(room.axis);
  return { x: room.origin.x + room.axis.x * i + p.x * j, y: room.origin.y + room.axis.y * i + p.y * j };
}

/** `cell` in the room's own coordinates: `i` along the axis, `j` across. */
export function toLocal(room: Pick<WorkRoom, 'origin' | 'axis'>, cell: CellPoint): { i: number; j: number } {
  const p = perpendicular(room.axis);
  const dx = cell.x - room.origin.x;
  const dy = cell.y - room.origin.y;
  return { i: dx * room.axis.x + dy * room.axis.y, j: dx * p.x + dy * p.y };
}

function rectThrough(a: CellPoint, b: CellPoint): CellRect {
  return { x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) };
}

export function roomRect(room: Pick<WorkRoom, 'origin' | 'axis' | 'width' | 'depth'>): CellRect {
  const half = (room.width - 1) / 2;
  return rectThrough(localCell(room, 0, -half), localCell(room, room.depth - 1, half));
}

export function floorOf(room: Pick<WorkRoom, 'origin' | 'axis' | 'width' | 'depth'>): CellRect {
  const half = (room.width - 3) / 2;
  return rectThrough(localCell(room, 1, -half), localCell(room, room.depth - 2, half));
}

export function kindOf(room: Pick<WorkRoom, 'width' | 'depth' | 'passage'>): RoomKind {
  if (room.passage) return room.passage;
  const across = room.width - 2;
  const along = room.depth - 2;
  if (across >= 2 && along >= 2) return 'room';
  return across === 1 && along === 1 ? 'junction' : 'corridor';
}

export function isNormal(room: Pick<WorkRoom, 'width' | 'depth' | 'passage'>): boolean {
  return kindOf(room) === 'room';
}

export function floorArea(room: Pick<WorkRoom, 'width' | 'depth'>): number {
  return (room.width - 2) * (room.depth - 2);
}

export function liveRooms(layout: WorkLayout): WorkRoom[] {
  return layout.rooms.filter((room) => !room.removed);
}

export function roomAt(layout: WorkLayout, id: number): WorkRoom {
  const room = layout.rooms[id];
  if (!room) throw new Error(`no room ${id}`);
  return room;
}

export function doorsOf(layout: WorkLayout, id: number): WorkDoor[] {
  return layout.doors.filter((door) => door.from === id || door.to === id);
}

/** Tree children: rooms grown from this one. */
export function childrenOf(layout: WorkLayout, id: number): WorkRoom[] {
  return layout.rooms.filter((room) => !room.removed && room.parent === id);
}

/** The room and everything grown from it. */
export function subtree(layout: WorkLayout, id: number): number[] {
  const children = new Map<number, number[]>();
  for (const room of layout.rooms) {
    if (room.removed || room.parent === null) continue;
    children.set(room.parent, [...(children.get(room.parent) ?? []), room.id]);
  }
  const out = [id];
  for (let k = 0; k < out.length; k++) out.push(...(children.get(out[k] as number) ?? []));
  return out;
}

/** The ids from the first room down to `id`. */
export function ancestry(layout: WorkLayout, id: number): number[] {
  const path: number[] = [];
  let at: number | null = id;
  while (at !== null) {
    path.unshift(at);
    at = roomAt(layout, at).parent;
  }
  return path;
}

/** The door the room grew through. */
export function treeDoorInto(layout: WorkLayout, id: number): WorkDoor | undefined {
  const parent = roomAt(layout, id).parent;
  return layout.doors.find((door) => door.to === id && door.from === parent && !door.loop);
}
