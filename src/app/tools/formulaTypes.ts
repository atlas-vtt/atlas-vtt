/** What `parseFormula` reads a dice formula as. */

import type { Comparison } from './diceComparison';
import type { Explosion } from './diceExplosion';

export const FORMULA_LIMITS = {
  characters: 100,
  /**
   * A bonus completed with the dice set's dice: what was written (at most `characters`) and the dice
   * put before it. A shared roll's formula is read up to as many (`MAX_ROLL_FORMULA`).
   */
  completed: 160,
  /** Dice terms and constants. */
  terms: 20,
  /** Dice before rerolls and explosions, which each die caps for itself. */
  dice: 100,
  faces: 1000,
  /** Nested parentheses. */
  depth: 8,
  /** The largest total a formula may ever reach, either way. */
  total: 1_000_000_000,
} as const;

export type FormulaErrorCode = 'syntax' | 'length' | 'terms' | 'dice' | 'faces' | 'depth' | 'modifier' | 'total';
export interface FormulaError { readonly ok: false; readonly code: FormulaErrorCode }

/** Rolls a die again while it shows a face that meets `when`, at most `limit` times. */
export interface DiceReroll {
  readonly when: Comparison;
  readonly limit: number;
}

/** Keeps or drops the `count` highest or lowest dice of a term. */
export interface DiceKeep {
  readonly mode: 'keep' | 'drop';
  readonly end: 'highest' | 'lowest';
  readonly count: number;
  /**
   * A die and the dice its explosion rolled are ranked as one, by what they
   * add up to, and kept or dropped together. Never written; advantage sets it,
   * so that its extra die never makes an explosion count for less.
   */
  readonly chains?: true;
}

/** Counts the dice that meet `when` instead of adding them up. */
export interface DiceTally {
  readonly counts: 'successes' | 'failures';
  readonly when: Comparison;
}

export interface DiceTerm {
  readonly kind: 'dice';
  readonly count: number;
  /** The highest face: 1 for a Fate die, whose faces are −1, 0 and +1. */
  readonly faces: number;
  readonly fate?: true;
  /** The term is subtracted: an odd number of minus signs leads to it. */
  readonly negative: boolean;
  readonly reroll?: DiceReroll;
  /** The term's own explosion; without it the collection's rule applies. */
  readonly explode?: Explosion;
  readonly keep?: DiceKeep;
  readonly tally?: DiceTally;
  readonly label?: string;
  /**
   * The term's last die rolls only its tens and shares the units of its
   * first: Call of Cthulhu's bonus and penalty die. Never written; advantage sets it.
   */
  readonly sharedUnits?: true;
  /** The die advantage or disadvantage added. Never written; advantage sets it. */
  readonly advantage?: true;
}

export interface ConstantTerm {
  readonly kind: 'constant';
  /** Never negative: the sign is the term's `negative`. */
  readonly value: number;
  readonly negative: boolean;
  readonly label?: string;
}

export type FormulaTerm = DiceTerm | ConstantTerm;

export type FormulaOperator = '+' | '-' | '*' | '/';

export type FormulaNode =
  | { readonly kind: 'term'; readonly term: FormulaTerm }
  | { readonly kind: 'negate'; readonly operand: FormulaNode }
  | { readonly kind: 'operation'; readonly operator: FormulaOperator; readonly left: FormulaNode; readonly right: FormulaNode };

export interface ParsedFormula {
  readonly ok: true;
  /** Every dice term and constant, in the order they are written and rolled. */
  readonly terms: readonly FormulaTerm[];
  readonly expression: FormulaNode;
  /**
   * The formula is a signed sum of dice and constants: no `*` or `/` and no
   * counted dice. Only then are its constants a modifier on its dice.
   */
  readonly linear: boolean;
}
