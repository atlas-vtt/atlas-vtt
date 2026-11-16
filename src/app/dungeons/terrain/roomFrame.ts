/**
 * A room's own frame and the small tests its cells are read by: the sides of a room as seen from
 * the wall it was entered by, whether a cell lies inside a round room's circle or by a column, and
 * the key of a cell's edge. Kept apart from `RoomCells`, which holds what a room's cells are.
 */

import type { CellDir, CellPoint, DungeonColumn, DungeonRoom } from '../model';
import { cellKey, dir } from '../geometry';

/** A side of the room in its own frame: the far wall, the wall it was entered by, and the two across. */
export type WallSide = 'back' | 'left' | 'right' | 'near';
export const WALL_SIDES: readonly WallSide[] = ['back', 'left', 'right', 'near'];

/** The way out of a room through `side`, for a room facing `axis` with `across` to its right. */
export function sideBeyond(axis: CellDir, across: CellDir, side: WallSide): CellDir {
  switch (side) {
    case 'back':
      return axis;
    case 'near':
      return dir(-axis.x, -axis.y);
    case 'right':
      return across;
    case 'left':
      return dir(-across.x, -across.y);
  }
}

/** Whether the points of the cell at `at` (0 a corner, 0.5 its middle) lie `margin` inside the circle of a round room; any cell of a room that is not round. */
export function insideRound(room: Pick<DungeonRoom, 'x' | 'y' | 'w' | 'h' | 'rotunda'>, c: CellPoint, at: readonly number[], margin: number): boolean {
  if (!room.rotunda) return true;
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  const r = Math.sqrt(room.w * room.w + 1) / 2 - margin;
  return at.every((dx) => at.every((dy) => Math.hypot(c.x + dx - cx, c.y + dy - cy) <= r));
}

/** Whether a column stands on or touches the cell. */
export function touches(column: DungeonColumn, c: CellPoint): boolean {
  const dx = Math.max(c.x - column.x, 0, column.x - (c.x + 1));
  const dy = Math.max(c.y - column.y, 0, column.y - (c.y + 1));
  return Math.hypot(dx, dy) < column.radius + 0.05;
}

/** The edge of cell `c` towards `d`, as a key. */
export function edgeSlot(c: CellPoint, d: CellPoint): string {
  return `${cellKey(c.x, c.y)}>${d.x},${d.y}`;
}
