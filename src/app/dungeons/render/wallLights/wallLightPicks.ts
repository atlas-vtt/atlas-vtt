import { cellKey, doorSide, floorCellsOf } from '../../geometry';
import type { CellDir, CellPoint, DungeonDoor, DungeonProp, DungeonRoom, DungeonStair } from '../../model';
import { chance, pick, type Rng } from '../../rng';
import type { Vec } from '../geometry';
import type { WallSlot } from './wallSlots';

/**
 * The places a room's light is hung at, by what people hang it for: beside a door they use, a pair
 * flanking a hall's way in or its dais, beside a stairwell, along a passage, or anywhere on the wall
 * far from the lights already there. Each returns slots of `usable`, or none where the room has no
 * such place.
 */

const same = (a: CellDir, b: CellDir): boolean => a.x === b.x && a.y === b.y;
/** How far `c` lies along `t` (a unit axis), in cells. */
const along = (c: Vec, t: CellDir): number => c.x * t.x + c.y * t.y;

/** The door a room is entered by from the way in: from its parent, or from outside; else its first door. */
export function mainDoor(room: DungeonRoom, doors: readonly DungeonDoor[]): DungeonDoor | undefined {
  const own = doors.filter(door => door.kind !== 'secret' && (door.from === room.id || door.to === room.id));
  return own.find(door => door.to === room.id && door.from === room.parent) ?? own.find(door => door.to === room.id && door.from === null) ?? own[0];
}

/** A door's edge as seen from inside `room`: its cells there and the way from them to the door. */
function doorEdge(door: DungeonDoor, room: number): { cells: CellPoint[]; side: CellDir } {
  const side = door.from === room ? door.dir : ({ x: -door.dir.x, y: -door.dir.y } as CellDir);
  return { cells: doorSide(door, room), side };
}

/** The slots `k` cells beyond each end of a door along its wall, left and right; either may be missing. */
function besideDoor(slots: readonly WallSlot[], door: DungeonDoor, room: number, k: number): [WallSlot | undefined, WallSlot | undefined] {
  const { cells, side } = doorEdge(door, room);
  const t = { x: Math.abs(side.y), y: Math.abs(side.x) } as CellDir;
  const sorted = [...cells].sort((a, b) => along(a, t) - along(b, t));
  const [lo, hi] = [sorted[0], sorted[sorted.length - 1]];
  if (!lo || !hi) return [undefined, undefined];
  const at = (c: CellPoint): WallSlot | undefined => slots.find(s => same(s.side, side) && s.cell.x === c.x && s.cell.y === c.y);
  return [at({ x: lo.x - t.x * k, y: lo.y - t.y * k }), at({ x: hi.x + t.x * k, y: hi.y + t.y * k })];
}

/** A pair flanking the door the room is entered by, as a built hall is lit: one cell, else two, beyond each end of it. */
export function flankingDoor(slots: readonly WallSlot[], room: DungeonRoom, doors: readonly DungeonDoor[]): WallSlot[] {
  const door = mainDoor(room, doors);
  if (!door) return [];
  for (const k of [1, 2]) {
    const [a, b] = besideDoor(slots, door, room.id, k);
    if (a && b) return [a, b];
  }
  return [];
}

/** One light beside a door of the room, the way in likelier than another, on either side of it. */
export function besideADoor(slots: readonly WallSlot[], room: DungeonRoom, doors: readonly DungeonDoor[], rng: Rng): WallSlot[] {
  const main = mainDoor(room, doors);
  const own = doors.filter(door => door.kind !== 'secret' && (door.from === room.id || door.to === room.id));
  if (!main) return [];
  const door = own.length > 1 && chance(rng, 0.4) ? pick(rng, own) : main;
  const k = chance(rng, 0.7) ? 1 : 2;
  const [a, b] = besideDoor(slots, door, room.id, k);
  const left = chance(rng, 0.5);
  const first = left ? a : b;
  const found = first ?? (left ? b : a);
  return found ? [found] : [];
}

