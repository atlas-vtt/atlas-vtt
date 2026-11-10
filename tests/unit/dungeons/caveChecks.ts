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
import { fitsTier, tierOfFloor } from '../../../src/app/dungeons/layout/cavern/veins/caveSizes';
import { NARROW_SHARE } from '../../../src/app/dungeons/render/cave/outlineGuard';

const key = (c: CellPoint): string => cellKey(c.x, c.y);
const NEAR4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** The floor as the cave is drawn: every room's cells and the cells of every narrows (a crawl is rock). */
/**
 * The least share of each narrow way's cell drawn floor (`NARROW_SHARE`): its door's cells and its
 * route's cells, which the drawing makes narrower than themselves.
 */
export function narrowShares(floor: DungeonFloor): Map<string, number> {
  const out = new Map<string, number>();
  const add = (c: CellPoint, share: number): void => void out.set(key(c), Math.min(share, out.get(key(c)) ?? 1));
  for (const room of floor.rooms) if (room.narrow) for (const c of room.cells ?? []) add(c, NARROW_SHARE[room.narrow]);
  for (const door of floor.doors) {
    if ((door.kind === 'opening' || door.kind === 'door') && door.from !== null && door.to !== null && (door.way === 'crawl' || door.way === 'squeeze' || door.way === 'letterbox')) for (const c of doorCells(door)) add(c, NARROW_SHARE[door.way]);
  }
  return out;
}

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

/** The ways the main path may pinch to one cell through: a crawl, a squeeze, a letterbox, where a chamber has no wider way on. */
const PINCHING: ReadonlySet<string> = new Set(['crawl', 'squeeze', 'letterbox']);

/** Whether the door is one where the main path pinches: an open way of one cell on the lane, too low or tight to walk. */
function pinchesLane(door: DungeonFloor['doors'][number], lane: ReadonlySet<string>): boolean {
  return door.kind === 'opening' && !door.wide && PINCHING.has(door.way ?? 'walk') && lane.has(key(door));
}

/**
 * The rock beside the doors where the main path pinches, which the main path's two cells pass there
 * alone. The lane leaves that cell out, as nobody walks it, so either side of the door may be it.
 */
function pinchCells(floor: DungeonFloor, cells: ReadonlySet<string>): string[] {
  const lane = new Set((floor.cave?.lane ?? []).map(key));
  // The neck's rock: the door row and the rows either side of it, which `holdNecks` turns to rock.
  return floor.doors.filter((d) => pinchesLane(d, lane)).flatMap((d) => [-1, 0, 1].flatMap((t) => [-1, 1].map((s) => cellKey(d.x + t * d.dir.x + s * d.dir.y, d.y + t * d.dir.y + s * d.dir.x)))).filter((k) => !cells.has(k));
}

/** Rule 10: no thin spur, no corner pinch, a 3 × 3 block in every chamber, the main path two cells wide but where it pinches through a crawl. */
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
  if (ends && !wideWay(new Set([...cells, ...pinchCells(floor, cells)]), ends[0], ends[1])) out.push('the main path is narrower than two cells');
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

const LARGE_TIERS: ReadonlySet<string> = new Set(['triple', 'quadruple', 'house', 'hall', 'gargantuan']);

/** Whether a narrows off the main path may be two cells wide: a way ten feet wide or more (rolled as a walk; breakdown may choke it since, or a fall drop through it) between two chambers of three rooms or larger. */
function wideWalk(floor: DungeonFloor, door: DungeonFloor['doors'][number]): boolean {
  const large = (id: number | null): boolean => id !== null && LARGE_TIERS.has(floor.rooms[id]?.tier ?? '');
  return (door.width ?? 0) >= 10 && large(door.from) && large(door.to);
}

/**
 * One-cell narrows lie off the main path: where the lane passes a narrows it has two cells across
 * the wall, but through a crawl, a squeeze or a letterbox. Off it a narrows is one cell, but a wide
 * walk between two large chambers.
 */
export function laneNarrowsProblems(floor: DungeonFloor): string[] {
  const lane = new Set((floor.cave?.lane ?? []).map(key));
  const doorCell = new Set(floor.doors.flatMap((d) => (d.kind === 'secret' ? [] : doorCells(d))).map(key));
  return floor.doors.flatMap((door) => {
    if (door.kind === 'secret' || !lane.has(key(door))) return door.wide && !lane.has(key(door)) && !wideWalk(floor, door) ? [`a wide narrows at ${key(door)} off the main path`] : [];
    if (pinchesLane(door, lane)) return [];
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

/** Whether a chamber's size came from elsewhere than its tier draw: the boss room (grown), a later floor's first room (round the landing), a reward room. */
function sizedElsewhere(room: DungeonRoom, index: number): boolean {
  return room.boss || (index > 0 && room.parent === null) || room.stage === 'reward';
}

/**
 * The book's cave rules a floor keeps: every door is passed some way; the main path is walked
 * (no special route or climb on it) but where it pinches through a crawl or tighter; every
 * chamber has its size tier and the floor that tier gives (a
 * chamber sized elsewhere, the tier its floor reaches).
 */
export function veinsProblems(model: DungeonModel, index: number): string[] {
  const floor = model.floors[index]!;
  const lane = new Set((floor.cave?.lane ?? []).map(key));
  const out: string[] = [];
  for (const door of floor.doors) {
    if (!door.way) out.push(`a door at ${key(door)} without a way`);
    if (door.kind !== 'secret' && lane.has(key(door)) && door.way !== 'walk' && !pinchesLane(door, lane)) out.push(`a ${door.way} at ${key(door)} on the main path`);
  }
  for (const room of floor.rooms.filter((r) => r.kind === 'room')) {
    const across = room.axis.x !== 0 ? room.h : room.w;
    const along = room.axis.x !== 0 ? room.w : room.h;
    const { tier } = room;
    if (!tier || tier === 'junction') out.push(`chamber ${room.id} without a tier`);
    else if (sizedElsewhere(room, index) ? tier !== tierOfFloor(across, along) : !fitsTier(tier, across, along)) out.push(`chamber ${room.id} (${across} × ${along}) is no ${tier}`);
  }
  return out;
}

/** A floor's chamber exits: those in roofs and floors, and all of them (every door of a chamber, and those). */
export function chamberExits(floor: DungeonFloor): { vertical: number; all: number } {
  let vertical = 0;
  let all = 0;
  for (const room of floor.rooms.filter((r) => r.kind === 'room')) {
    const v = (room.vertical?.up.length ?? 0) + (room.vertical?.down.length ?? 0);
    vertical += v;
    all += v + floor.doors.filter((d) => d.from === room.id || d.to === room.id).length;
  }
  return { vertical, all };
}
