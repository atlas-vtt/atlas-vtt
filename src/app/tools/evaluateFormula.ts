/**
 * Works a formula out exactly, as a fraction of whole numbers, and cuts only
 * the result to a whole number, towards zero. Floating point would make `7/3*3`
 * come to 6.999… and cut to 6.
 */

import type { FormulaNode, FormulaTerm } from './formulaTypes';

interface Fraction {
  readonly top: bigint;
  /** Always positive. */
  readonly bottom: bigint;
}

function divisor(a: bigint, b: bigint): bigint {
  let [x, y] = [a < 0n ? -a : a, b];
  while (y !== 0n) [x, y] = [y, x % y];
  return x;
}

function fraction(top: bigint, bottom: bigint): Fraction {
  if (top === 0n) return { top: 0n, bottom: 1n };
  const sign = bottom < 0n ? -1n : 1n;
  const common = divisor(top, bottom < 0n ? -bottom : bottom);
  return { top: (sign * top) / common, bottom: (sign * bottom) / common };
}

function operate(operator: '+' | '-' | '*' | '/', a: Fraction, b: Fraction): Fraction {
  switch (operator) {
    case '+': return fraction(a.top * b.bottom + b.top * a.bottom, a.bottom * b.bottom);
    case '-': return fraction(a.top * b.bottom - b.top * a.bottom, a.bottom * b.bottom);
    case '*': return fraction(a.top * b.top, a.bottom * b.bottom);
    // A divisor that comes out 0 makes the quotient 0.
    case '/': return b.top === 0n ? fraction(0n, 1n) : fraction(a.top * b.bottom, a.bottom * b.top);
  }
}

function evaluate(node: FormulaNode, valueOf: (term: FormulaTerm) => number): Fraction {
  switch (node.kind) {
    case 'term': return fraction(BigInt(valueOf(node.term)), 1n);
    case 'negate': {
      const { top, bottom } = evaluate(node.operand, valueOf);
      return { top: -top, bottom };
    }
    case 'operation': return operate(node.operator, evaluate(node.left, valueOf), evaluate(node.right, valueOf));
  }
}

/** The total of `expression` when each term comes to `valueOf(term)`, before its sign. */
export function evaluateFormula(expression: FormulaNode, valueOf: (term: FormulaTerm) => number): number {
  const { top, bottom } = evaluate(expression, valueOf);
  return Number(top / bottom);
}
