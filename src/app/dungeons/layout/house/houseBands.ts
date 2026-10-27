/**
 * The rooms of a house's bands and its chimney stacks (research §5.3.3, §5.5.1): each band is cut
 * across its length into rooms that all reach its corridor, and every room gets a stack on a wall
 * it shares with a neighbour, back to back with the room across, two cells of masonry at the
 * corridor's side, cut from the corner of one of them. Stacks stand on lines that are inner walls on
 * every floor; the bands are cut once and every floor keeps their walls.
 */

import type { CellDir } from '../../model';
import { type Rng, int } from '../../rng';
import { type Box, alongOf, inBox, sliceOf, spanOf } from './houseGrid';
import type { BandSlot, HouseFrame, WingId, Zone } from './houseFrame';
import type { HouseSize } from './houseParams';

export interface BandRoom {
  box: Box;
  zone: Zone;
  wing: WingId;
  toCorridor: CellDir;
}

export interface CutBands {
  rooms: BandRoom[];
  /** The stack cut from each room's corner, by room index; a room has one at most. */
  notches: (Box | null)[];
  stacks: Box[];
}

const WIDTHS: Record<Zone, Record<HouseSize, [number, number]>> = {
  family: { small: [4, 5], medium: [4, 6], large: [4, 7] },
  service: { small: [3, 5], medium: [3, 5], large: [3, 6] },
};

/** Lengths of rooms filling `length` cells, each within `[min, max]` where it can be. */
function lengths(rng: Rng, length: number, [min, max]: [number, number]): number[] {
  if (length <= max) return [length];
  const fewest = Math.ceil(length / max);
  const most = Math.max(fewest, Math.floor(length / min));
  const count = int(rng, fewest, Math.min(most, fewest + 1));
  const base = Math.floor(length / count);
  const out = Array.from({ length: count }, () => base);
  for (let extra = length - base * count; extra > 0; extra--) out[int(rng, 0, count - 1)]! += 1;
  return out;
}

function cutBand(rng: Rng, band: BandSlot, size: HouseSize): BandRoom[] {
  const along = alongOf(band.toCorridor);
  const [start, length] = spanOf(band.box, along);
  const out: BandRoom[] = [];
  let at = start;
  for (const l of lengths(rng, length, WIDTHS[band.zone][size])) {
    out.push({ box: sliceOf(band.box, along, at, l), zone: band.zone, wing: band.wing, toCorridor: band.toCorridor });
    at += l;
  }
  return out;
}

/** One room or fixed part in a row along which stacks may stand: a room may be cut for one, a fixed part (hall, saloon, stair hall) not. */
interface Unit {
  box: Box;
  room: number | null;
  needs: boolean;
}

/** How deep a band must be for its stacks to stand a cell off the corridor, leaving the rooms' corridor walls whole. */
const OFF_CORRIDOR = 5;

/** How far a room's stack stands from its corridor wall: a cell where the band is deep enough and the stack stands on a cross wall. */
const offsetOf = (room: BandRoom, side: 1 | -1 | 0): number => (side !== 0 && depthOf(room) >= OFF_CORRIDOR ? 1 : 0);

/** The two masonry cells of a stack on the side of `room` towards `side` (along the band), by its corridor end. */
function stackAt(room: BandRoom, side: 1 | -1 | 0): Box {
  const along = alongOf(room.toCorridor);
  const [start, length] = spanOf(room.box, along);
  const u = side > 0 ? start + length - 1 : side < 0 ? start : start + Math.floor(length / 2);
  const t = room.toCorridor;
  const o = offsetOf(room, side);
  const { box: r } = room;
  if (along.x !== 0) return { x: u, y: t.y > 0 ? r.y + r.h - 2 - o : r.y + o, w: 1, h: 2 };
  return { x: t.x > 0 ? r.x + r.w - 2 - o : r.x + o, y: u, w: 2, h: 1 };
}

const depthOf = (room: BandRoom): number => room.box[alongOf(room.toCorridor).x !== 0 ? 'h' : 'w'];

const widthAlong = (room: BandRoom): number => spanOf(room.box, alongOf(room.toCorridor))[1];

