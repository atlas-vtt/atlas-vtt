/**
 * Complete, bounded dice grammar. A formula adds, subtracts, multiplies and
 * divides dice and constants, with the usual precedence and parentheses:
 * `2d6+3`, `(1d8+2)*2`, `4d6kh3`, `3dF`, `d%`. A sign may only open a formula
 * or a parenthesis, so `d20++2` is refused rather than guessed at.
 *
 * Dice terms and their modifiers are read by `formulaTerms.ts`. Division keeps
 * its fractions while the formula is worked out, and only the total is cut to
 * a whole number, towards zero: `7/2` is 3 and `-7/2` is −3. A divisor that
 * comes out 0 makes its quotient 0; a divisor written as 0 is refused.
 */
import { checkFormula } from './formulaChecks';
import { readTerm, type TermDraft } from './formulaTerms';
import { FORMULA_LIMITS, type FormulaError, type FormulaErrorCode, type FormulaNode, type FormulaOperator, type FormulaTerm,
  type ParsedFormula } from './formulaTypes';

export { FORMULA_LIMITS } from './formulaTypes';

export type {
  ConstantTerm, DiceKeep, DiceReroll, DiceTally, DiceTerm, FormulaError, FormulaErrorCode, FormulaNode, FormulaOperator,
  FormulaTerm, ParsedFormula,
} from './formulaTypes';

/** A draft of the tree, before the signs that lead to each term are known. */
type DraftNode =
  | { readonly kind: 'term'; readonly term: TermDraft }
  | { readonly kind: 'negate'; readonly operand: DraftNode }
  | { readonly kind: 'operation'; readonly operator: FormulaOperator; readonly left: DraftNode; readonly right: DraftNode };

class FormulaSyntaxError extends Error {
  constructor(readonly code: FormulaErrorCode) {
    super(code);
  }
}

// Whitespace is SP/HTAB only, and only between terms, operators and parentheses.
const SPACE = /[ \t]*/y;

/** Recursive descent over the formula's text. */
class FormulaReader {
  private cursor = 0;
  private depth = 0;

  constructor(private readonly text: string) {}

  read(): DraftNode {
    this.skipSpace();
    const node = this.expression();
    if (this.cursor < this.text.length) throw new FormulaSyntaxError('syntax');
    return node;
  }

  private expression(): DraftNode {
    const sign = this.take('+', '-');
    if (sign !== null) this.skipSpace();
    const first = this.product();
    let node: DraftNode = sign === '-' ? { kind: 'negate', operand: first } : first;
    for (let operator = this.take('+', '-'); operator !== null; operator = this.take('+', '-')) {
      this.skipSpace();
      node = { kind: 'operation', operator, left: node, right: this.product() };
    }
    return node;
  }

  private product(): DraftNode {
    let node = this.factor();
    for (let operator = this.take('*', '/'); operator !== null; operator = this.take('*', '/')) {
      this.skipSpace();
      const right = this.factor();
      if (operator === '/' && right.kind === 'term' && right.term.kind === 'constant' && right.term.value === 0) {
        throw new FormulaSyntaxError('syntax');
      }
      node = { kind: 'operation', operator, left: node, right };
    }
    return node;
  }

  private factor(): DraftNode {
    if (this.take('(') !== null) {
      if (++this.depth > FORMULA_LIMITS.depth) throw new FormulaSyntaxError('depth');
      this.skipSpace();
      const inner = this.expression();
      if (this.take(')') === null) throw new FormulaSyntaxError('syntax');
      this.depth -= 1;
      this.skipSpace();
      return inner;
    }
    const read = readTerm(this.text, this.cursor);
    if (!read) throw new FormulaSyntaxError('syntax');
    this.cursor = read.end;
    this.skipSpace();
    return { kind: 'term', term: read.term };
  }

  /** Consumes one of `characters` at the cursor and returns it, or null. */
  private take<T extends string>(...characters: T[]): T | null {
    const found = characters.find((character) => this.text[this.cursor] === character);
    if (found === undefined) return null;
    this.cursor += 1;
    return found;
  }

  private skipSpace(): void {
    SPACE.lastIndex = this.cursor;
    SPACE.exec(this.text);
    this.cursor = SPACE.lastIndex;
  }
}

/** The final tree: every term learns whether an odd number of minus signs leads to it. */
function signed(node: DraftNode, negative: boolean, terms: FormulaTerm[]): FormulaNode {
  switch (node.kind) {
    case 'term': {
      const term = { ...node.term, negative } as FormulaTerm;
      terms.push(term);
      return { kind: 'term', term };
    }
    case 'negate':
      return { kind: 'negate', operand: signed(node.operand, !negative, terms) };
    case 'operation': {
      const left = signed(node.left, negative, terms);
      const right = signed(node.right, node.operator === '-' ? !negative : negative, terms);
      return { kind: 'operation', operator: node.operator, left, right };
    }
  }
}

function isLinear(node: FormulaNode): boolean {
  switch (node.kind) {
    case 'term': return node.term.kind === 'constant' || node.term.tally === undefined;
    case 'negate': return isLinear(node.operand);
    case 'operation': return node.operator !== '*' && node.operator !== '/' && isLinear(node.left) && isLinear(node.right);
  }
}

/**
 * Validates the whole expression before the caller can consume any randomness. A formula is at most
 * `characters` long: one written (`FORMULA_LIMITS.characters`) unless a bonus completed with the
 * set's dice is read (`completeFormula`).
 */
export function parseFormula(formula: string, characters: number = FORMULA_LIMITS.characters): ParsedFormula | FormulaError {
  if (formula.length > characters) return { ok: false, code: 'length' };
  let draft: DraftNode;
  try {
    draft = new FormulaReader(formula).read();
  } catch (error) {
    if (error instanceof FormulaSyntaxError) return { ok: false, code: error.code };
    throw error;
  }
  const terms: FormulaTerm[] = [];
  const expression = signed(draft, false, terms);
  const problem = checkFormula(expression, terms);
  if (problem) return { ok: false, code: problem };
  return { ok: true, terms, expression, linear: isLinear(expression) };
}
