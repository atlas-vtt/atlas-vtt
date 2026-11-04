/**
 * The formula language (§5.6): numbers, field references, `value` (the score
 * of the current Scores slot), + - * /, brackets, unary minus, and the
 * functions floor, ceil, round, abs, min and max.
 */

export type FormulaFunction = 'floor' | 'ceil' | 'round' | 'abs' | 'min' | 'max';
export type BinaryOperator = '+' | '-' | '*' | '/';

export type FormulaNode =
  | { kind: 'number'; value: number }
  | { kind: 'ref'; ref: string }
  /** The word `value`: the current Scores slot's score. */
  | { kind: 'slot' }
  | { kind: 'negate'; operand: FormulaNode }
  | { kind: 'binary'; op: BinaryOperator; left: FormulaNode; right: FormulaNode }
  | { kind: 'call'; fn: FormulaFunction; args: FormulaNode[] };

/** How many arguments each function takes. */
export const FORMULA_FUNCTIONS: Readonly<Record<FormulaFunction, { min: number; max: number }>> = {
  floor: { min: 1, max: 1 },
  ceil: { min: 1, max: 1 },
  round: { min: 1, max: 1 },
  abs: { min: 1, max: 1 },
  min: { min: 1, max: Infinity },
  max: { min: 1, max: Infinity },
};

export function isFormulaFunction(name: string): name is FormulaFunction {
  return Object.hasOwn(FORMULA_FUNCTIONS, name);
}

/** The word a formula reads the current Scores slot with. */
export const SLOT_WORD = 'value';

export type FormulaToken =
  | { type: 'number'; value: number; at: number; text: string }
  | { type: 'name'; name: string; at: number }
  | { type: 'op'; op: BinaryOperator; at: number }
  | { type: 'open' | 'close' | 'comma' | 'end'; at: number };
