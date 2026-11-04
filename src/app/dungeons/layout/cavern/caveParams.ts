/**
 * What a Cavern changes in the layout and how it shapes its rooms: its formation (`CaveVariant`) by
 * the tags or the seed, how round and how full its chambers grow, and the room and stair sizes a
 * cave can shape (no round rooms or colonnades, every room at least 3 cells across, stairwells 2
 * across).
 */

import type { CaveCharacter, CaveVariant } from '../../caveModel';
import { DEFAULT_SIZES, type DungeonParams, SPACIOUS_SIZES, WINDING_SIZES } from '../../params';
import type { Rng } from '../../rng';
import type { DungeonTag } from '../../tags';
import { type CharacterModifiers, characterModifiers, drawCharacter } from './veins/caveCharacter';
import { FORMATIONS, drawFormation, withFormation } from './veins/caveFormation';
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

type Shape = Pick<CaveShaping, 'gamma' | 'stretch' | 'fill'> & Partial<Pick<CaveShaping, 'sideWide'>>;

/**
 * How each formation shapes its chambers. Water rounds and smooths a river's caves; a fault tears
 * long, ragged, half-empty chasms along its faults (one or two directions, as every cave's: the
 * planner's rooms run both ways, which one direction could not stretch); gas eats round hollows
 * that fill their rock; a burrow is a round tube two cells wide throughout, as wide as its maker.
 */
const SHAPING: Readonly<Record<CaveVariant, Shape>> = {
  limestone: { gamma: [2, 3], stretch: 1.6, fill: [0.5, 0.75] },
  'lava-tube': { gamma: [4, 4], stretch: 3, fill: [0.6, 0.8] },
  underdark: { gamma: [4, 6], stretch: 1.3, fill: [0.62, 0.8] },
  fault: { gamma: [1.5, 2], stretch: 2.6, fill: [0.45, 0.65] },
  sulphuric: { gamma: [3, 4], stretch: 1.4, fill: [0.66, 0.82] },
  fungal: { gamma: [2, 3], stretch: 1.4, fill: [0.55, 0.75] },
  burrow: { gamma: [4, 6], stretch: 1.3, fill: [0.62, 0.8], sideWide: 1 },
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

/**
 * The formation the tags name, where they say what made the cave: lava a lava tube, a large,
 * spacious or deep cave the Underdark, acid sulphuric rot, overgrowth fungus, one way on a burrow,
 * a dry and crumbling cave a fault. Null where they name none, and the seed draws it.
 */
export function caveVariant(tags: ReadonlySet<DungeonTag>): CaveVariant | null {
  if (tags.has('lava')) return 'lava-tube';
  if (tags.has('large') || tags.has('spacious') || tags.has('deep')) return 'underdark';
  if (tags.has('acid')) return 'sulphuric';
  if (tags.has('overgrown')) return 'fungal';
  if (tags.has('string')) return 'burrow';
  if (tags.has('dry') && tags.has('crumbling')) return 'fault';
  return null;
}

/**
 * The variant of a cave laid out without the book's rules (a Forest's glades): a lava tube or the
 * Underdark by their tags, else the river's cave. The formations are a Cavern's alone (`withVeins`).
 */
function plainVariant(tags: ReadonlySet<DungeonTag>): CaveVariant {
  const named = caveVariant(tags);
  return named === 'lava-tube' || named === 'underdark' ? named : 'limestone';
}

/** A Cavern's params: everything from the tags, with the sizes a cave can shape and how it shapes them. */
export function caveParams(params: DungeonParams): DungeonParams {
  const variant = plainVariant(params.tags);
  return {
    ...params,
    rotundaFactor: 0,
    colonnadeFactor: 0,
    minRoomFloor: MIN_ROOM_FLOOR,
    stairAcross: STAIR_ACROSS,
    ...(variant === 'underdark' && { sizeStyles: SPACIOUS_SIZES }),
    cave: { variant, sideWide: SIDE_WIDE, ...SHAPING[variant] },
  };
}

/**
 * A Cavern's params with the book's rules: its character and most common size drawn from `rng`
 * (character first), its formation named by the tags or drawn from `formation` (the river's cave
 * where neither names one), its chamber sizes leaned by the tags, the character and the formation,
 * and no mirrored branches: a cave grows as its exits fall, never in matching pairs. A cave that
 * changes scale unpredictably does so in its chambers' tiers alone: more junctions left no room for
 * the main path's two-cell lane where they turned one after another. Its character sets how often a
 * door is a scree step. A fungal cave the tags chose no sizes for winds through more passages.
 */
export function withVeins(params: DungeonParams, rng: Rng, formation?: Rng): DungeonParams {
  const { cave } = params;
  if (!cave) return params;
  const character = drawCharacter(rng, params.tags);
  const variant = caveVariant(params.tags) ?? (formation ? drawFormation(formation) : 'limestone');
  const shaped = FORMATIONS[variant];
  const common = drawCommonTier(rng, shaped.tierWeights);
  const rules = withFormation(characterModifiers(character), shaped, params.tags.has('dry'));
  const tagged = tagTierRules(params.tags);
  const tiers: TierRules = {
    common,
    commonWeight: shaped.commonWeight ?? tagged.commonWeight,
    shift: tagged.shift + rules.tierStep,
    cap: tagged.cap,
    flat: rules.shiftingScale,
    ...(shaped.tierWeights && { weights: shaped.tierWeights }),
    ...(shaped.tierReach !== undefined && { reach: shaped.tierReach }),
  };
  const shape = { ...cave, ...SHAPING[variant] };
  return {
    ...params,
    ...(variant === 'fungal' && params.sizeStyles === DEFAULT_SIZES && { sizeStyles: WINDING_SIZES }),
    symmetry: params.symmetry.map(() => false),
    stepsChance: Math.min(MOST_STEPS, params.stepsChance * rules.steps),
    cave: { ...shape, variant, stretch: shape.stretch * FAULT_STRETCH, veins: { character, rules, tiers } },
  };
}
