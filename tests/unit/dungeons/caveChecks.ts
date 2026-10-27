/**
 * Checks of a generated Cavern's geometry, written apart from the generator: each returns the
 * problems it finds, empty when sound. Token fit (no thin spurs, no corner pinches, a 3 × 3 block
 * in every chamber, the main path two cells wide), narrows between rooms, masks inside their
 * rooms, and chambers stretched along the cave's faults.
 */

import { cellKey, doorCells, floorRect, inRect } from '../../../src/app/dungeons/geometry';
import { CHAMBER_SWELL } from '../../../src/app/dungeons/layout/cavern/laneCells';
import { tunnelReach } from '../../../src/app/dungeons/layout/cavern/laneCells';
import type { CellPoint, DungeonFloor, DungeonModel, DungeonRoom, DungeonStair } from '../../../src/app/dungeons/model';

const key = (c: CellPoint): string => cellKey(c.x, c.y);
const NEAR4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The floor as the cave is drawn: every room's cells and the cells of every narrows (a crawl is rock). */
export function caveFloorCells(floor: DungeonFloor): Set<string> {
  const out = new Set<string>();
  for (const room of floor.rooms) for (const c of room.cells ?? []) out.add(key(c));
  for (const door of floor.doors) if (door.kind !== 'secret') for (const c of doorCells(door)) out.add(key(c));
  return out;
}

function stairCellsOf(stair: Pick<DungeonStair, 'x' | 'y' | 'w' | 'h'>): CellPoint[] {
  const out: CellPoint[] = [];
  for (let y = stair.y; y < stair.y + stair.h; y++) for (let x = stair.x; x < stair.x + stair.w; x++) out.push({ x, y });
  return out;
}

function hasBlock(cells: readonly CellPoint[]): boolean {
  const keys = new Set(cells.map(key));
  return cells.some((c) => [0, 1, 2].every((dx) => [0, 1, 2].every((dy) => keys.has(cellKey(c.x + dx, c.y + dy)))));
}

/** Whether 2 × 2 blocks of floor lead from a block holding one of `from` to one holding one of `to`. */
function wideWay(floor: ReadonlySet<string>, from: readonly CellPoint[], to: readonly CellPoint[]): boolean {
  const fits = (ax: number, ay: number): boolean => [0, 1].every((dx) => [0, 1].every((dy) => floor.has(cellKey(ax + dx, ay + dy))));
  const around = (cells: readonly CellPoint[]): string[] => cells.flatMap((c) => [[c.x - 1, c.y - 1], [c.x, c.y - 1], [c.x - 1, c.y], [c.x, c.y]].filter(([x, y]) => fits(x!, y!)).map(([x, y]) => cellKey(x!, y!)));
  const goals = new Set(around(to));
  const seen = new Set(around(from));
  const queue = [...seen];
  for (let head = 0; head < queue.length; head++) {
    if (goals.has(queue[head]!)) return true;
    const [ax, ay] = queue[head]!.split(',').map(Number) as [number, number];
    for (const [dx, dy] of NEAR4) {
      const k = cellKey(ax + dx, ay + dy);
      if (!seen.has(k) && fits(ax + dx, ay + dy)) {
        seen.add(k);
        queue.push(k);
      }
    }
  }
  return false;
}

/** Where the floor's main path begins and ends: the entrance or the stairwell from above, the stairwell down or the boss room. */
function laneEnds(model: DungeonModel, index: number): [CellPoint[], CellPoint[]] | null {
  const floor = model.floors[index]!;
  const first = (to: number): DungeonStair | undefined => floor.stairs.filter((s) => s.to === to).sort((a, b) => a.link - b.link)[0];
  const entrance = floor.doors.find((d) => d.from === null && d.kind !== 'secret');
  const above = index > 0 ? first(index - 1) : undefined;
  const from = above ? stairCellsOf(above) : entrance ? [{ x: entrance.x, y: entrance.y }] : [];
  const below = index < model.floors.length - 1 ? first(index + 1) : undefined;
  const boss = floor.rooms.find((room) => room.boss);
  const to = below ? stairCellsOf(below) : boss ? (boss.cells ?? []) : null;
  return to && from.length ? [from, to] : null;
}

/** Rule 10: no thin spur, no corner pinch, a 3 × 3 block in every chamber, the main path two cells wide. */
export function guardProblems(model: DungeonModel, index: number): string[] {
  const floor = model.floors[index]!;
  const cells = caveFloorCells(floor);
  const out: string[] = [];
  for (const room of floor.rooms.filter((r) => r.kind === 'room')) {
    for (const c of room.cells ?? []) if (NEAR4.filter(([dx, dy]) => cells.has(cellKey(c.x + dx, c.y + dy))).length < 2) out.push(`room ${room.id}: thin at ${key(c)}`);
    if (!hasBlock(room.cells ?? [])) out.push(`room ${room.id}: no 3 × 3 block`);
  }
  const xs = [...cells].map((k) => Number(k.split(',')[0]));
  const ys = [...cells].map((k) => Number(k.split(',')[1]));
  for (let y = Math.min(...ys) - 1; y <= Math.max(...ys); y++) {
    for (let x = Math.min(...xs) - 1; x <= Math.max(...xs); x++) {
      const a = cells.has(cellKey(x, y));
      if (a === cells.has(cellKey(x + 1, y + 1)) && cells.has(cellKey(x + 1, y)) === cells.has(cellKey(x, y + 1)) && a !== cells.has(cellKey(x + 1, y))) out.push(`corner pinch at ${x},${y}`);
    }
  }
  const ends = laneEnds(model, index);
  if (ends && !wideWay(cells, ends[0], ends[1])) out.push('the main path is narrower than two cells');
  return out;
}

