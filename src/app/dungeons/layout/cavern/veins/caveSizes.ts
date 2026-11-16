/**
 * A cave chamber's size, by the book's tiers (Veins of the Earth): how far apart two dice land
 * gives a room, two, three or four rooms, a house, a hall or a gargantuan cave. The dice land near
 * each other most often, so small and middling caves are common and great ones rare; each cave has
 * a size it holds most of, and the tags lean every draw smaller or larger. A junction, the
 * cupboard-sized tier, is the planner's corridors and junctions and never drawn here.
 */

import type { CaveSizeTier } from '../../../caveModel';
import { type Rng, int, pick, weighted } from '../../../rng';
import type { DungeonTag } from '../../../tags';

/** A tier a chamber is drawn at: every tier but the junction, which the planner's passages are. */
export type ChamberTier = Exclude<CaveSizeTier, 'junction'>;

export const CHAMBER_TIERS: readonly ChamberTier[] = ['room', 'double', 'triple', 'quadruple', 'house', 'hall', 'gargantuan'];

/** A tier's floor in cells (a cell is 5 ft), walls excluded: across the axis it grows along (odd, so a door can stand in the middle), and along it. */
export interface TierFloor {
  across: readonly number[];
  along: readonly [number, number];
}

export const TIER_FLOORS: Readonly<Record<ChamberTier, TierFloor>> = {
  room: { across: [3], along: [3, 4] },
  double: { across: [5], along: [4, 6] },
  triple: { across: [7], along: [6, 8] },
  quadruple: { across: [9], along: [8, 10] },
  house: { across: [11], along: [10, 12] },
  hall: { across: [15], along: [14, 18] },
  gargantuan: { across: [21, 23], along: [20, 26] },
};

/** Chambers of each tier per hundred: two dice touching or a finger apart most often, an arm's length rarely. */
export const TIER_WEIGHTS: Readonly<Record<ChamberTier, number>> = { room: 24, double: 28, triple: 20, quadruple: 12, house: 10, hall: 4, gargantuan: 2 };

/** How much more often a cave's own common size comes up; an ordered cave keeps to it more, a chaotic one has none. */
const COMMON_WEIGHT = 2;
const ORDERED_COMMON_WEIGHT = 4;
/** How much more often a chamber takes a size on the other side of its parent's, in a cave that never lets its caves flow regularly. */
const LEAN_WEIGHT = 3;
/** The tiers a cave that changes scale draws twice as often: cramped hollows beside vast halls. */
const FLAT_EXTREMES: ReadonlySet<ChamberTier> = new Set<ChamberTier>(['room', 'gargantuan']);
/** The fewest normal rooms a floor may have to hold a gargantuan cave: one alone would be the whole floor. */
export const GARGANTUAN_FLOOR_ROOMS = 6;

export function tierIndex(tier: ChamberTier): number {
  return CHAMBER_TIERS.indexOf(tier);
}

function tierAt(index: number): ChamberTier {
  return CHAMBER_TIERS[Math.max(0, Math.min(CHAMBER_TIERS.length - 1, index))]!;
}

/** What leans a cave's chamber sizes: its tags and its character. */
export interface TierRules {
  /** The cave's most common size, weighted up by `commonWeight`; unset, none. */
  common?: ChamberTier;
  commonWeight?: number;
  /** Tiers every draw moves up (or down, negative). */
  shift: number;
  /** The largest tier a chamber may be. */
  cap: ChamberTier;
  /** Every tier as likely as any other, and the tiniest and gargantuan caves twice that: a cave that changes scale unpredictably. */
  flat: boolean;
  /** The chambers of each tier per hundred, where the cave's formation holds other sizes than the book's; unset, `TIER_WEIGHTS`. */
  weights?: Readonly<Record<ChamberTier, number>>;
  /** How many tiers from the common size a chamber may be drawn: a burrow is as wide as its maker throughout. Unset, any. */
  reach?: number;
}

/** One draw's own circumstances on its floor. */
export interface TierDraw {
  /** A gargantuan cave may stand on this floor: none yet, and rooms enough. */
  gargantuan: boolean;
  /** The size of the chamber this one is reached from, where the cave leans away from it. */
  awayFrom?: ChamberTier;
  /** Entered by a squeeze in a cave that narrows and then opens: one tier larger. */
  opens?: boolean;
  /** The room is a chamber whatever its size style says: the one a cave's mouth opens into. */
  chamber?: boolean;
}

