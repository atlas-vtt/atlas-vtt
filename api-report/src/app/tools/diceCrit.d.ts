import type { DiceRules } from '../types/diceRulesTypes';
import type { RolledDie } from './diceFormula';
export type DiceCrit = 'high' | 'low' | null;
/**
 * Classifies a roll for the toast highlight and the result sound. Only the
 * default dice count: the first dice of the default roll's size, as many as it
 * rolls. A roll with fewer of them, such as a d8 under a d20 rule, never crits.
 * Dice rolled for an explosion are no default dice: the die that exploded is.
 */
export declare function getDiceCrit(rolls: readonly RolledDie[], rules: DiceRules): DiceCrit;
