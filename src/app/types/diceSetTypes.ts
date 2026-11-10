/**
 * Dice sets: named presets of the dice a bare bonus is rolled with ("+6"),
 * kept in a library the whole vault shares. A set names its dice, each group
 * with a name and a colour ("Sun", "Moon"), and how they roll: the critical
 * rule and exploding dice, as a collection's dice rules always said.
 */

import type { CritRule, ExplodeRule } from './diceRulesTypes';

/** One group of a set's dice: `count` dice of `sides`, e.g. one d12 named "Sun" in gold. */
export interface DiceSetDie {
  count: number;
  sides: number;
  /** Shown beside the die's number on the roll ("Sun 9"); unset shows the number alone. */
  name?: string;
  /** `#rrggbb`; the 3D die and its badge take it. Unset keeps the dice look of the settings. */
  colour?: string;
}

/** Which way a roll is helped or hindered: advantage, or disadvantage. */
export type AdvantageSide = 'advantage' | 'disadvantage';

/**
 * What advantage (or disadvantage) does to a roll of the set's dice; one per
 * side, an object so that later rules (stacking, a most) can join it.
 *
 * - `keep`: one more of the set's first die is rolled, and the best of the
 *   original count are kept (the worst for disadvantage). "Best" follows the
 *   critical rule: a roll-under set keeps the lowest. `tensOnly` on a d100: the
 *   extra die rolls only its tens and shares the units (Call of Cthulhu's bonus
 *   and penalty dice).
 * - `die`: a die of its own is rolled and added (subtracted for disadvantage),
 *   with a name and colour like the set's dice, a d6 for instance.
 * - `number`: a fixed number is added (subtracted), Draw Steel's edge of 2.
 */
export type AdvantageRule =
  | { kind: 'keep'; tensOnly?: true }
  | { kind: 'die'; sides: number; name?: string; colour?: string }
  | { kind: 'number'; value: number };

export type AdvantageKind = AdvantageRule['kind'];

/** What rolling needs of a set: its dice and their rules. A collection's dice rules read as one (`rollingRules`). */
export interface RollingDice {
  dice: readonly DiceSetDie[];
  /** Applies to the set's own dice of a roll only. */
  crit: CritRule;
  /** Unset: no die explodes. */
  explode?: ExplodeRule;
  /** Unset: the set rolls no differently with advantage. */
  advantage?: AdvantageRule;
  /** Unset: the set rolls no differently with disadvantage. */
  disadvantage?: AdvantageRule;
}

export interface DiceSet extends RollingDice {
  /** The identity: never changes, collections and templates name it. Built-ins start with `builtin:`. */
  id: string;
  name: string;
  /** Shipped with Atlas: read-only, its id the same in every vault and release. */
  builtIn: boolean;
  /** Written by a newer Atlas: read, never written. */
  readOnly?: true;
}

/** Which set a roll was made with, where it is not the collection's own. */
export interface RolledWithSet {
  id: string;
  name: string;
}
