/**
 * A house's footprint and the parts every floor keeps (research §5.2–5.4): the main range of two
 * bands of rooms either side of a corridor two cells wide, the wings its style adds (a service wing
 * with a passage one cell wide, family wings with corridors two wide), the entrance hall on the
 * front, the saloon behind it, the stair hall of the back stair where the service wing meets the
 * main range, and the line where the service side begins (`baizeX`, the baize door's). In local
 * cells: the main range from (0, 0), its front towards +y.
 */

import type { CellDir } from '../../model';
import { type Box, box } from './houseGrid';
import type { HouseParams, HouseStyle } from './houseParams';

export type Zone = 'family' | 'service';
export type WingId = 'main' | 'back-east' | 'back-west' | 'front-east' | 'front-west';

export interface Wing {
  id: WingId;
  box: Box;
  /** How many floors from the ground floor up the wing has; the main range has them all. */
  storeys: number;
}

export interface CorridorSlot {
  box: Box;
  zone: Zone;
  wing: WingId;
}

/** A strip of rooms beside a corridor: cut into rooms along its length, every room reaching the corridor. */
export interface BandSlot {
  box: Box;
  toCorridor: CellDir;
  zone: Zone;
  wing: WingId;
}

export interface HouseFrame {
  style: HouseStyle;
  symmetric: boolean;
  /** Floors above ground, the ground floor included; the top one is an attic from three on. */
  storeys: number;
  attic: boolean;
  width: number;
  depth: number;
  back: number;
  front: number;
  hall: Box;
  saloon: Box;
  /** Where the back stair rises, on every floor; none in a house of one floor without a cellar. */
  stairHall: Box | null;
  baizeX: number;
  wings: Wing[];
  corridors: CorridorSlot[];
  bands: BandSlot[];
  /** Where a wing's corridor passes through a band of the main range, and which way (+1 east, −1 west) a floor without the wing gives its cells. */
  cuts: { wing: WingId; part: 'back' | 'front'; box: Box; into: 1 | -1 }[];
}

const DOWN: CellDir = { x: 0, y: 1 };
const UP: CellDir = { x: 0, y: -1 };
const LEFT: CellDir = { x: -1, y: 0 };
const RIGHT: CellDir = { x: 1, y: 0 };

/** The widths along the main range: west reception rooms, hall, dining room, service side; mirrored styles keep the hall on the axis. */
function widths(p: HouseParams, serviceWing: number, familyWing: number): { west: number; east: number } {
  const service = Math.max(p.service, serviceWing > 0 ? serviceWing + 3 : 0);
  const east = p.dining + service;
  const west = p.style === 'L' ? Math.max(p.west, 4) : Math.max(east, familyWing + 3);
  return { west, east: p.style === 'L' ? east : west };
}

