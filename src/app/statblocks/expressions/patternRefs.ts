import type { FieldKey } from '../model/templateTypes';
import { splitRef } from '../values/fieldValues';
import { isExpressionError } from './errors';
import type { FormulaNode } from './formulaTypes';
import { parsePatternCached } from './patternParse';
import type { PatternNode } from './patternTypes';

function formulaRefs(node: FormulaNode, keys: Set<FieldKey>): void {
  switch (node.kind) {
    case 'ref': keys.add(splitRef(node.ref).key); return;
    case 'negate': formulaRefs(node.operand, keys); return;
    case 'binary':
      formulaRefs(node.left, keys);
      formulaRefs(node.right, keys);
      return;
    case 'call': node.args.forEach((arg) => formulaRefs(arg, keys)); return;
    case 'number': case 'slot': return;
  }
}

function nodeRefs(nodes: readonly PatternNode[], keys: Set<FieldKey>): void {
  for (const node of nodes) {
    switch (node.kind) {
      case 'refs': node.refs.forEach((ref) => keys.add(splitRef(ref).key)); break;
      case 'formula': formulaRefs(node.formula, keys); break;
      case 'optional': nodeRefs(node.nodes, keys); break;
      case 'text': break;
    }
  }
}

/**
 * The fields a pattern reads, as top-level keys in the order it names them
 * (`{=floor((stats.1 - 10) / 2)}` reads `stats`). A pattern that cannot be
 * read names none. This is the `refsOf` that `fieldsShownBy` takes.
 */
export function patternRefs(pattern: string): FieldKey[] {
  const ast = parsePatternCached(pattern);
  if (isExpressionError(ast)) return [];
  const keys = new Set<FieldKey>();
  nodeRefs(ast.nodes, keys);
  return [...keys];
}
