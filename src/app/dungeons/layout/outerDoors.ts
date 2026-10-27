/**
 * Doors in a room's outer wall, such as a second entrance. Such a door needs a wall cell no other
 * room uses and open ground outside it that leads away from the dungeon (not rock the rooms close
 * in on), clear of the ground before the first entrance.
 */

import type { CellDir, CellPoint } from '../model';
import { cellKey, dir, inRect, rectsTouch } from '../geometry';
import { type WorkLayout, type WorkRoom, localCell, roomRect } from './workLayout';

export interface OuterCell {
  cell: CellPoint;
  /** From the room out. */
  out: CellDir;
}

function covered(layout: WorkLayout, cell: CellPoint, except: number): boolean {
  return layout.rooms.some((room) => !room.removed && room.id !== except && inRect(roomRect(room), cell.x, cell.y));
}

function isDoorCell(layout: WorkLayout, cell: CellPoint): boolean {
  return layout.doors.some((door) => door.x === cell.x && door.y === cell.y);
}

function nearDoor(layout: WorkLayout, cell: CellPoint): boolean {
  return layout.doors.some((door) => Math.abs(door.x - cell.x) + Math.abs(door.y - cell.y) <= 1);
}

/** The cells outside every room that reach past the dungeon's bounds: the open ground around it. */
export function openGround(layout: WorkLayout): ReadonlySet<string> {
  const rects = layout.rooms.filter((room) => !room.removed).map(roomRect);
  const x0 = Math.min(...rects.map((r) => r.x0)) - 1;
  const y0 = Math.min(...rects.map((r) => r.y0)) - 1;
  const x1 = Math.max(...rects.map((r) => r.x1)) + 1;
  const y1 = Math.max(...rects.map((r) => r.y1)) + 1;
  const covered = new Set<string>();
  for (const r of rects) for (let y = r.y0; y <= r.y1; y++) for (let x = r.x0; x <= r.x1; x++) covered.add(cellKey(x, y));
  const open = new Set([cellKey(x0, y0)]);
  const queue: CellPoint[] = [{ x: x0, y: y0 }];
  for (let head = 0; head < queue.length; head++) {
    const at = queue[head] as CellPoint;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const next = { x: at.x + dx, y: at.y + dy };
      const key = cellKey(next.x, next.y);
      if (next.x < x0 || next.x > x1 || next.y < y0 || next.y > y1 || covered.has(key) || open.has(key)) continue;
      open.add(key);
      queue.push(next);
    }
  }
  return open;
}

function isFreeOuterCell(layout: WorkLayout, room: WorkRoom, cell: CellPoint, out: CellDir, ground: ReadonlySet<string>): boolean {
  const outside = { x: cell.x + out.x, y: cell.y + out.y };
  if (!ground.has(cellKey(outside.x, outside.y))) return false;
  const outsideRect = { x0: outside.x, y0: outside.y, x1: outside.x, y1: outside.y };
  if ((layout.reserved && rectsTouch(outsideRect, layout.reserved)) || covered(layout, outside, -1)) return false;
  return !covered(layout, cell, room.id) && !isDoorCell(layout, cell) && !nearDoor(layout, cell);
}

/** Every wall cell of the room, corners left out, with the way out of the room there. */
function wallCells(room: WorkRoom): OuterCell[] {
  const cells: OuterCell[] = [];
  const half = (room.width - 1) / 2;
  const back = localCell(room, 1, 0);
  const front = localCell(room, 0, 0);
  const forward = dir(back.x - front.x, back.y - front.y);
  for (let j = -half + 1; j <= half - 1; j++) cells.push({ cell: localCell(room, room.depth - 1, j), out: forward });
  for (let i = 1; i <= room.depth - 2; i++) {
    for (const side of [-1, 1]) {
      const cell = localCell(room, i, side * half);
      const inner = localCell(room, i, side * (half - 1));
      cells.push({ cell, out: dir(cell.x - inner.x, cell.y - inner.y) });
    }
  }
  for (let j = -half + 1; j <= half - 1; j++) cells.push({ cell: localCell(room, 0, j), out: dir(-forward.x, -forward.y) });
  return cells;
}

/** The room's wall cells a door to the open ground around the dungeon may stand in (`openGround`). */
export function freeOuterCells(layout: WorkLayout, room: WorkRoom, ground: ReadonlySet<string>): OuterCell[] {
  return wallCells(room).filter(({ cell, out }) => isFreeOuterCell(layout, room, cell, out, ground));
}
