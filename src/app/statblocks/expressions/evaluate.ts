/**
 * Evaluates a parsed formula against a statblock's values. Text that is a
 * number ("14", "+3") counts as one; anything else is an error in plain words.
 */

import type { FieldValue } from '../model/templateTypes';
import { isEmptyValue } from '../values/emptyValue';
import type { ValueReader } from '../values/fieldValues';
import { numericValue } from '../values/numberText';
import { quoted } from '../values/valueText';
import { nameOf, refError, type ExpressionError, type LabelResolver } from './errors';
import { SLOT_WORD, type FormulaFunction, type FormulaNode } from './formulaTypes';
import { t } from '../../i18n';

export interface FormulaContext {
  /** The score of the current Scores slot, which the word `value` reads. */
  value?: FieldValue | undefined;
  /** The slot's label ("Str") for messages about `value`. */
  slotLabel?: string | undefined;
  labelOf?: LabelResolver | undefined;
}

export type FormulaResult = { ok: true; value: number } | { ok: false; error: ExpressionError };

type Step = number | ExpressionError;

const ONE_ARGUMENT: Readonly<Record<'floor' | 'ceil' | 'round' | 'abs', (value: number) => number>> = {
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  abs: Math.abs,
};

function failed(step: Step): step is ExpressionError {
  return typeof step !== 'number';
}

function notANumber(message: string): ExpressionError {
  return { kind: 'not-a-number', message };
}

function asNumber(raw: FieldValue | undefined, ref: string, name: string): Step {
  if (isEmptyValue(raw)) return refError('unbound', ref, `${name} is empty.`);
  const number = numericValue(raw);
  return number === null ? refError('not-a-number', ref, `${name} isn't a number.`) : number;
}

function slotValue(context: FormulaContext): Step {
  if (context.slotLabel === undefined && isEmptyValue(context.value)) {
    return refError('unbound', SLOT_WORD, `${quoted(SLOT_WORD)} is the score of a Scores column, and there is none here.`);
  }
  return asNumber(context.value, SLOT_WORD, context.slotLabel ?? quoted(SLOT_WORD));
}

function arithmetic(op: '+' | '-' | '*' | '/', left: number, right: number): Step {
  switch (op) {
    case '+': return left + right;
    case '-': return left - right;
    case '*': return left * right;
    case '/': return right === 0 ? notANumber("Can't divide by zero.") : left / right;
  }
}

function call(fn: FormulaFunction, values: number[]): number {
  if (fn === 'min') return Math.min(...values);
  if (fn === 'max') return Math.max(...values);
  return ONE_ARGUMENT[fn](values[0] ?? Number.NaN);
}

function evaluateNode(node: FormulaNode, reader: ValueReader, context: FormulaContext): Step {
  switch (node.kind) {
    case 'number': return node.value;
    case 'ref': return asNumber(reader(node.ref), node.ref, nameOf(node.ref, context.labelOf));
    case 'slot': return slotValue(context);
    case 'negate': {
      const operand = evaluateNode(node.operand, reader, context);
      return failed(operand) ? operand : -operand;
    }
    case 'binary': {
      const left = evaluateNode(node.left, reader, context);
      if (failed(left)) return left;
      const right = evaluateNode(node.right, reader, context);
      return failed(right) ? right : arithmetic(node.op, left, right);
    }
    case 'call': {
      const values: number[] = [];
      for (const arg of node.args) {
        const value = evaluateNode(arg, reader, context);
        if (failed(value)) return value;
        values.push(value);
      }
      return call(node.fn, values);
    }
  }
}

/** The formula's value, or why it has none. Never throws. */
export function evaluateFormula(node: FormulaNode, reader: ValueReader, context: FormulaContext = {}): FormulaResult {
  const result = evaluateNode(node, reader, context);
  if (failed(result)) return { ok: false, error: result };
  if (!Number.isFinite(result)) return { ok: false, error: notANumber(t('statblockEditor.expr.tooLarge')) };
  return { ok: true, value: result === 0 ? 0 : result };
}
