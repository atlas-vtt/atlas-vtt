/**
 * How a collection rolls dice: the roll a bare bonus is added to, how critical
 * results are recognised and which dice explode.
 */
/**
 * - `natural`: the highest face of a default die is a critical success, a 1 a failure (d20 systems).
 * - `roll-under`: a 1 is a critical success, the highest face a failure (Call of Cthulhu, Cairn).
 * - `doubles`: matching default dice are a critical success (Daggerheart's duality dice).
 * - `high-total`: default dice that add up to their highest total or one below it are a critical success (19 or 20 on Draw Steel's 2d10).
 * - `none`: no critical results.
 */
export type CritRule = 'natural' | 'roll-under' | 'doubles' | 'high-total' | 'none';
/** Which dice of a roll explode: its default dice, as for criticals, or every die. */
export type ExplodeScope = 'default' | 'all';
/**
 * Exploding dice: a die that shows one of its highest faces is rolled again and
 * the new die adds to the roll. Named after no game, so that every system can
 * be set: Savage Worlds is all dice, repeating; Cyberpunk RED the default die,
 * once, with one low face.
 */
export interface ExplodeRule {
    dice: ExplodeScope;
    /** Whether a die rolled for an explosion can explode in turn. */
    repeats: boolean;
    /** How many of a die's highest faces explode; 1 is the highest face alone. */
    highFaces: number;
    /** How many of its lowest faces roll again and subtract; 0 for none. */
    lowFaces: number;
}
export interface DiceRules {
    /** One dice group, `NdS`, e.g. `1d20` or `2d12`. A bare `+3` rolls `1d20+3`. */
    defaultRoll: string;
    /** Applies to the default dice of a roll only. */
    crit: CritRule;
    /** Unset: no die explodes. */
    explode?: ExplodeRule;
}
