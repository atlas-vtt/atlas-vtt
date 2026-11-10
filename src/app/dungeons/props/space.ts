/**
 * The free floor of a room as furnishing sees it: what is already there (columns, props placed so
 * far) and what must stay clear (the cells before its doors, a stairwell and the row it is reached
 * from, the cells pieces already stand on). A disc is placed below a cell; a cell piece takes whole
 * cells (`occupyCells`); a wall piece hangs on its wall and needs only that. A room that is no
 * rectangle (a cave's chamber) names its floor cells (`cells`).
 */

import type { CellPoint, DungeonColumn } from '../model';
import type { RoomFrame } from './roomFrame';
import { onFloor } from './roomFrame';

/** A disc that is taken. */
export interface Taken {
  x: number;
  y: number;
  radius: number;
}

export interface RoomSpace {
  frame: RoomFrame;
  /** Cells to keep clear or already filled, as `x,y`; the space's own copy. */
  clear: Set<string>;
  taken: Taken[];
  /** The room's floor cells, as `x,y`, where it is no rectangle; unset, its rectangle. */
  cells?: ReadonlySet<string>;
}

export function roomSpace(frame: RoomFrame, clear: ReadonlySet<string>, columns: readonly DungeonColumn[], cells?: ReadonlySet<string>): RoomSpace {
  return { frame, clear: new Set(clear), taken: columns.map((c) => ({ x: c.x, y: c.y, radius: c.radius + 0.1 })), ...(cells && { cells }) };
}

/** Marks cells a cell piece stands on, so no disc is placed over them. */
export function occupyCells(space: RoomSpace, cells: readonly CellPoint[]): void {
  for (const c of cells) space.clear.add(`${c.x},${c.y}`);
}

/** Whether a point lies on the room's floor `margin` clear of its edge: in its rectangle or circle, and on its cells where it names them. */
function onRoomFloor(space: RoomSpace, p: CellPoint, margin: number): boolean {
  if (!onFloor(space.frame, p, margin)) return false;
  const { cells } = space;
  if (!cells) return true;
  for (const dx of [-margin, margin]) for (const dy of [-margin, margin]) if (!cells.has(`${Math.floor(p.x + dx)},${Math.floor(p.y + dy)}`)) return false;
  return true;
}

/** Whether a disc of `radius` around `p` overlaps the cell (x, y). */
function overlapsCell(p: CellPoint, radius: number, x: number, y: number): boolean {
  const dx = Math.max(x - p.x, 0, p.x - (x + 1));
  const dy = Math.max(y - p.y, 0, p.y - (y + 1));
  return dx * dx + dy * dy < radius * radius;
}

/** Whether a disc of `radius` around `p` lies on the floor, off every cell to keep clear and everything taken. */
export function isFree(space: RoomSpace, p: CellPoint, radius: number, margin = radius): boolean {
  if (!onRoomFloor(space, p, margin)) return false;
  for (let y = Math.floor(p.y - radius); y <= Math.floor(p.y + radius); y++) {
    for (let x = Math.floor(p.x - radius); x <= Math.floor(p.x + radius); x++) {
      if (space.clear.has(`${x},${y}`) && overlapsCell(p, radius, x, y)) return false;
    }
  }
  return space.taken.every((t) => Math.hypot(t.x - p.x, t.y - p.y) >= t.radius + radius);
}

export function take(space: RoomSpace, p: CellPoint, radius: number): void {
  space.taken.push({ x: p.x, y: p.y, radius });
}
