/**
 * What each room of a house is for, decided where it stands (research §5.5.2): on the ground floor
 * the entrance hall, the dining room beside it, the drawing room the largest reception room, the
 * service rooms behind the baize door round the kitchen; upstairs a landing over the hall, the master
 * bedroom with its dressing room, bedrooms with bathrooms, the nursery nearest the back stair,
 * servants on the service side and in the attic; stores, wine and laundry in a cellar. The climax
 * room stands on the top floor or in the cellar.
 */

import type { RoomTypeId } from '../../themes/roomTypes';
import { type Rng, chance, shuffled } from '../../rng';
import { type Box, box } from './houseGrid';
import { alongOf, spanOf } from './houseGrid';
import type { WingId } from './houseFrame';
import type { Storey, StoreyRoom } from './houseStorey';

export interface TypedRoom extends StoreyRoom {
  type: RoomTypeId | null;
  boss: boolean;
  /** A dressing room or bathroom opens only into the bedroom it was cut from (its index). */
  servedBy: number | null;
}

const area = (r: StoreyRoom): number => r.box.w * r.box.h - (r.notch ? r.notch.w * r.notch.h : 0);
const largestFirst = (rooms: TypedRoom[]): TypedRoom[] => [...rooms].sort((p, q) => area(q) - area(p) || p.box.x - q.box.x || p.box.y - q.box.y);

const touches = (a: Box, b: Box): boolean => {
  const xs = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const ys = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return (xs > 0 && ys === 0) || (ys > 0 && xs === 0);
};

export interface ZoneInput {
  rng: Rng;
  storey: Storey;
  /** Whether the climax room stands on this floor, and what it is. */
  climax: RoomTypeId | null;
  /** The master bedroom is on this floor (unless it is the climax). */
  master: boolean;
  /** The house has a cellar, which keeps its wine. */
  cellar: boolean;
  dining: Box;
  servery: boolean;
  /** In a ruin, the wing whose roof fell in (`main` for a block: its west end); its ground-floor rooms lie collapsed. */
  ruined: WingId | null;
}

/** Every room of one floor typed; dressing rooms and bathrooms cut from the bedrooms they serve. */
export function typeStorey(input: ZoneInput): TypedRoom[] {
  const { rng, storey } = input;
  const rooms: TypedRoom[] = storey.rooms.map((room) => ({ ...room, type: null, boss: false, servedBy: null }));
  const free = (): TypedRoom[] => rooms.filter((r) => r.kind === 'room' && r.type === null);
  const family = (): TypedRoom[] => free().filter((r) => r.zone === 'family');
  const service = (): TypedRoom[] => free().filter((r) => r.zone === 'service');
  const set = (room: TypedRoom | undefined, type: RoomTypeId): void => {
    if (room) room.type = type;
  };
  for (const r of rooms) if (r.role === 'stair-hall') r.type = 'staircase-hall';
  const kind = storey.kind;
  const hall = rooms.find((r) => r.role === 'hall');
  if (kind === 'ground') set(hall, 'entrance-hall');
  else if (kind === 'upper') set(hall, 'landing');
  if (input.climax) {
    const atDining = (r: TypedRoom): boolean => kind === 'ground' && r.box.x === input.dining.x && r.box.y === input.dining.y;
    const pick = largestFirst(free().filter((r) => r.role !== 'hall' && !atDining(r) && area(r) >= 12 && (kind === 'cellar' || r.zone === 'family')))[0];
    if (pick) {
      pick.type = input.climax;
      pick.boss = true;
    }
  }
  if (kind === 'ground' && input.ruined) {
    const fallen = rooms.filter((r) => r.role === 'band' && r.wing === input.ruined && !r.boss).sort((p, q) => p.box.x - q.box.x || p.box.y - q.box.y);
    for (const r of input.ruined === 'main' ? fallen.slice(0, 1) : largestFirst(fallen).slice(0, 2)) r.type = 'collapsed-room';
  }
  if (kind === 'ground') typeGround(input, rooms, family, service);
  else if (kind === 'upper') typeUpper(input, rooms, family, service);
  else if (kind === 'attic') for (const r of free()) r.type = r.zone === 'service' || chance(rng, 0.5) ? 'servants-room' : 'attic-room';
  else typeCellar(input, free);
  return rooms;
}

