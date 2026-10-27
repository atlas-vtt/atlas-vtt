import { roomArea } from '../../geometry';
import type { DungeonRoom } from '../../model';
import type { RoomTypeId } from '../../themes/roomTypes';

/**
 * How likely the people of a lived-in dungeon are to keep a light in a room, and how they hang it.
 * Halls where people gather are nearly always lit, in a built hall symmetrically; small rooms,
 * store rooms, cellars and the wild parts of a cave mostly lie dark; a room a fire already lights
 * seldom needs more; every other room is lit less often than not.
 */

/** What a room is to the people who light it. */
export type LightRole = 'hall' | 'dark' | 'room' | 'passage' | 'junction';

/** Where people gather or pass through in state: a hall, a chapel, a gallery, a chief's den. */
const HALLS: ReadonlySet<RoomTypeId> = new Set<RoomTypeId>([
  'gatehouse', 'great-hall', 'lower-hall', 'throne-room', 'chapel', 'barracks', 'servants-hall', 'entrance-hall', 'ballroom', 'dining-room',
  'saloon', 'staircase-hall', 'stair-hall', 'gallery', 'portrait-gallery', 'grand-cavern', 'chief-den',
]);

/** Where nobody keeps a flame: stores, cellars, privies, cells, stables, and a cave's wild water, rock and beasts' lairs. */
const DARK: ReadonlySet<RoomTypeId> = new Set<RoomTypeId>([
  'storeroom', 'buttery', 'garderobe', 'cistern', 'gaol', 'stable', 'collapsed-room', 'wine-cellar', 'scullery', 'laundry', 'attic-room',
  'dressing-room', 'gate-chamber', 'flowstone-gallery', 'lake-cavern', 'stream-passage', 'sump', 'chasm-hall', 'collapse-chamber', 'shaft-room',
  'fungus-grove', 'crystal-grotto', 'lava-tube', 'sulphur-spring', 'roost', 'den', 'pen', 'store-hollow',
]);

/** Under this many floor cells a room is a closet or a cell, mostly dark. */
const SMALL_AREA = 12;

export function lightRole(room: DungeonRoom): LightRole {
  if (room.kind === 'corridor') return 'passage';
  if (room.kind === 'junction') return 'junction';
  if (room.boss || (room.type && HALLS.has(room.type))) return 'hall';
  if (room.type && DARK.has(room.type)) return 'dark';
  return 'room';
}

/** The chance a room has a light of its own: by its role and size, in a cave less often, behind a secret door seldom. */
export function litChance(room: DungeonRoom, role: LightRole, cave: boolean): number {
  const base = role === 'hall' ? 0.85
    : role === 'dark' ? 0.1
    : role === 'junction' ? (cave ? 0.2 : 0.3)
    : roomArea(room) < SMALL_AREA ? 0.2
    : cave ? 0.35 : 0.5;
  return room.wing === 'secret' ? base * 0.35 : base;
}

/** The chance a room a fire lights takes one more light, far from the fire. */
export const FIRE_ROOM_CHANCE = 0.2;

/** How many lights a room of `area` cells holds at most beyond its first: a hall about one in every 36 cells of floor. */
export function roomLightTarget(area: number, role: LightRole, cave: boolean): number {
  if (cave) return area >= 30 ? 2 : 1;
  if (role === 'hall') return Math.max(1, Math.round(area / 36));
  return area >= 40 ? 2 : 1;
}

/** Of a passage: the first light's distance from its end and the gap between lights, in cells, and the chance each is hung. */
export const PASSAGE = {
  built: { first: [1, 3], gap: [7, 10], chance: 0.65, short: 0.2 },
  cave: { first: [2, 4], gap: [9, 12], chance: 0.45, short: 0.15 },
} as const;
/** A passage shorter than this many cells takes one light at most. */
export const SHORT_PASSAGE = 5;

/** Rank in which rooms are lit while the floor's cap allows: halls first, then rooms with stairs, rooms, passages, crossings. */
export function lightRank(role: LightRole, stairs: boolean): number {
  if (role === 'hall') return 0;
  if (stairs) return 1;
  return { room: 2, dark: 2, passage: 3, junction: 4 }[role];
}
