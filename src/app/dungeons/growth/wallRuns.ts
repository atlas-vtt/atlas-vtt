/**
 * The stretches of a room's wall a climber may grow along: the floor's edge, every quarter of a
 * cell round the room (a round room's circle too), broken wherever the cell it would hang over is
 * barred (a doorway's approach, a stairwell, a hole) and at every doorway, a little clear of its jambs.
 */

import { doorCells, doorMiddle } from '../geometry';
import type { CellPoint, DungeonDoor, DungeonRoom } from '../model';
import { traceLoops } from '../water/contour';
import { cellMask } from '../water/wetGrid';
import type { GrowthSpace } from './growthSpace';

/** Between two points of a run, in cells. */
export const RUN_STEP = 0.25;
/** How far into the room a climber hangs, in cells: the cell there is the one it grows over. */
export const HANG = 0.3;
/** How far a run keeps from a doorway's cell, in cells. */
const DOOR_CLEARANCE = 0.2;

type EdgePoint = { at: CellPoint; inward: CellPoint };

/** Along a closed ring of corners, clockwise on screen, every `RUN_STEP`, the room to the right of the way round. */
function alongRing(corners: readonly CellPoint[]): EdgePoint[] {
  const out: EdgePoint[] = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % corners.length]!;
    const prev = corners[(i - 1 + corners.length) % corners.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.round(len / RUN_STEP);
    const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const n = { x: -t.y, y: t.x };
    // At a corner the climber hangs into the corner's cell, along both walls.
    const before = { x: -(a.y - prev.y) / Math.hypot(a.x - prev.x, a.y - prev.y), y: (a.x - prev.x) / Math.hypot(a.x - prev.x, a.y - prev.y) };
    const corner = { x: (n.x + before.x) * Math.SQRT1_2, y: (n.y + before.y) * Math.SQRT1_2 };
    for (let k = 0; k < steps; k++) out.push({ at: { x: a.x + t.x * k * RUN_STEP, y: a.y + t.y * k * RUN_STEP }, inward: k === 0 ? corner : n });
  });
  return out;
}

/** The floor's edge round a room, closed, with its inward normal at every point; of a cave's room, every ring its cells have. */
function edgeOf(room: DungeonRoom): EdgePoint[] {
  const cx = room.x + room.w / 2;
  const cy = room.y + room.h / 2;
  if (room.cells) {
    const { grid, marks } = cellMask(room.cells);
    return traceLoops(grid, marks).flatMap(alongRing);
  }
  if (room.rotunda) {
    const r = Math.sqrt(room.w * room.w + 1) / 2;
    const n = Math.max(8, Math.round((Math.PI * 2 * r) / RUN_STEP));
    return Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2;
      return { at: { x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }, inward: { x: -Math.cos(a), y: -Math.sin(a) } };
    });
  }
  const corners = [{ x: room.x, y: room.y }, { x: room.x + room.w, y: room.y }, { x: room.x + room.w, y: room.y + room.h }, { x: room.x, y: room.y + room.h }];
  const out: { at: CellPoint; inward: CellPoint }[] = [];
  corners.forEach((a, i) => {
    const b = corners[(i + 1) % 4]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.round(len / RUN_STEP);
    const t = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    // Clockwise on screen, the room lies to the right of the way round.
    const n = { x: -t.y, y: t.x };
    for (let k = 0; k < steps; k++) {
      const at = { x: a.x + t.x * k * RUN_STEP, y: a.y + t.y * k * RUN_STEP };
      // At a corner the climber hangs into the corner's cell, along both walls.
      out.push({ at, inward: k === 0 ? { x: Math.sign(cx - at.x) * Math.SQRT1_2, y: Math.sign(cy - at.y) * Math.SQRT1_2 } : n });
    }
  });
  return out;
}

/** Distance from a point to a door's cell, or to the edge a door on an edge stands on. */
function toDoor(p: CellPoint, door: DungeonDoor): number {
  if (door.edge) {
    const m = doorMiddle(door);
    const along = Math.abs((p.x - m.x) * door.dir.y + (p.y - m.y) * door.dir.x);
    const across = Math.abs((p.x - m.x) * door.dir.x + (p.y - m.y) * door.dir.y);
    return Math.hypot(Math.max(along - doorCells(door).length / 2, 0), across);
  }
  const dx = Math.max(door.x - p.x, 0, p.x - (door.x + 1));
  const dy = Math.max(door.y - p.y, 0, p.y - (door.y + 1));
  return Math.hypot(dx, dy);
}

/** The cell a climber hangs over at a point of the edge. */
export function hangCell(at: CellPoint, inward: CellPoint): CellPoint {
  return { x: Math.floor(at.x + inward.x * HANG), y: Math.floor(at.y + inward.y * HANG) };
}

export interface WallRun {
  points: CellPoint[];
  /** The cell hung over at each point. */
  cells: CellPoint[];
}

/** The runs of `room`'s wall a climber may take, at least `least` points long, in order round the room. */
export function wallRuns(room: DungeonRoom, doors: readonly DungeonDoor[], space: GrowthSpace, least = 4): WallRun[] {
  const edge = edgeOf(room);
  const ways = doors.filter((d) => d.kind !== 'secret');
  const open = edge.map(({ at, inward }) => space.forClimber(hangCell(at, inward)) && ways.every((door) => toDoor(at, door) > DOOR_CLEARANCE));
  const n = edge.length;
  // Start the walk at a barred point, so a run is never cut where the ring closes.
  const start = open.indexOf(false);
  if (start < 0) return [toRun(edge)];
  const runs: WallRun[] = [];
  let current: typeof edge = [];
  for (let k = 1; k <= n; k++) {
    const i = (start + k) % n;
    if (open[i]) current.push(edge[i]!);
    else {
      if (current.length >= least) runs.push(toRun(current));
      current = [];
    }
  }
  return runs;
}

function toRun(points: readonly { at: CellPoint; inward: CellPoint }[]): WallRun {
  return { points: points.map((p) => p.at), cells: points.map((p) => hangCell(p.at, p.inward)) };
}
