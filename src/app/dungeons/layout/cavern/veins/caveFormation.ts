/**
 * What made a cave, as Veins of the Earth's natural routes make passages: a river (the cave every
 * other one is measured against), a fault, sulphuric gas, fungus or a burrowing beast. The tags
 * name it where they say what made the cave (`caveVariant`); else the seed draws one in the book's
 * order of likelihood, from a stream of its own, so every other roll of the cave stays where it
 * was. Sulphuric rot comes from the `acid` tag alone: it fills the cave with acid, and a GM who
 * asked for no acid must find none. Each formation is a few numbers the layout reads beside the
 * cave's character: how often it loops and branches, where its roof and floor exits lead, how much
 * water it holds, how many fault lines cross it and which chamber sizes it holds. A lava tube and
 * the Underdark come from their tags alone and change none of these.
 */

import type { CaveVariant } from '../../../caveModel';
import { type Rng, weighted } from '../../../rng';
import type { CharacterModifiers } from './caveCharacter';
import type { ChamberTier } from './caveSizes';

/** The book's odds among its natural routes: a river 5, a fault 4, fungus 2, a burrow 1. Mines, war works and gigastructures are built, the Fortress's. */
const FORMATION_ODDS: readonly (readonly [CaveVariant, number])[] = [
  ['limestone', 5],
  ['fault', 4],
  ['fungal', 2],
  ['burrow', 1],
];
/** A cave's formation where its tags name none. */
export function drawFormation(rng: Rng): CaveVariant {
  return weighted(rng, FORMATION_ODDS);
}

/** What a formation does to the layout, beside what its character does. */
export interface FormationLayout {
  /** Times as many loops. */
  loops: number;
  /** The least chance of each side way off a passage. */
  passageSides: number;
  /** The share of roof and floor exits that lead up. */
  upShare: number;
  /** Times as many basins. */
  basins: number;
  /** Times as many fault lines across a floor. */
  faultLines: number;
  /** The least water level, unless the GM gave one or the cave is dry. */
  leastWater: number;
  /**
   * One way on from every room, the other walls held back in case it is blocked, and no loop but
   * the one on its main way. Not the `string` tag's layout: that one places no boss room where it
   * ends in a passage, and a burrow ends at its maker's den.
   */
  oneWayOn: boolean;
  /** The chamber sizes it holds, per hundred, in place of the book's; unset, the book's. */
  tierWeights?: Readonly<Record<ChamberTier, number>>;
  /** How many tiers from its common size a chamber may be; unset, any. */
  tierReach?: number;
  /** How much more often its common size comes up; unset, as the tags say. */
  commonWeight?: number;
}

const PLAIN: FormationLayout = { loops: 1, passageSides: 0, upShare: 0.5, basins: 1, faultLines: 1, leastWater: 0, oneWayOn: false };

/** Fungus leaves caves of a middling size: one to three rooms, seldom more. */
const FUNGAL_TIERS: Readonly<Record<ChamberTier, number>> = { room: 30, double: 34, triple: 26, quadruple: 6, house: 3, hall: 1, gargantuan: 0 };

export const FORMATIONS: Readonly<Record<CaveVariant, FormationLayout>> = {
  limestone: PLAIN,
  'lava-tube': PLAIN,
  underdark: PLAIN,
  // A dry chasm system: torn open along its fault, cracked twice over, its exits falling deeper, its water rare.
  fault: { ...PLAIN, upShare: 0.25, basins: 0.5, faultLines: 2 },
  // Gas rises and rots the rock above it: its ways lead up.
  sulphuric: { ...PLAIN, upShare: 0.75 },
  // Fungus splits the rock like a tree whose branches meet again: more side ways and loops, damp, few lakes.
  fungal: { ...PLAIN, loops: 2, passageSides: 0.75, basins: 0.5, leastWater: 0.15, tierWeights: FUNGAL_TIERS },
  // One tube the size of its maker: one way on, its chambers all about one size.
  burrow: { ...PLAIN, oneWayOn: true, tierReach: 1, commonWeight: 6 },
};

/**
 * A character's numbers as the formation bends them: loops, branches, water and cracks multiply, a
 * share of exits leads up, and a cave with one way on has no side ways off its passages.
 */
export function withFormation(rules: CharacterModifiers, formation: FormationLayout, dry: boolean): CharacterModifiers {
  return {
    ...rules,
    loops: rules.loops * formation.loops,
    passageSides: formation.oneWayOn ? 0 : Math.max(rules.passageSides, formation.passageSides),
    exits: { ...rules.exits, upShare: formation.upShare },
    leastWater: dry ? rules.leastWater : Math.max(rules.leastWater, formation.leastWater),
    basins: rules.basins * formation.basins,
    faultLines: rules.faultLines * formation.faultLines,
    oneWayOn: formation.oneWayOn,
  };
}

