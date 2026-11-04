/**
 * Dice sets that ship with Atlas: one for each way the built-in game systems
 * roll a bare bonus (`SystemRules.dice`). Their ids never change, since
 * collections, presets and templates name them.
 */

import type { AdvantageRule, DiceSet } from '../types/diceSetTypes';

/** Advantage and disadvantage by rolling one more die and keeping the best or the worst. */
const KEEP_BEST: Pick<DiceSet, 'advantage' | 'disadvantage'> = { advantage: { kind: 'keep' }, disadvantage: { kind: 'keep' } };
/** Draw Steel's edge and bane: 2 added or taken away. */
const EDGE: AdvantageRule = { kind: 'number', value: 2 };

/** Built-in set ids start with this; the vault's never do. */
export const BUILT_IN_DICE_SET_PREFIX = 'builtin:';

/** A d20, the highest face a critical success and a 1 a failure: what a collection without a system rolls. */
export const D20_DICE_SET_ID = 'builtin:d20';
export const D20_ROLL_UNDER_DICE_SET_ID = 'builtin:d20-roll-under';
export const PERCENTILE_DICE_SET_ID = 'builtin:d100-roll-under';
export const EXPLODING_D10_DICE_SET_ID = 'builtin:d10-exploding';
export const POWER_ROLL_DICE_SET_ID = 'builtin:power-roll';

export const BUILT_IN_DICE_SETS: readonly DiceSet[] = [
  { id: D20_DICE_SET_ID, name: 'd20', builtIn: true, dice: [{ count: 1, sides: 20 }], crit: 'natural', ...KEEP_BEST },
  { id: D20_ROLL_UNDER_DICE_SET_ID, name: 'd20 roll-under', builtIn: true, dice: [{ count: 1, sides: 20 }], crit: 'roll-under', ...KEEP_BEST },
  { id: PERCENTILE_DICE_SET_ID, name: 'd100 roll-under', builtIn: true, dice: [{ count: 1, sides: 100 }], crit: 'roll-under', ...KEEP_BEST },
  {
    id: EXPLODING_D10_DICE_SET_ID,
    name: 'd10 exploding',
    builtIn: true,
    dice: [{ count: 1, sides: 10 }],
    crit: 'natural',
    explode: { dice: 'default', repeats: false, highFaces: 1, lowFaces: 1 },
  },
  {
    id: POWER_ROLL_DICE_SET_ID,
    name: 'Power roll',
    builtIn: true,
    dice: [{ count: 2, sides: 10 }],
    crit: 'high-total',
    advantage: EDGE,
    disadvantage: EDGE,
  },
];

export function isBuiltInDiceSetId(id: string): boolean {
  return id.startsWith(BUILT_IN_DICE_SET_PREFIX);
}
