/**
 * What a Cavern changes in the layout and how it shapes its rooms: its variant by the tags, how
 * round and how full its chambers grow, and the room and stair sizes a cave can shape (no round
 * rooms or colonnades, every room at least 3 cells across, stairwells 2 across).
 */

import type { CaveCharacter, CaveVariant } from '../../caveModel';
import { type DungeonParams, SPACIOUS_SIZES } from '../../params';
import type { Rng } from '../../rng';
import type { DungeonTag } from '../../tags';
import { type CharacterModifiers, characterModifiers, drawCharacter } from './veins/caveCharacter';
import { type TierRules, drawCommonTier, tagTierRules } from './veins/caveSizes';

/** A Cavern's own rules from Veins of the Earth: its character, what that does, and how its chambers are sized. */
export interface VeinsShaping {
  character: CaveCharacter;
  rules: CharacterModifiers;
  tiers: TierRules;
}

export interface CaveShaping {
  variant: CaveVariant;
  /** How round chambers grow (`pow(c, gamma)`), drawn from this range per chamber. */
  gamma: readonly [number, number];
  /** How strongly chambers stretch along a fault. */
  stretch: number;
  /** The share of a chamber's rectangle it fills. */
  fill: readonly [number, number];
  /** The chance a side passage is two cells wide. */
  sideWide: number;
  /** The book's cave rules; set for a Cavern alone, so a Forest's glades, laid out as a cave, keep their own. */
  veins?: VeinsShaping;
}

const SHAPING: Readonly<Record<CaveVariant, Omit<CaveShaping, 'variant' | 'sideWide'>>> = {
  limestone: { gamma: [2, 3], stretch: 1.6, fill: [0.5, 0.75] },
  'lava-tube': { gamma: [4, 4], stretch: 3, fill: [0.6, 0.8] },
  underdark: { gamma: [4, 6], stretch: 1.3, fill: [0.62, 0.8] },
};
const SIDE_WIDE = 0.4;
/** The narrowest floor a cave's normal room has either way, and a stairwell across. */
const MIN_ROOM_FLOOR = 3;
const STAIR_ACROSS = 2;
/**
 * How much more strongly a chamber drawn at a size tier stretches along its fault: a tier's floor
 * is near square, so the fault, not the rectangle, makes a chamber long.
 */
const FAULT_STRETCH = 1.75;
/** The most often a door between two rooms is a scree step, however often the character asks for one. */
const MOST_STEPS = 0.6;

/** Lava makes a lava tube; a large, spacious or deep cave is the Underdark; else limestone. */
export function caveVariant(tags: ReadonlySet<DungeonTag>): CaveVariant {
  if (tags.has('lava')) return 'lava-tube';
  if (tags.has('large') || tags.has('spacious') || tags.has('deep')) return 'underdark';
  return 'limestone';
}

/** A Cavern's params: everything from the tags, with the sizes a cave can shape and how it shapes them. */
export function caveParams(params: DungeonParams): DungeonParams {
  const variant = caveVariant(params.tags);
  return {
    ...params,
    rotundaFactor: 0,
    colonnadeFactor: 0,
    minRoomFloor: MIN_ROOM_FLOOR,
    stairAcross: STAIR_ACROSS,
    ...(variant === 'underdark' && { sizeStyles: SPACIOUS_SIZES }),
    cave: { variant, ...SHAPING[variant], sideWide: SIDE_WIDE },
  };
}

/**
 * A Cavern's params with the book's rules: its character and most common size drawn from `rng`
 * (character first), its chamber sizes leaned by the tags and the character, and no mirrored
 * branches: a cave grows as its exits fall, never in matching pairs. A cave that changes scale
 * unpredictably does so in its chambers' tiers alone: more junctions left no room for the main
 * path's two-cell lane where they turned one after another. Its character sets how often a door
 * is a scree step.
 */
export function withVeins(params: DungeonParams, rng: Rng): DungeonParams {
  const { cave } = params;
  if (!cave) return params;
  const character = drawCharacter(rng, params.tags);
  const common = drawCommonTier(rng);
  const rules = characterModifiers(character);
  const tagged = tagTierRules(params.tags);
  const tiers: TierRules = { common, commonWeight: tagged.commonWeight, shift: tagged.shift + rules.tierStep, cap: tagged.cap, flat: rules.shiftingScale };
  return {
    ...params,
    symmetry: params.symmetry.map(() => false),
    stepsChance: Math.min(MOST_STEPS, params.stepsChance * rules.steps),
    cave: { ...cave, stretch: cave.stretch * FAULT_STRETCH, veins: { character, rules, tiers } },
  };
}