/**
 * Small and cramped caves lean a tier smaller, and a small one never grows past a house; large and
 * spacious ones lean a tier larger. An ordered cave keeps to its common size more, a chaotic one
 * holds to none.
 */
export function tagTierRules(tags: ReadonlySet<DungeonTag>): Required<Pick<TierRules, 'shift' | 'cap' | 'commonWeight'>> {
  const down = tags.has('small') || tags.has('cramped') ? 1 : 0;
  const up = tags.has('large') || tags.has('spacious') ? 1 : 0;
  const commonWeight = tags.has('chaotic') ? 1 : tags.has('ordered') ? ORDERED_COMMON_WEIGHT : COMMON_WEIGHT;
  return { shift: up - down, cap: tags.has('small') ? 'house' : 'gargantuan', commonWeight };
}

/** Whether `tier` lies on the other side of `from`: small beside a chamber of four rooms or more, large beside one of two or fewer. */
function across(from: ChamberTier, tier: ChamberTier): boolean {
  const [big, small] = [tierIndex('quadruple'), tierIndex('double')];
  return (tierIndex(from) >= big && tierIndex(tier) <= small) || (tierIndex(from) <= small && tierIndex(tier) >= big);
}

function tierWeights(rules: TierRules, draw: TierDraw): (readonly [ChamberTier, number])[] {
  return CHAMBER_TIERS.map((tier) => {
    const base = rules.flat ? (FLAT_EXTREMES.has(tier) ? 2 : 1) : (rules.weights ?? TIER_WEIGHTS)[tier];
    const common = tier === rules.common ? (rules.commonWeight ?? COMMON_WEIGHT) : 1;
    const lean = draw.awayFrom !== undefined && across(draw.awayFrom, tier) ? LEAN_WEIGHT : 1;
    const within = rules.reach === undefined || rules.common === undefined || Math.abs(tierIndex(tier) - tierIndex(rules.common)) <= rules.reach ? 1 : 0;
    return [tier, base * common * lean * within] as const;
  });
}

/** A chamber's tier: one weighted draw, moved by the cave's shift, held under its cap and a floor's one gargantuan cave. */
export function drawTier(rng: Rng, rules: TierRules, draw: TierDraw): ChamberTier {
  const drawn = weighted(rng, tierWeights(rules, draw));
  const moved = tierAt(tierIndex(drawn) + rules.shift + (draw.opens ? 1 : 0));
  const capped = tierIndex(moved) > tierIndex(rules.cap) ? rules.cap : moved;
  return capped === 'gargantuan' && !draw.gargantuan ? 'hall' : capped;
}

/** A chamber of this tier, walls included as the planner sizes rooms: across + 2 wide (odd), along + 2 deep. */
export function tierSize(rng: Rng, tier: ChamberTier): { width: number; depth: number } {
  const floor = TIER_FLOORS[tier];
  return { width: pick(rng, floor.across) + 2, depth: int(rng, floor.along[0], floor.along[1]) + 2 };
}

/** The cave's most common size, drawn once as any chamber's is, among the sizes its formation holds. */
export function drawCommonTier(rng: Rng, weights: Readonly<Record<ChamberTier, number>> = TIER_WEIGHTS): ChamberTier {
  return weighted(rng, CHAMBER_TIERS.map((tier) => [tier, weights[tier]] as const));
}

/** Whether a floor of `across` × `along` cells is one a chamber of `tier` is drawn at. */
export function fitsTier(tier: ChamberTier, across: number, along: number): boolean {
  const floor = TIER_FLOORS[tier];
  return floor.across.includes(across) && along >= floor.along[0] && along <= floor.along[1];
}

/**
 * The tier a chamber sized another way reaches (the boss room, grown as large as the rock allows; the
 * room round a landing; a five-room dungeon's reward room): the largest whose least floor it holds.
 */
export function tierOfFloor(across: number, along: number): ChamberTier {
  const reached = CHAMBER_TIERS.filter((tier) => TIER_FLOORS[tier].across[0]! <= across && TIER_FLOORS[tier].along[0] <= along);
  return reached.at(-1) ?? 'room';
}
