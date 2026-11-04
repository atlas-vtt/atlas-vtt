import type { FieldKey } from '../model/templateTypes';
import { isExpressionError } from './errors';
import { parsePatternCached } from './patternParse';
import type { PatternFilter, PatternNode } from './patternTypes';

/** Filters that write another value than the field holds: a table's row for it, or how many items it has. */
const WORKS_OUT: ReadonlySet<PatternFilter['name']> = new Set(['lookup', 'count']);

function written(nodes: readonly PatternNode[], keys: FieldKey[]): void {
  for (const node of nodes) {
    // `stats.1` is one slot of a field, and a formula or a lookup works a value out: none of them is the field as written.
    if (node.kind === 'refs' && !node.filters.some((filter) => WORKS_OUT.has(filter.name))) {
      keys.push(...node.refs.filter((ref) => !ref.includes('.')));
    } else if (node.kind === 'optional') written(node.nodes, keys);
  }
}

/** The fields a pattern writes as they are, in the order it names them; `{cr|lookup:xp}` writes none. */
export function writtenFields(pattern: string | undefined): FieldKey[] {
  if (!pattern) return [];
  const ast = parsePatternCached(pattern);
  const keys: FieldKey[] = [];
  if (!isExpressionError(ast)) written(ast.nodes, keys);
  return keys;
}
