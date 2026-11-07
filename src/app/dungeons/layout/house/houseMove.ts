/**
 * Moving a planned house as a whole: mirrored east to west (an L's service wing on either side) and
 * shifted so the outside cell of its front door is (0, 0), the cell every dungeon's first entrance
 * stands in.
 */

import type { CellDir, CellPoint, DungeonDoor, DungeonRoom, DungeonStair } from '../../model';
import type { PlannedFloor } from '../../floors/planFloors';

/** Where a cell goes: `x` mirrored about `mirror` (the line x = mirror / 2) where given, then shifted. */
export interface HouseMove {
  mirror: number | null;
  shift: CellPoint;
}

const flipX = (d: CellDir): CellDir => ({ x: (0 - d.x) as CellDir['x'], y: d.y });

function cell(m: HouseMove, c: CellPoint): CellPoint {
  return { x: (m.mirror === null ? c.x : m.mirror - 1 - c.x) + m.shift.x, y: c.y + m.shift.y };
}

/** A point in continuous cells (a trunk, a column): mirrored about the line itself, not about a cell. */
function point(m: HouseMove, p: CellPoint): CellPoint {
  return { x: (m.mirror === null ? p.x : m.mirror - p.x) + m.shift.x, y: p.y + m.shift.y };
}

function rect<T extends { x: number; y: number; w: number }>(m: HouseMove, r: T): T {
  return { ...r, x: (m.mirror === null ? r.x : m.mirror - r.x - r.w) + m.shift.x, y: r.y + m.shift.y };
}

function dirOf(m: HouseMove, d: CellDir): CellDir {
  return m.mirror === null ? d : flipX(d);
}

function door(m: HouseMove, d: DungeonDoor): DungeonDoor {
  const at = cell(m, d);
  return { ...d, x: at.x, y: at.y, dir: dirOf(m, d.dir), ...(d.wide && { wide: dirOf(m, d.wide) }) };
}

function room(m: HouseMove, r: DungeonRoom): DungeonRoom {
  return { ...rect(m, r), axis: dirOf(m, r.axis), ...(r.cells && { cells: r.cells.map((c) => cell(m, c)) }) };
}

function stair(m: HouseMove, s: DungeonStair): DungeonStair {
  return { ...rect(m, s), down: dirOf(m, s.down) };
}

export function moveFloor(m: HouseMove, floor: PlannedFloor): PlannedFloor {
  const { house } = floor;
  return {
    rooms: floor.rooms.map((r) => room(m, r)),
    doors: floor.doors.map((d) => door(m, d)),
    stairs: floor.stairs.map((s) => stair(m, s)),
    ...(house && {
      house: {
        ...house,
        windows: house.windows.map((w) => ({ ...w, ...cell(m, w), dir: dirOf(m, w.dir) })),
        stacks: house.stacks.map((s) => rect(m, s)),
        ...(house.grounds && {
          grounds: {
            lot: rect(m, house.grounds.lot),
            pieces: house.grounds.pieces.map((p) => ({
              ...p,
              cells: p.cells.map((c) => cell(m, c)),
              ...(p.dir && { dir: dirOf(m, p.dir) }),
              ...(p.at && { at: point(m, p.at) }),
              ...(p.columns && { columns: p.columns.map((c) => point(m, c)) }),
              ...(p.door && { door: { ...cell(m, p.door), dir: dirOf(m, p.door.dir) } }),
            })),
          },
        }),
      },
    }),
  };
}