export function houseFrame(p: HouseParams, storeys: number, cellar: boolean): HouseFrame {
  const { style, back: b, front: f, hall: hw } = p;
  // A back stair needs a stair hall five cells wide where the service wing meets the main range.
  const backStair = storeys > 1 || cellar;
  // A family wing's corridor is two cells wide: its band of rooms keeps four cells for a stack.
  const wingBand = backStair || style === 'U' || style === 'H' ? Math.max(p.wingBand, 5) : p.wingBand;
  const serviceWing = style === 'block' ? 0 : wingBand + 1;
  const familyWing = style === 'U' || style === 'H' ? serviceWing : 0;
  const { west, east } = widths(p, serviceWing, familyWing);
  const W = west + hw + east;
  const D = b + 2 + f;
  const hx = west;
  const baizeX = hx + hw + p.dining;
  const L = p.wingLength;
  const attic = storeys >= 3;
  const wingStoreys = storeys === 1 ? 1 : attic ? storeys - 1 : 2;
  const serviceStoreys = Math.max(1, wingStoreys - 1);
  const wings: Wing[] = [{ id: 'main', box: box(0, 0, W, D), storeys }];
  const corridors: CorridorSlot[] = [
    { box: box(0, b, baizeX, 2), zone: 'family', wing: 'main' },
    { box: box(baizeX, b, W - baizeX, 2), zone: 'service', wing: 'main' },
  ];
  const bands: BandSlot[] = [];
  const cuts: HouseFrame['cuts'] = [];
  const wing = (id: WingId, x: number, y: number, w: number, storeysOf: number, corridor: Box, zone: Zone, band: Box, toCorridor: CellDir): void => {
    wings.push({ id, box: box(x, y, w, L), storeys: storeysOf });
    corridors.push({ box: corridor, zone, wing: id });
    bands.push({ box: band, toCorridor, zone, wing: id });
    const front = y > 0;
    // The corridor's stretch through the main range's band, which a floor without the wing gives to the room beside it.
    cuts.push({ wing: id, part: front ? 'front' : 'back', box: front ? box(corridor.x, b + 2, corridor.w, f) : box(corridor.x, 0, corridor.w, b), into: id.endsWith('east') ? 1 : -1 });
  };
  const sx = W - serviceWing;
  if (serviceWing > 0) wing('back-east', sx, -L, serviceWing, serviceStoreys, box(sx, -L, 1, L + b), 'service', box(sx + 1, -L, serviceWing - 1, L), LEFT);
  if (familyWing > 0) wing('back-west', 0, -L, familyWing, wingStoreys, box(familyWing - 2, -L, 2, L + b), 'family', box(0, -L, familyWing - 2, L), RIGHT);
  if (style === 'H') {
    wing('front-west', 0, D, familyWing, wingStoreys, box(familyWing - 2, b + 2, 2, f + L), 'family', box(0, D, familyWing - 2, L), RIGHT);
    wing('front-east', sx, D, serviceWing, serviceStoreys, box(sx, b + 2, 1, f + L), 'service', box(sx + 1, D, serviceWing - 1, L), LEFT);
  }
  const stairHall = !backStair ? null : serviceWing > 0 ? box(sx + 1, 0, serviceWing - 1, b) : box(W - 5, 0, 5, b);
  const hall = box(hx, b + 2, hw, f);
  const saloon = box(hx, 0, hw, b);
  const taken = (part: 'back' | 'front'): [number, number][] => [
    ...cuts.filter((c) => c.part === part).map((c): [number, number] => [c.box.x, c.box.x + c.box.w]),
    [hx, hx + hw],
    ...(part === 'back' && stairHall ? [[stairHall.x, stairHall.x + stairHall.w] as [number, number]] : []),
  ];
  for (const [part, y, h, toCorridor] of [['back', 0, b, DOWN], ['front', b + 2, f, UP]] as const) {
    for (const [from, to] of gaps(taken(part), W)) {
      for (const [x0, x1, zone] of splitAt(from, to, baizeX)) bands.push({ box: box(x0, y, x1 - x0, h), toCorridor, zone, wing: 'main' });
    }
  }
  return { style, symmetric: style !== 'L', storeys, attic, width: W, depth: D, back: b, front: f, hall, saloon, stairHall, baizeX, wings, corridors, bands, cuts };
}

/** The stretches of [0, length) no taken span covers. */
function gaps(taken: readonly [number, number][], length: number): [number, number][] {
  const sorted = [...taken].sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  let at = 0;
  for (const [from, to] of sorted) {
    if (from > at) out.push([at, from]);
    at = Math.max(at, to);
  }
  if (at < length) out.push([at, length]);
  return out;
}

/** A stretch split at the baize door's line: the family side before it, the service side from it. */
function splitAt(from: number, to: number, line: number): [number, number, Zone][] {
  if (to <= line) return [[from, to, 'family']];
  if (from >= line) return [[from, to, 'service']];
  return [
    [from, line, 'family'],
    [line, to, 'service'],
  ];
}