function placeStacks(units: readonly Unit[], rooms: readonly BandRoom[], cut: CutBands, inHouse: (x: number, y: number) => boolean): void {
  const has = units.map(() => false);
  // A stack off the corridor leaves the room's corridor wall whole, so a room three cells wide can take it; one against it needs four.
  const mayCut = (unit: Unit | undefined): boolean => {
    const room = unit?.room != null && cut.notches[unit.room] === null ? rooms[unit.room] : undefined;
    return !!room && depthOf(room) >= 4 && widthAlong(room) >= (depthOf(room) >= OFF_CORRIDOR ? 3 : 4);
  };
  const adjacent = (a: Unit, b: Unit): boolean => {
    const along = alongOf(rooms[(a.room ?? b.room)!]?.toCorridor ?? { x: 0, y: 1 });
    const [s0, l0] = spanOf(a.box, along);
    const [s1, l1] = spanOf(b.box, along);
    return s0 + l0 === s1 || s1 + l1 === s0;
  };
  units.forEach((unit, i) => {
    if (!unit.needs || has[i]) return;
    for (const j of [i + 1, i - 1]) {
      const other = units[j];
      if (!other || !adjacent(unit, other)) continue;
      const choices = [unit, other].filter(mayCut);
      if (choices.length === 0) continue;
      const notched = choices.reduce((p, q) => (widthAlong(rooms[q.room!]!) > widthAlong(rooms[p.room!]!) ? q : p));
      const toward = notched === unit ? (j > i ? 1 : -1) : j > i ? -1 : 1;
      record(cut, notched.room!, stackAt(rooms[notched.room!]!, toward));
      has[i] = true;
      has[j] = true;
      return;
    }
    if (unit.room === null || !mayCut(unit)) return;
    // No neighbour to share one with: against an end that is an inner wall (a wing's corridor), else in the middle of its corridor wall.
    const room = rooms[unit.room]!;
    const along = alongOf(room.toCorridor);
    const [start, length] = spanOf(room.box, along);
    const end = ([1, -1] as const).find((side) => {
      const u = side > 0 ? start + length : start - 1;
      return along.x !== 0 ? inHouse(u, room.box.y) && inHouse(u, room.box.y + room.box.h - 1) : inHouse(room.box.x, u) && inHouse(room.box.x + room.box.w - 1, u);
    });
    if (end !== undefined) record(cut, unit.room, stackAt(room, end));
    else if (widthAlong(room) >= 5) record(cut, unit.room, stackAt(room, 0));
    else return;
    has[i] = true;
  });
}

function record(cut: CutBands, room: number, stack: Box): void {
  cut.notches[room] = stack;
  cut.stacks.push(stack);
}

/** The house's band rooms in order (the main range's back band, its front band, then each wing) and its stacks. */
export function cutBands(rng: Rng, frame: HouseFrame, size: HouseSize): CutBands {
  const rooms = frame.bands.flatMap((band) => cutBand(rng, band, size));
  const cut: CutBands = { rooms, notches: rooms.map(() => null), stacks: [] };
  const inHouse = (x: number, y: number): boolean => frame.wings.some((w) => inBox(w.box, x, y));
  const roomUnits = (wing: WingId, toCorridor: CellDir): Unit[] =>
    rooms.flatMap((room, index) => (room.wing === wing && room.toCorridor.x === toCorridor.x && room.toCorridor.y === toCorridor.y ? [{ box: room.box, room: index, needs: true }] : []));
  const fixed = (b: Box | null, needs: boolean): Unit[] => (b ? [{ box: b, room: null, needs }] : []);
  const byX = (units: Unit[]): Unit[] => units.sort((p, q) => p.box.x - q.box.x);
  placeStacks(byX([...roomUnits('main', { x: 0, y: 1 }), ...fixed(frame.saloon, true), ...fixed(frame.stairHall, false)]), rooms, cut, inHouse);
  placeStacks(byX([...roomUnits('main', { x: 0, y: -1 }), ...fixed(frame.hall, false)]), rooms, cut, inHouse);
  for (const wing of ['back-east', 'back-west', 'front-east', 'front-west'] as const) {
    const units = rooms.flatMap((room, index) => (room.wing === wing ? [{ box: room.box, room: index, needs: true }] : [])).sort((p, q) => p.box.y - q.box.y);
    placeStacks([...units, ...(wing === 'back-east' ? fixed(frame.stairHall, false) : [])], rooms, cut, inHouse);
  }
  return cut;
}