function typeGround(input: ZoneInput, rooms: TypedRoom[], family: () => TypedRoom[], service: () => TypedRoom[]): void {
  const { rng } = input;
  const at = (b: Box): TypedRoom | undefined => rooms.find((r) => r.box.x === b.x && r.box.y === b.y);
  const dining = at(input.dining);
  if (dining && dining.type === null) dining.type = 'dining-room';
  const drawing = largestFirst(family())[0];
  if (drawing) drawing.type = 'drawing-room';
  // The drawing room is the largest reception room: where the dining room's place is larger, the two change places.
  if (drawing && dining?.type === 'dining-room' && area(dining) > area(drawing)) [drawing.type, dining.type] = ['dining-room', 'drawing-room'];
  const saloon = rooms.find((r) => r.role === 'saloon' && r.type === null);
  if (saloon) saloon.type = 'saloon';
  const back = family().filter((r) => r.toCorridor?.y === 1);
  if (back.length > 0 && chance(rng, 0.6)) back.sort((p, q) => p.box.x - q.box.x)[0]!.type = 'conservatory';
  const long = family().find((r) => spanOf(r.box, alongOf(r.toCorridor ?? { x: 0, y: 1 }))[1] >= 7);
  if (long && chance(rng, 0.5)) long.type = 'portrait-gallery';
  const rest = shuffled(rng, family());
  if (rest[0]) rest[0].type = 'library';
  if (rest[1]) rest[1].type = 'study';
  for (const r of rest.slice(2)) r.type = 'parlour';
  const served = rooms.find((r) => r.type === 'dining-room');
  if (input.servery && served) {
    const servery = service().find((r) => touches(r.box, served.box) && r.box.w * r.box.h <= 20);
    if (servery) servery.type = 'servery';
  }
  const kitchen = largestFirst(service())[0];
  if (kitchen) kitchen.type = 'kitchen';
  const sculleries = kitchen ? service().filter((r) => touches(r.box, kitchen.box)) : [];
  if (sculleries[0]) sculleries[0].type = 'scullery';
  const next: RoomTypeId[] = ['servants-hall', 'laundry', ...(input.cellar ? [] : (['wine-cellar'] as const)), 'storeroom'];
  for (const r of shuffled(rng, service())) r.type = next.shift() ?? 'storeroom';
}

function typeUpper(input: ZoneInput, rooms: TypedRoom[], family: () => TypedRoom[], service: () => TypedRoom[]): void {
  const { rng, storey } = input;
  for (const r of service()) r.type = 'servants-room';
  const front = largestFirst(family().filter((r) => r.toCorridor?.y === -1 || r.role === 'saloon'));
  const master = input.master ? (front[0] ?? largestFirst(family())[0]) : undefined;
  if (master) master.type = 'master-bedroom';
  const stairs = rooms.find((r) => r.role === 'stair-hall');
  const nursery = stairs ? family().sort((p, q) => Math.abs(p.box.x - stairs.box.x) - Math.abs(q.box.x - stairs.box.x))[0] : undefined;
  if (nursery && chance(rng, 0.6)) nursery.type = 'nursery';
  const long = family().find((r) => spanOf(r.box, alongOf(r.toCorridor ?? { x: 0, y: 1 }))[1] >= 7);
  if (long && storey.level === 1 && chance(rng, 0.4)) long.type = 'portrait-gallery';
  const extra: RoomTypeId[] = storey.level >= 2 ? ['laboratory', 'observatory', 'study'] : ['study'];
  for (const r of shuffled(rng, family())) r.type = extra.length > 0 && chance(rng, 0.25) ? extra.shift()! : 'bedroom';
  let baths = 0;
  // Dressing rooms first, so a bathroom is cut only where it stays the floor's smallest room.
  for (const r of [...rooms]) if (r.type === 'master-bedroom') cutServed(rooms, r, 'dressing-room', storey.stacks, 3);
  for (const r of [...rooms]) if (r.type === 'bedroom' && baths < 2 && chance(rng, 0.5) && smallestBath(rooms, r) && cutServed(rooms, r, 'bathroom', storey.stacks, 2)) baths++;
}

function typeCellar(input: ZoneInput, free: () => TypedRoom[]): void {
  const order: RoomTypeId[] = ['wine-cellar', 'laundry', ...(chance(input.rng, 0.4) ? (['laboratory'] as const) : [])];
  for (const r of largestFirst(free())) r.type = order.shift() ?? 'storeroom';
}

/**
 * Cuts two cells off the end of a band room away from its stack as a room it alone opens into,
 * where the room stays four cells wide; whether it could.
 */
function cutServed(rooms: TypedRoom[], room: TypedRoom, type: RoomTypeId, stacks: readonly Box[], width: number): boolean {
  if (room.role !== 'band' || !room.toCorridor) return false;
  const along = alongOf(room.toCorridor);
  const [start, length] = spanOf(room.box, along);
  if (length < width + 4) return false;
  // The stack stands at one end (cut from this room or from its neighbour there); the closet goes to the other.
  const near = stacks.filter((s) => touches(s, room.box) || s === room.notch).map((s) => spanOf(s, along)[0]);
  const atStart = !near.some((u) => u <= start);
  if (!atStart && near.some((u) => u >= start + length - 1)) return false;
  const cutFrom = atStart ? start : start + length - width;
  const keepFrom = atStart ? start + width : start;
  const piece = along.x !== 0 ? box(cutFrom, room.box.y, width, room.box.h) : box(room.box.x, cutFrom, room.box.w, width);
  room.box = along.x !== 0 ? box(keepFrom, room.box.y, length - width, room.box.h) : box(room.box.x, keepFrom, room.box.w, length - width);
  rooms.push({ ...room, box: piece, notch: null, type, boss: false, servedBy: rooms.indexOf(room) });
  return true;
}

/** Whether a bathroom two cells wide cut from `room` would be the smallest room of its floor. */
function smallestBath(rooms: readonly TypedRoom[], room: TypedRoom): boolean {
  const bath = 2 * (room.toCorridor && alongOf(room.toCorridor).x !== 0 ? room.box.h : room.box.w);
  return rooms.every((r) => r.kind !== 'room' || r === room || area(r) >= bath);
}
