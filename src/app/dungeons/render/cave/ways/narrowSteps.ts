/**
 * The cells a narrow way's marks stand on, in order along it: the way's door cell, and every cell
 * of the passage it leads into (`DungeonRoom.narrow`), counted from that door, each with the frame
 * that runs along the passage there. A cell where the passage bends has no one way along it, so
 * no mark stands there.
 */

import type { NarrowWay } from '../../../caveModel';
import { cellKey, dir, doorCells, floorCellsOf } from '../../../geometry';
import type { CellDir, CellPoint, DungeonDoor, DungeonRoom } from '../../../model';
import type { Hand } from '../../art/hand';
import { type WayFrame, wayFrame } from './narrows';
import { pinchFrame } from './pinch';
import { doorsOfWay } from './wayDoors';

export interface NarrowStep {
  frame: WayFrame;
  /** How many cells along the way from its door: 0 on a door cell. */
  step: number;
}

const NEAR: readonly CellDir[] = [dir(1, 0), dir(-1, 0), dir(0, 1), dir(0, -1)];

/** The passage's cells walked from its door in, each with its step and, where it runs straight or ends, the way along it. */
function passageSteps(room: DungeonRoom, doors: readonly DungeonDoor[]): NarrowStep[] {
  const own = new Set(floorCellsOf(room).map((c) => cellKey(c.x, c.y)));
  const ways = doors.filter((door) => door.from === room.id || door.to === room.id).flatMap(doorCells);
  const open = new Set([...own, ...ways.map((c) => cellKey(c.x, c.y))]);
  const entered = doors.find((door) => door.to === room.id && door.from === room.parent && door.from !== null);
  if (!entered) return [];
  const steps = new Map<string, number>([[cellKey(entered.x, entered.y), 0]]);
  const queue: CellPoint[] = [{ x: entered.x, y: entered.y }];
  const out: NarrowStep[] = [];
  for (let head = 0; head < queue.length; head++) {
    const c = queue[head]!;
    const step = steps.get(cellKey(c.x, c.y))!;
    const near = NEAR.filter((d) => open.has(cellKey(c.x + d.x, c.y + d.y)));
    for (const d of near) {
      const n = { x: c.x + d.x, y: c.y + d.y };
      const key = cellKey(n.x, n.y);
      if (!own.has(key) || steps.has(key)) continue;
      steps.set(key, step + 1);
      queue.push(n);
    }
    if (head === 0) continue;
    const straight = near.length === 2 && near[0]!.x === -near[1]!.x && near[0]!.y === -near[1]!.y;
    const along = straight || near.length === 1 ? near[0] : undefined;
    if (along) out.push({ frame: wayFrame({ x: c.x, y: c.y, w: 1, h: 1 }, along), step });
  }
  return out;
}

/** Every cell a narrow way of `way` is marked on: its doors' cells, and its passages' cells. */
export function narrowSteps(hand: Hand, way: NarrowWay): NarrowStep[] {
  const { rooms, doors } = hand.scene.env.dungeon;
  const atDoors = doorsOfWay(hand, way)
    .filter((door) => door.from !== null && door.to !== null)
    .map((door) => ({ frame: pinchFrame(door), step: 0 }));
  return [...atDoors, ...rooms.filter((room) => room.narrow === way).flatMap((room) => passageSteps(room, doors))];
}