/** A pair on the dais's back wall, one each side of it at the same distance, as a hall's seat of honour is lit. */
export function flankingDais(slots: readonly WallSlot[], dais: DungeonProp): WallSlot[] {
  const back = { x: Math.round(-Math.sin(dais.rotation)), y: Math.round(Math.cos(dais.rotation)) } as CellDir;
  const t: CellDir = { x: Math.abs(back.y), y: Math.abs(back.x) } as CellDir;
  const middle = along({ x: dais.x, y: dais.y }, t);
  const onBack = slots.filter(s => same(s.side, back));
  for (const slot of [...onBack].sort((a, b) => Math.abs(along(a.place, t) - middle) - Math.abs(along(b.place, t) - middle))) {
    const offset = along(slot.place, t) - middle;
    if (offset > 0) continue;
    const mirror = onBack.find(s => Math.abs(along(s.place, t) - middle + offset) < 0.02 && Math.abs(along(s.place, back) - along(slot.place, back)) < 0.02);
    if (mirror) return [slot, mirror];
  }
  return [];
}

/** One light beside a stairwell of the room, on the wall nearest it. */
export function besideStairs(slots: readonly WallSlot[], room: DungeonRoom, stairs: readonly DungeonStair[], rng: Rng): WallSlot[] {
  const cells = new Set(floorCellsOf(room).map(c => cellKey(c.x, c.y)));
  const own = stairs.filter(s => cells.has(cellKey(s.x, s.y)));
  if (own.length === 0) return [];
  const s = pick(rng, own);
  const gap = (slot: WallSlot): number => Math.max(s.x - slot.cell.x, slot.cell.x - (s.x + s.w - 1), s.y - slot.cell.y, slot.cell.y - (s.y + s.h - 1), 0);
  const near = slots.filter(slot => gap(slot) <= 2);
  return near.length > 0 ? [pick(rng, [...near].sort((a, b) => gap(a) - gap(b)).slice(0, 2))] : [];
}

/** One light near a way into a cave's chamber, a cell or three along the rock from it, never right beside it as a builder would. */
export function nearAWayIn(slots: readonly WallSlot[], room: DungeonRoom, doors: readonly DungeonDoor[], rng: Rng): WallSlot[] {
  const own = doors.filter(door => door.kind !== 'secret' && (door.from === room.id || door.to === room.id));
  if (own.length === 0) return [];
  const door = pick(rng, own);
  const at = doorEdge(door, room.id).cells[0];
  if (!at) return [];
  const near = slots.filter(s => {
    const d = Math.hypot(s.cell.x - at.x, s.cell.y - at.y);
    return d >= 1 && d <= 3;
  });
  return near.length > 0 ? [pick(rng, near)] : [];
}

/** Of a few slots drawn at random, the one farthest from every light already there: lights spread through a room unevenly, as people hang them. */
export function farFrom(slots: readonly WallSlot[], lights: readonly Vec[], rng: Rng, tries = 4): WallSlot[] {
  if (slots.length === 0) return [];
  let best: WallSlot | undefined;
  let bestGap = -1;
  for (let i = 0; i < tries; i++) {
    const slot = pick(rng, slots);
    const gap = Math.min(Infinity, ...lights.map(p => Math.hypot(p.x - slot.place.x, p.y - slot.place.y)));
    if (gap > bestGap) [best, bestGap] = [slot, gap];
  }
  return best ? [best] : [];
}

/** Places along a passage: the first a little from its end, then every gap, each on the side the last stood on or the other. */
export function alongPassage(slots: readonly WallSlot[], room: DungeonRoom, rng: Rng, first: readonly [number, number], gap: readonly [number, number], hung: number): WallSlot[][] {
  const t: CellDir = room.w >= room.h ? { x: 1, y: 0 } : { x: 0, y: 1 };
  const [start, end] = t.x ? [room.x, room.x + room.w - 1] : [room.y, room.y + room.h - 1];
  const span = (range: readonly [number, number]): number => range[0] + Math.floor(rng() * (range[1] - range[0] + 1));
  const picks: WallSlot[][] = [];
  let side = rng() < 0.5 ? -1 : 1;
  for (let at = start + span(first); at <= end - 1; at += span(gap)) {
    if (!chance(rng, hung)) continue;
    if (chance(rng, 0.5)) side = -side;
    const near = slots.filter(s => Math.abs(along(s.cell, t) - at) <= 1).sort((a, b) => {
      const sideOf = (s: WallSlot): number => (along(s.side, { x: t.y, y: t.x }) === side ? 0 : 1);
      return sideOf(a) - sideOf(b) || Math.abs(along(a.cell, t) - at) - Math.abs(along(b.cell, t) - at);
    });
    if (near[0]) picks.push([near[0]]);
  }
  return picks;
}
