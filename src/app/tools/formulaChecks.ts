/** The limits and the sense of a parsed formula, checked before anything is rolled. */

import { facesMeeting } from './diceComparison';
import { MAX_EXPLOSIONS } from './diceExplosion';
import { FORMULA_LIMITS, type DiceTerm, type FormulaErrorCode, type FormulaNode, type FormulaTerm } from './formulaTypes';

/** The lowest face of a term's dice. */
export function lowestFace(term: Pick<DiceTerm, 'fate'>): number {
  return term.fate ? -1 : 1;
}

/**
 * Whether a dice term's modifiers cannot work: Fate dice neither
 * explode nor roll again, every die needs a face that does not explode or roll
 * again, and a term keeps or drops at least one of its dice and at most all.
 */
function modifierProblem(term: DiceTerm): boolean {
  if (term.fate && (term.explode !== undefined || term.reroll !== undefined)) return true;
  if (term.explode !== undefined && term.explode.highFaces >= term.faces) return true;
  const faces = term.faces - lowestFace(term) + 1;
  if (term.reroll !== undefined && facesMeeting(lowestFace(term), term.faces, term.reroll.when) === faces) return true;
  return term.keep !== undefined && (term.keep.count < 1 || term.keep.count > term.count);
}

/**
 * The most a term can come to either way. Every numbered die may explode by
 * the collection's rule, so each counts for itself and `MAX_EXPLOSIONS` more.
 */
function termBound(term: FormulaTerm): number {
  if (term.kind === 'constant') return term.value;
  const perDie = term.fate ? 1 : (term.tally ? 1 : term.faces) * (1 + MAX_EXPLOSIONS);
  return term.count * perDie;
}

/**
 * Bounds on a value of the expression: `size` on its magnitude, and `parts`
 * on the denominator of the fraction it is, so that a nonzero divisor is at
 * least `1 / parts` and a quotient's size is known.
 */
function bounds(node: FormulaNode): { size: number; parts: number } {
  switch (node.kind) {
    case 'term': return { size: termBound(node.term), parts: 1 };
    case 'negate': return bounds(node.operand);
    case 'operation': {
      const left = bounds(node.left);
      const right = bounds(node.right);
      switch (node.operator) {
        case '+':
        case '-': return { size: left.size + right.size, parts: left.parts * right.parts };
        case '*': return { size: left.size * right.size, parts: left.parts * right.parts };
        case '/': return { size: left.size * right.parts, parts: left.parts * right.size * right.parts };
      }
    }
  }
}

/** The first limit the formula breaks, or null when it may be rolled. */
export function checkFormula(expression: FormulaNode, terms: readonly FormulaTerm[]): FormulaErrorCode | null {
  if (terms.length > FORMULA_LIMITS.terms) return 'terms';
  const dice = terms.filter((term): term is DiceTerm => term.kind === 'dice');
  if (dice.some((term) => !term.fate && (term.faces < 2 || term.faces > FORMULA_LIMITS.faces))) return 'faces';
  if (dice.reduce((sum, term) => sum + term.count, 0) > FORMULA_LIMITS.dice) return 'dice';
  if (dice.some(modifierProblem)) return 'modifier';
  return bounds(expression).size <= FORMULA_LIMITS.total ? null : 'total';
}
