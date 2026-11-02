/**
 * Doors in a room's outer wall, such as a second entrance. Such a door needs a wall cell no other
 * room uses and open ground outside it that leads away from the dungeon (not rock the rooms close
 * in on), clear of the ground before the first entrance.
 */

import type { CellDir, CellPoint } from '../model';
import { dir, inRect, rectsTouch } from '../geometry';
import { type WorkLayout, type WorkRoom, localCell, roomRect } from './workLayout';

export interface OuterCell {
  cell: CellPoint;
  /** From the room out. */
  out: CellDir;
}


/** The open ground round a dungeon: whether a cell lies on it, how many rooms' rectangles cover a cell, and whether a door stands on it or beside it. */
export interface OpenGround {
  has(x: number, y: number): boolean;
  covers(x: number, y: number): number;
  byDoor(x: number, y: number): boolean;
}

/**
 * The cells outside every room that reach past the dungeon's bounds: the open ground around it.
 * Flooded over a grid of the dungeon's box, not a set of cell keys: every attempt at an entry
 * floor asks it, and a cave's box holds thousands of cells.
 */
export function openGround(layout: WorkLayout): OpenGround {
  const rects = layout.rooms.filter((room) => !room.removed).map(roomRect);
  const x0 = Math.min(...rects.map((r) => r.x0)) - 1;
  const y0 = Math.min(...rects.map((r) => r.y0)) - 1;
  const x1 = Math.max(...rects.map((r) => r.x1)) + 1;
  const y1 = Math.max(...rects.map((r) => r.y1)) + 1;
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  // 1 covered by a room, 2 open ground.
  const cells = new Uint8Array(width * height);
  const cover = new Uint16Array(width * height);
  for (const r of rects) {
    for (let y = r.y0; y <= r.y1; y++) {
      for (let at = (y - y0) * width + (r.x0 - x0), end = at + r.x1 - r.x0; at <= end; at++) {
        cells[at] = 1;
        cover[at] = (cover[at] ?? 0) + 1;
      }
    }
  }
  const queue = new Int32Array(width * height);
  let tail = 0;
  const visit = (at: number): void => {
    if (cells[at] !== 0) return;
    cells[at] = 2;
    queue[tail++] = at;
  };
  visit(0);
  for (let head = 0; head < tail; head++) {
    const at = queue[head] as number;
    const x = at % width;
    if (x > 0) visit(at - 1);
    if (x < width - 1) visit(at + 1);
    if (at >= width) visit(at - width);
    if (at < width * (height - 1)) visit(at + width);
  }
  const doorKeys = new Set(layout.doors.map((door) => `${door.x},${door.y}`));
  const inside = (x: number, y: number): boolean => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  return {
    byDoor: (x, y) => doorKeys.has(`${x},${y}`) || doorKeys.has(`${x + 1},${y}`) || doorKeys.has(`${x - 1},${y}`) || doorKeys.has(`${x},${y + 1}`) || doorKeys.has(`${x},${y - 1}`),
    has: (x, y) => inside(x, y) && cells[(y - y0) * width + (x - x0)] === 2,
    covers: (x, y) => (inside(x, y) ? (cover[(y - y0) * width + (x - x0)] ?? 0) : 0),
  };
}

function isFreeOuterCell(layout: WorkLayout, room: WorkRoom, cell: CellPoint, out: CellDir, ground: OpenGround): boolean {
  const outside = { x: cell.x + out.x, y: cell.y + out.y };
  // Open ground lies outside every room, so only the ground before the first entrance is left to keep clear of.
  if (!ground.has(outside.x, outside.y)) return false;
  const outsideRect = { x0: outside.x, y0: outside.y, x1: outside.x, y1: outside.y };
  if (layout.reserved && rectsTouch(outsideRect, layout.reserved)) return false;
  // Covered by a room besides this one: a wall it shares.
  const others = ground.covers(cell.x, cell.y) - (inRect(roomRect(room), cell.x, cell.y) ? 1 : 0);
  return others === 0 && !ground.byDoor(cell.x, cell.y);
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
export function freeOuterCells(layout: WorkLayout, room: WorkRoom, ground: OpenGround): OuterCell[] {
  return wallCells(room).filter(({ cell, out }) => isFreeOuterCell(layout, room, cell, out, ground));
}
