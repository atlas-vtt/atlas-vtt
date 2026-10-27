/**
 * What the tags do to layout, water and props, and how each floor differs from the entrance floor.
 * Every number a tag or a floor changes lives here, so their effect can be read in one place.
 */

import type { FloorRise } from './floors/floorStack';
import type { CaveShaping } from './layout/cavern/caveParams';
import { chance, stream } from './rng';
import { readTags, rivalsOf, withTag, type DungeonTag } from './tags';

/**
 * Room sizes, walls included: 0 small room, 1 large room, 2 corridor, 3 junction.
 * Width runs across the axis a room grows along, depth along it.
 */
export type SizeStyle = 0 | 1 | 2 | 3;

export interface DungeonParams {
  tags: ReadonlySet<DungeonTag>;
  /** Normal rooms (not corridors or junctions). */
  minRooms: number;
  maxRooms: number;
  /** Drawn per room: true mirrors its side branches. */
  symmetry: readonly boolean[];
  sizeStyles: readonly SizeStyle[];
  /** One exit per room. */
  string: boolean;
  /** Half of the room-sized rooms come out square, so they can be round. */
  squareRooms: boolean;
  stepsChance: number;
  rotundaFactor: number;
  colonnadeFactor: number;
  /** Secret wings: how many to aim for. */
  secretWings: { chance: number; extra: number };
  /** Chance that a loop door is a secret door, a shortcut only the observant find. */
  secretLoopChance: number;
  /** Weight of a secret door for the second entrance, against an opening's 2 and a door's 1. */
  secretEntranceWeight: number;
  /** Five-room dungeons: the chance the reward room lies behind a secret door. */
  secretReward: number;
  /** 0..1, or null to roll one. */
  waterLevel: number | null;
  /** Chance of a pool in a room the architecture suits for one (wet and flooded dungeons). */
  poolChance: number;
  crackChance: number;
  shatteredChance: number;
  /** Floor cells per expected stone. */
  rubbleArea: number;
  /** The narrowest floor a normal room has either way; unset, any. */
  minRoomFloor?: number;
  /** The narrowest a stairwell is across; unset, 1. */
  stairAcross?: number;
  /** How many cells across corridors and junctions grow, fitted once the floor is laid (`layout/passageWidths.ts`); unset, one. */
  passageFloor?: number;
  /** The most round rooms a floor has, and the share of its rooms they may be at most; unset, as many as the rolls give. */
  roundRooms?: { most: number; share: number };
  /** How a Cavern shapes its rooms; set only in a Cavern's params. */
  cave?: CaveShaping;
}

/** Tags a dungeon gets by chance, each unless a tag it holds rules it out. */
const CHANCE_TAGS: readonly { tag: DungeonTag; chance: number; unless: readonly DungeonTag[] }[] = [
  { tag: 'string', chance: 0.05, unless: ['winding'] },
  { tag: 'deep', chance: 0.05, unless: [] },
];

/**
 * The tags a dungeon is built with: the GM's, and those a roll of the layout stream adds. Every
 * roll is made whatever the tags, so asking for one tag never shifts the rolls of the others.
 */
export function dungeonTags(seed: number, requested: readonly string[]): DungeonTag[] {
  const rng = stream(seed, 'layout', 'tags');
  return CHANCE_TAGS.reduce<DungeonTag[]>((tags, { tag, chance: p, unless }) => {
    const hit = chance(rng, p);
    const blocked = [...rivalsOf(tag), ...unless].some((t) => tags.includes(t));
    return hit && !blocked && !tags.includes(tag) ? withTag(tags, tag) : tags;
  }, readTags(requested));
}

const DEFAULT_SIZES: readonly SizeStyle[] = [0, 0, 0, 1, 2, 3, 3];
/** More large rooms: what `spacious` gives, and the Underdark. */
export const SPACIOUS_SIZES: readonly SizeStyle[] = [0, 0, 1, 1, 2, 3];

function sizeStyles(has: (tag: DungeonTag) => boolean): readonly SizeStyle[] {
  if (has('compact')) return [0, 0, 0, 1];
  if (has('winding')) return [0, 0, 1, 2, 2, 3, 3, 3, 3];
  if (has('cramped')) return [0, 0, 0, 2, 3, 3];
  if (has('spacious')) return SPACIOUS_SIZES;
  return DEFAULT_SIZES;
}

