/**
 * Parses and rolls dice formulas such as `2d6+3`, `d20+2d6` or `2d6-1d4`.
 * Every term carries its own sign, so the `+2` of `+2d6` is a dice count and
 * never a modifier, and subtracted dice subtract.
 *
 * A dice term may explode (`diceExplosion.ts`): by its own notation, written
 * as Obsidian's Dice Roller writes it since statblocks use that (`2d6!` once,
 * `2d6!3` up to three times, `2d6!i` again and again; `!!` reads the same), or
 * by the collection's rule.
 */
import type { DiceRules } from '../types/diceRulesTypes';
import type { ParsedFormula } from './parseFormula';
export interface RolledDie {
    /** e.g. `d20`. */
    die: string;
    value: number;
    max: number;
    /** The die subtracts: it belongs to a subtracted term, e.g. the d4 of `2d6-1d4`, or to an explosion downwards. */
    negative?: true;
    /** The die was rolled because the die before it exploded. */
    exploded?: true;
    /** The colour the die was thrown in (`#rrggbb`), e.g. one an extension reports, or one picked in Atlas's dice tray (`dice.registerColours`); shown with its die, never counted. */
    color?: string;
    /** That colour's name, e.g. "Fire": plain text (no markup) of at most 32 characters, trimmed. A tag that is not well-formed is dropped where a roll enters Atlas, never the roll. */
    colorName?: string;
}
export interface RolledFormula {
    rolls: RolledDie[];
    modifiers: number;
    total: number;
}
/**
 * Rolls an already validated formula and adds up the result. `rules` are the
 * collection's: its exploding rule
 * and the default roll that says which dice a default-dice rule means, the
 * first added dice of its size, as many as it rolls (as for criticals).
 */
export declare function rollFormula(formula: ParsedFormula, random?: () => number, rules?: Pick<DiceRules, 'defaultRoll' | 'explode'>): RolledFormula;
