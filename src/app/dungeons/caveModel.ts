/**
 * What a Cavern's model holds beyond the rooms of every theme: the cave's variant and the
 * directions its faults run, and per floor the main path's way two cells wide, where the floor
 * lies low, where water stands and runs, and the fault lines that cross it.
 */

import type { CellPoint } from './model';

/**
 * What made the cave, and so what its passages, rock and water are like. The natural formations
 * are Veins of the Earth's: `limestone` is the river-cut cave (wet, smooth, dripstone; the id is
 * kept, saved models name it), a `fault` a dry jagged chasm system, `sulphuric` rock rotted upward
 * by gas, `fungal` passages split and widened by fungus, a `burrow` one tube some huge thing dug.
 * A lava tube comes with `lava`, the Underdark with large, spacious or deep caves. The book's built
 * routes (a mine, war works, a sunken gigastructure) are no caves: they are the Fortress's to build.
 */
export type CaveVariant = 'limestone' | 'lava-tube' | 'underdark' | 'fault' | 'sulphuric' | 'fungal' | 'burrow';

export const CAVE_VARIANTS: readonly CaveVariant[] = ['limestone', 'lava-tube', 'underdark', 'fault', 'sulphuric', 'fungal', 'burrow'];

/** How a stairwell joins two cave floors: a pitch (a shaft on a rope, an aven seen from below) or a scree slope. */
export type StairWay = 'pitch' | 'scree';

/** A fault line across a floor: its direction in radians from +x, through a point, in cells. */
export interface CaveFault {
  angle: number;
  x: number;
  y: number;
}

/**
 * How a way between two caves is passed, by its size against a human body (Veins of the Earth's
 * routes): a walk stands upright (over 4 ft), a crawl goes on all fours (about 3 ft), a squeeze on
 * the belly (1 to 2 ft), a letterbox squeeze flat with an arm forward (1 ft); a traverse, a sump
 * and a breakdown are the special routes a doubles roll gives, opposite the way in. A climb is a
 * pitch or chimney within the floor, 10 or 20 ft, roped: the way rises or drops without leaving it.
 */
export type CaveWay = 'walk' | 'crawl' | 'squeeze' | 'letterbox' | 'traverse' | 'sump' | 'breakdown' | 'climb';

export const CAVE_WAYS: readonly CaveWay[] = ['walk', 'crawl', 'squeeze', 'letterbox', 'traverse', 'sump', 'breakdown', 'climb'];

/** The ways too low or tight to walk, which a passage is along its whole length (`DungeonRoom.narrow`). */
export type NarrowWay = Extract<CaveWay, 'crawl' | 'squeeze' | 'letterbox'>;

/** The special routes: what a doubles roll makes of a cave's largest exit. */
export const SPECIAL_WAYS: readonly CaveWay[] = ['traverse', 'sump', 'letterbox', 'breakdown'];

/**
 * A cave's size, the book's eight tiers by how far the two dice land apart: a junction (cupboard
 * sized), a room (10 ft a side), two, three and four rooms (20, 30, 40 ft), a house (about 50 ft),
 * a hall (an office building, 80 to 100 ft) and a gargantuan cave (an environment in itself).
 */
export type CaveSizeTier = 'junction' | 'room' | 'double' | 'triple' | 'quadruple' | 'house' | 'hall' | 'gargantuan';

export const CAVE_SIZE_TIERS: readonly CaveSizeTier[] = ['junction', 'room', 'double', 'triple', 'quadruple', 'house', 'hall', 'gargantuan'];

/**
 * How a way up or down is passed, by its width as a way across is: a shaft (a walk's width, 5 ft
 * or more) is climbed or abseiled, a chimney (a crawl's) by bracing back against one wall and feet
 * against the other, and anything narrower is a vertical squeeze, as slow as one across.
 */
export type VerticalKind = 'shaft' | 'chimney' | 'squeeze';

/** A roof or floor exit, in feet: how wide it is, which says how it is passed, and how far it rises or drops (10 ft a turn of descent). */
export interface VerticalWay {
  width: number;
  depth: number;
}

/** The exits a chamber's roll put in its roof and floor, widest first: roof exits lead up, floor exits down. */
export interface CaveVerticalExits {
  up: VerticalWay[];
  down: VerticalWay[];
}

/** What the cave always does, one trait per cave: the first half of its character. */
export type CaveAlwaysTrait =
  | 'curves-back'
  | 'narrows-then-opens'
  | 'low-roofs'
  | 'maximum-size'
  | 'shifting-scale'
  | 'floor-exits'
  | 'roof-exits'
  | 'still-pools'
  | 'balanced-boulders'
  | 'flowstone-crust'
  | 'cracks-everywhere'
  | 'endless-drips'
  | 'up-and-down'
  | 'blocked-ways';

/** What the cave never does, one trait per cave: the second half of its character. */
export type CaveNeverTrait = 'dead-passages' | 'standing-room' | 'regular-caves' | 'calm-water' | 'sloped-walls' | 'plain-walk';

export const CAVE_ALWAYS_TRAITS: readonly CaveAlwaysTrait[] = ['curves-back', 'narrows-then-opens', 'low-roofs', 'maximum-size', 'shifting-scale', 'floor-exits', 'roof-exits', 'still-pools', 'balanced-boulders', 'flowstone-crust', 'cracks-everywhere', 'endless-drips', 'up-and-down', 'blocked-ways'];
export const CAVE_NEVER_TRAITS: readonly CaveNeverTrait[] = ['dead-passages', 'standing-room', 'regular-caves', 'calm-water', 'sloped-walls', 'plain-walk'];

/** A cave system's character, the book's "always ... but never ...": two rules every cave of it follows. */
export interface CaveCharacter {
  always: CaveAlwaysTrait;
  never: CaveNeverTrait;
}

/** The whole cave's geology. Whether it is lived in shows in its room types (a guard post at the mouth). */
export interface CaveModel {
  variant: CaveVariant;
  /** The one or two directions every fault of the cave runs in, radians from +x. */
  faults: number[];
  /** The cave's character; unset in a model made before caves had one, which reads as none. */
  character?: CaveCharacter;
}

export interface CaveFloor {
  /** The main path's way two cells wide on this floor. */
  lane: CellPoint[];
  /** By room id; lower is deeper. */
  heights: number[];
  faults: CaveFault[];
  /** Rooms that hold standing water. */
  basins: number[];
  /** Chains of rooms, uphill first, each ending in a basin; a lived-in cave's spring by its mouth is a chain of one. */
  streams: number[][];
  /** Basins whose water a dam holds (perched). */
  dams: number[];
}