function roomRange(has: (tag: DungeonTag) => boolean): [number, number] {
  if (has('small')) return [3, 6];
  if (has('medium')) return [6, 12];
  if (has('large')) return [12, 25];
  return [6, 15];
}

/** The share of rooms whose side branches mirror each other. */
function symmetryShare(has: (tag: DungeonTag) => boolean): number {
  if (has('string') || has('chaotic')) return 0;
  if (has('ordered')) return 6 / 7;
  return 4 / 5;
}

function waterLevel(has: (tag: DungeonTag) => boolean): number | null {
  if (has('dry')) return 0;
  if (has('wet')) return 0.3;
  if (has('flooded')) return 0.6;
  return null;
}

function secretWings(has: (tag: DungeonTag) => boolean): DungeonParams['secretWings'] {
  if (has('no-secrets') || has('string')) return { chance: 0, extra: 0 };
  if (has('secret')) return { chance: 1, extra: 0.75 };
  return { chance: 0.5, extra: 0.15 };
}

function secretLoopChance(has: (tag: DungeonTag) => boolean): number {
  if (has('no-secrets') || has('string')) return 0;
  return has('secret') ? 0.4 : 0.15;
}

/** Ten draws of which `share` mirror. */
function symmetryDraws(share: number): boolean[] {
  const mirrored = Math.round(share * 10);
  return Array.from({ length: 10 }, (_, k) => k < mirrored);
}

export function dungeonParams(tags: readonly DungeonTag[]): DungeonParams {
  const set = new Set(tags);
  const has = (tag: DungeonTag): boolean => set.has(tag);
  const [minRooms, maxRooms] = roomRange(has);
  const crumbling = has('crumbling');
  return {
    tags: set,
    minRooms,
    maxRooms,
    symmetry: symmetryDraws(symmetryShare(has)),
    sizeStyles: sizeStyles(has),
    string: has('string'),
    squareRooms: has('round'),
    stepsChance: has('flat') ? 0 : has('deep') ? 0.5 : 0.1,
    rotundaFactor: has('square') ? 0 : has('round') ? 5 : 1,
    colonnadeFactor: has('colonnades') ? 2 : 1,
    secretWings: secretWings(has),
    secretLoopChance: secretLoopChance(has),
    secretEntranceWeight: has('no-secrets') || has('string') ? 0 : has('secret') ? 2 : 1,
    secretReward: 0,
    waterLevel: waterLevel(has),
    poolChance: has('flooded') ? 0.35 : has('wet') ? 0.25 : 0,
    crackChance: crumbling ? 1 / 3 : 0.125,
    shatteredChance: crumbling ? 0.1 : 0.0125,
    rubbleArea: crumbling ? 2 : 4,
  };
}

/** The fewest normal rooms any floor has. */
export const MIN_FLOOR_ROOMS = 3;
/** How much smaller each floor is than the one before, as a share of the entry floor. */
const SHRINK_PER_FLOOR = 0.18;
/** How much of the symmetry, round rooms and colonnades each floor further down loses. */
const ROUGHEN_PER_FLOOR = 0.35;

/**
 * The params of floor `floor` (0 the entry floor), whose floors stack the way `rise` says. Every
 * later floor has fewer rooms (never fewer than three). Digging gets harder further down, so a
 * floor below the entrance mirrors less, is less often round or colonnaded, and has steps more
 * often, as the ground falls away; a storey above it is built as the entrance floor is.
 */
export function floorParams(params: DungeonParams, floor: number, rise: FloorRise): DungeonParams {
  if (floor === 0) return params;
  const size = 1 - SHRINK_PER_FLOOR * floor;
  const minRooms = Math.max(MIN_FLOOR_ROOMS, Math.round(params.minRooms * size));
  const smaller = { ...params, minRooms, maxRooms: Math.max(minRooms, Math.round(params.maxRooms * size)) };
  if (rise === 'up') return smaller;
  const rough = Math.max(0, 1 - ROUGHEN_PER_FLOOR * floor);
  const mirrored = params.symmetry.filter(Boolean).length / params.symmetry.length;
  return {
    ...smaller,
    symmetry: symmetryDraws(mirrored * rough),
    rotundaFactor: params.rotundaFactor * rough,
    colonnadeFactor: params.colonnadeFactor * rough,
    stepsChance: params.stepsChance > 0 ? Math.min(0.6, params.stepsChance * 1.5) : 0,
  };
}