/** Whether the cell lies beside one of the door's cells, or at its corner. */
function byDoor(door: DungeonFloor['doors'][number], c: CellPoint): boolean {
  return doorCells(door).some((d) => Math.abs(d.x - c.x) <= 1 && Math.abs(d.y - c.y) <= 1);
}

/** Rule 7: every door a narrows of one or two cells; two rooms' cells meet only round the narrows joining them. */
export function narrowsProblems(floor: DungeonFloor): string[] {
  const out: string[] = [];
  for (const door of floor.doors) {
    if (door.kind === 'door') out.push(`a door at ${key(door)} in a cave`);
    if (doorCells(door).length > 2) out.push(`a narrows at ${key(door)} wider than two cells`);
  }
  const owner = new Map<string, number>();
  for (const room of floor.rooms) for (const c of room.cells ?? []) owner.set(key(c), room.id);
  for (const room of floor.rooms) {
    for (const c of room.cells ?? []) {
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const n = { x: c.x + dx, y: c.y + dy };
          const other = owner.get(key(n));
          if (other === undefined || other === room.id) continue;
          const joined = floor.doors.some((d) => d.kind !== 'secret' && ((d.from === room.id && d.to === other) || (d.from === other && d.to === room.id)) && byDoor(d, c) && byDoor(d, n));
          if (!joined) out.push(`rooms ${room.id} and ${other} touch at ${key(c)}`);
        }
      }
    }
  }
  return out;
}

/** One-cell narrows lie off the main path: where the lane passes a narrows it has two cells across the wall. */
export function laneNarrowsProblems(floor: DungeonFloor): string[] {
  const lane = new Set((floor.cave?.lane ?? []).map(key));
  const doorCell = new Set(floor.doors.flatMap((d) => (d.kind === 'secret' ? [] : doorCells(d))).map(key));
  return floor.doors.flatMap((door) => {
    if (door.kind === 'secret' || !lane.has(key(door))) return door.wide && !lane.has(key(door)) ? [`a wide narrows at ${key(door)} off the main path`] : [];
    const beside = [-1, 1].map((s) => ({ x: door.x + s * door.dir.y, y: door.y + s * door.dir.x }));
    return beside.some((c) => lane.has(key(c)) && doorCell.has(key(c))) ? [] : [`a one-cell narrows at ${key(door)} on the main path`];
  });
}

/** Chambers at most `CHAMBER_SWELL` cells past their rectangle, tunnels within their reach, nothing on another room's rectangle. */
export function maskProblems(floor: DungeonFloor): string[] {
  const out: string[] = [];
  for (const room of floor.rooms) {
    const r = floorRect(room);
    const bounds = room.kind === 'room' ? { x0: r.x0 - CHAMBER_SWELL, y0: r.y0 - CHAMBER_SWELL, x1: r.x1 + CHAMBER_SWELL, y1: r.y1 + CHAMBER_SWELL } : tunnelReach(room);
    if (!room.cells?.length) out.push(`room ${room.id} has no cells`);
    for (const c of room.cells ?? []) {
      if (!inRect(bounds, c.x, c.y)) out.push(`room ${room.id}: ${key(c)} past its rectangle`);
      const other = floor.rooms.find((r) => r.id !== room.id && inRect(floorRect(r), c.x, c.y));
      if (other) out.push(`room ${room.id}: ${key(c)} on room ${other.id}`);
    }
  }
  return out;
}

export function columnProblems(floor: DungeonFloor): string[] {
  return [...(floor.columns.length ? ['columns in a cave'] : []), ...floor.rooms.filter((r) => r.rotunda || r.colonnade).map((r) => `room ${r.id} round or colonnaded`)];
}

/** The long axis of a chamber's cells and how much longer it is than the short one. */
export function principalAxis(cells: readonly CellPoint[]): { angle: number; ratio: number } {
  const mx = cells.reduce((s, c) => s + c.x, 0) / cells.length;
  const my = cells.reduce((s, c) => s + c.y, 0) / cells.length;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const c of cells) {
    sxx += (c.x - mx) ** 2;
    syy += (c.y - my) ** 2;
    sxy += (c.x - mx) * (c.y - my);
  }
  const t = (sxx + syy) / 2;
  const d = Math.sqrt(((sxx - syy) / 2) ** 2 + sxy ** 2);
  return { angle: 0.5 * Math.atan2(2 * sxy, sxx - syy), ratio: Math.sqrt((t + d) / Math.max(1e-9, t - d)) };
}

/** Of a dungeon's chambers stretched by 1.2 or more, how many, and how many lie within 30° of a fault direction. */
export function faultStretch(model: DungeonModel): { long: number; along: number } {
  const faults = model.cave?.faults ?? [];
  let long = 0;
  let along = 0;
  for (const floor of model.floors) {
    for (const room of floor.rooms.filter((r: DungeonRoom) => r.kind === 'room' && (r.cells?.length ?? 0) > 0)) {
      const { angle, ratio } = principalAxis(room.cells!);
      if (ratio < 1.2) continue;
      long++;
      const near = faults.some((f) => {
        const d = Math.abs((((angle - f) % Math.PI) + Math.PI) % Math.PI);
        return Math.min(d, Math.PI - d) <= Math.PI / 6;
      });
      if (near) along++;
    }
  }
  return { long, along };
}
