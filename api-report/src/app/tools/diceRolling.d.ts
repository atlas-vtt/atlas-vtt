import { type FormulaErrorCode } from './parseFormula';
import type { DiceRules } from '../types/diceRulesTypes';
import type { DiceRollResult } from '../types/diceTypes';
export type { DiceRollResult } from '../types/diceTypes';
/** The dice of Atlas's dice tray, in tray order. */
export declare const DICE_TYPES: readonly ["d4", "d6", "d8", "d10", "d12", "d20", "d100"];
export type DieType = typeof DICE_TYPES[number];
/** How many of each die are picked; a die left out counts 0. */
export type DiceSelection = Partial<Record<DieType, number>>;
export declare function isDieType(value: unknown): value is DieType;
/** The picked dice in the order they were picked, e.g. `['2d6', 'd20']`; dice with no count are left out. */
export declare function diceTerms(selection: Readonly<Partial<Record<string, number>>>): string[];
/** The formula Atlas rolls for a selection and a modifier, e.g. "2d6+d20-1"; empty without dice. */
export declare function diceFormula(selection: Readonly<Partial<Record<string, number>>>, modifier?: number): string;
/** A formula Atlas does not roll (`parseFormula`): `code` says why. Nothing was rolled. */
export declare class DiceFormulaError extends Error {
    readonly formula: string;
    readonly code: FormulaErrorCode;
    constructor(formula: string, code: FormulaErrorCode);
}
/**
 * Rolls `formula` with `random` for the dice (`diceFormula.ts`), by the collection's `rules` when
 * given: its exploding dice and, for the result, its critical rule. The id stays random however
 * the dice are rolled, so rolls made in the same millisecond never share one. Throws
 * `DiceFormulaError`, before any die is rolled, for a formula Atlas's dice tray would refuse.
 */
export declare function rollFormula(formula: string, random?: () => number, now?: number, rules?: DiceRules): DiceRollResult;
/** A roll for a token hidden from players keeps its ability and result, not the token's name or portrait. */
export declare function withoutHiddenToken(result: DiceRollResult, isTokenHidden: (tokenId: string) => boolean): DiceRollResult;
/** The dice log as a map file keeps it: rolls by someone other than the GM stay in the live log only. */
export declare function persistableDiceLog(log: readonly DiceRollResult[]): DiceRollResult[];
/** The name a roll shows: the person who rolled it, or a statblock roll's token; null for the GM's own. */
export declare function rollerName(result: DiceRollResult): string | null;
/**
 * Rolls `formula` by a collection's `rules`, as Atlas's dice tray does: one without dice (`+3`), or an empty one, is
 * added to the rules' default roll. The formula as given and the completed one are both checked before any die is
 * rolled, so completing a bonus cannot pass text or limits the tray refuses; throws `DiceFormulaError` then.
 */
export declare function rollByRules(formula: string, rules: DiceRules, random?: () => number, now?: number): DiceRollResult;
