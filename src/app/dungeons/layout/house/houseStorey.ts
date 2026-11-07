/**
 * One floor of a house from its frame and its cut bands: the wings that reach the floor, the main
 * range drawn in a cell from front and back under an attic's roof, every band room where the floor
 * has it (walls where the floor below has them), the corridors, the hall, saloon and stair hall in
 * their places, and the stacks that rise through it. A wing's corridor through the main range is
 * given to the room beside it on a floor the wing does not reach.
 */

import type { CellDir, RoomKind } from '../../model';
import type { CutBands } from './houseBands';
import { type Box, box, shrunk } from './houseGrid';
import type { HouseFrame, WingId, Zone } from './houseFrame';

export type StoreyKind = 'ground' | 'upper' | 'attic' | 'cellar';

export type RoomRole = 'hall' | 'saloon' | 'stair-hall' | 'band' | 'corridor';

export interface StoreyRoom {
  box: Box;
  notch: Box | null;
  kind: RoomKind;
  role: RoomRole;
  zone: Zone;
  wing: WingId;
  /** The way from a band room to its corridor. */
  toCorridor: CellDir | null;
}

export interface Storey {
  /** Floors above the ground floor; −1 the cellar. */
  level: number;
  kind: StoreyKind;
  rooms: StoreyRoom[];
  stacks: Box[];
}

/** The cells of `b` that lie in `within`, as a box, or null when none do. */
function clip(b: Box, within: Box): Box | null {
  const x0 = Math.max(b.x, within.x);
  const y0 = Math.max(b.y, within.y);
  const x1 = Math.min(b.x + b.w, within.x + within.w);
  const y1 = Math.min(b.y + b.h, within.y + within.h);
  return x0 < x1 && y0 < y1 ? box(x0, y0, x1 - x0, y1 - y0) : null;
}

function storeyKind(frame: HouseFrame, level: number): StoreyKind {
  if (level < 0) return 'cellar';
  if (level === 0) return 'ground';
  return frame.attic && level === frame.storeys - 1 ? 'attic' : 'upper';
}

/** Whether a wing reaches the floor at `level`; a cellar lies under the main range alone. */
function reaches(frame: HouseFrame, wing: WingId, level: number): boolean {
  if (level < 0) return wing === 'main';
  return (frame.wings.find((w) => w.id === wing)?.storeys ?? 0) > level;
}

export function buildStorey(frame: HouseFrame, cut: CutBands, level: number): Storey {
  const kind = storeyKind(frame, level);
  const main = frame.wings[0]!.box;
  const range = kind === 'attic' ? shrunk(main, [{ x: 0, y: -1 }, { x: 0, y: 1 }]) : main;
  // A wing's corridor runs on through the main range's band to its corridor: the two together, where the wing reaches.
  const placeIn = (b: Box, wing: WingId): Box | null => {
    const own = frame.wings.find((w) => w.id === wing)!.box;
    const y0 = Math.min(range.y, own.y);
    return clip(b, box(range.x, y0, range.w, Math.max(range.y + range.h, own.y + own.h) - y0));
  };
  const rooms: StoreyRoom[] = [];
  const add = (b: Box | null, role: RoomRole, zone: Zone, wing: WingId, notch: Box | null = null, toCorridor: CellDir | null = null): void => {
    if (b) rooms.push({ box: b, notch: notch && level >= 0 ? notch : null, kind: role === 'corridor' ? 'corridor' : 'room', role, zone, wing, toCorridor });
  };
  add(clip(frame.hall, range), 'hall', 'family', 'main');
  add(clip(frame.saloon, range), 'saloon', 'family', 'main');
  if (frame.stairHall) add(clip(frame.stairHall, range), 'stair-hall', 'service', 'main');
  cut.rooms.forEach((room, index) => {
    if (room.wing !== 'main' && !reaches(frame, room.wing, level)) return;
    add(clip(room.box, room.wing === 'main' ? range : frame.wings.find((w) => w.id === room.wing)!.box), 'band', room.zone, room.wing, cut.notches[index] ?? null, room.toCorridor);
  });
  for (const corridor of frame.corridors) {
    if (corridor.wing === 'main') add(clip(corridor.box, range), 'corridor', corridor.zone, 'main');
    else if (reaches(frame, corridor.wing, level)) add(placeIn(corridor.box, corridor.wing), 'corridor', corridor.zone, corridor.wing);
  }
  for (const c of frame.cuts) if (!reaches(frame, c.wing, level)) absorb(rooms, clip(c.box, range), c.into);
  const stacks = level < 0 ? [] : cut.stacks.filter((s) => rooms.some((r) => r.notch === s));
  return { level, kind, rooms, stacks };
}

/** Gives the cells of a wing's corridor through the main range to the room beside it on the side `into`. */
function absorb(rooms: StoreyRoom[], cells: Box | null, into: 1 | -1): void {
  if (!cells) return;
  const beside = rooms.find((r) => r.box.y === cells.y && r.box.h === cells.h && (into > 0 ? r.box.x === cells.x + cells.w : r.box.x + r.box.w === cells.x));
  if (!beside) return;
  beside.box = box(Math.min(beside.box.x, cells.x), beside.box.y, beside.box.w + cells.w, beside.box.h);
}
