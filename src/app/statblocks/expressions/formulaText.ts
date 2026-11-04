import { nameOf, type LabelResolver } from './errors';
import { SLOT_WORD, type FormulaNode } from './formulaTypes';

/** Binding strength: atoms and calls bind tightest, then minus signs, then * and /, then + and -. */
function precedence(node: FormulaNode): number {
  switch (node.kind) {
    case 'binary': return node.op === '+' || node.op === '-' ? 1 : 2;
    case 'negate': return 3;
    default: return 4;
  }
}

function wrapped(text: string, wrap: boolean): string {
  return wrap ? `(${text})` : text;
}

/**
 * A formula written out with as few brackets as its grouping needs. Without
 * `labelOf` the text parses back to the same tree; with it, references read as
 * their fields' labels ("floor((Dex - 10) / 2)"), for tooltips that say what a
 * derived value is made of.
 */
export function formulaText(node: FormulaNode, labelOf?: LabelResolver): string {
  switch (node.kind) {
    case 'number': return String(node.value);
    case 'ref': return labelOf ? nameOf(node.ref, labelOf) : node.ref;
    case 'slot': return labelOf?.(SLOT_WORD) ?? SLOT_WORD;
    case 'negate': return `-${wrapped(formulaText(node.operand, labelOf), precedence(node.operand) < 3)}`;
    case 'call': return `${node.fn}(${node.args.map((arg) => formulaText(arg, labelOf)).join(', ')})`;
    case 'binary': {
      const own = precedence(node);
      const left = wrapped(formulaText(node.left, labelOf), precedence(node.left) < own);
      const right = wrapped(formulaText(node.right, labelOf), precedence(node.right) <= own);
      return `${left} ${node.op} ${right}`;
    }
  }
}
