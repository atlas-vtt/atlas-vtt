/** Walks a template's blocks and expressions for the built-in tests. */

import { isExpressionError } from '../../../../src/app/statblocks/expressions/errors';
import type { FormulaNode } from '../../../../src/app/statblocks/expressions/formulaTypes';
import { parseFormula } from '../../../../src/app/statblocks/expressions/parse';
import { parsePattern } from '../../../../src/app/statblocks/expressions/patternParse';
import type { PatternFilter, PatternNode } from '../../../../src/app/statblocks/expressions/patternTypes';
import type { ParentType } from '../../../../src/app/statblocks/model/blockCatalogue';
import type { TemplateBlock } from '../../../../src/app/statblocks/model/templateTypes';
import { splitRef } from '../../../../src/app/statblocks/values/fieldValues';

export interface PlacedBlock {
  block: TemplateBlock;
  parent: ParentType;
}

export function placedBlocks(blocks: readonly TemplateBlock[], parent: ParentType = 'root'): PlacedBlock[] {
  return blocks.flatMap((block) => [
    { block, parent },
    ...(block.type === 'section' || block.type === 'row' ? placedBlocks(block.blocks, block.type) : []),
  ]);
}

/** Every pattern a block renders: its own pattern and its fallback. */
export function patternsOf(block: TemplateBlock): string[] {
  const own = block.type === 'title' || block.type === 'line' || block.type === 'stat' ? block.pattern : undefined;
  return [own, block.fallback].filter((pattern): pattern is string => pattern !== undefined);
}

/** Every formula a Scores block's columns compute. */
export function columnFormulas(block: TemplateBlock): string[] {
  if (block.type !== 'scores') return [];
  return (block.columns ?? []).flatMap((column) => (column.formula === undefined ? [] : [column.formula]));
}

function formulaRefs(node: FormulaNode): string[] {
  switch (node.kind) {
    case 'ref': return [node.ref];
    case 'negate': return formulaRefs(node.operand);
    case 'binary': return [...formulaRefs(node.left), ...formulaRefs(node.right)];
    case 'call': return node.args.flatMap(formulaRefs);
    default: return [];
  }
}

function nodeRefs(nodes: readonly PatternNode[]): { refs: string[]; filters: PatternFilter[] } {
  const refs: string[] = [];
  const filters: PatternFilter[] = [];
  for (const node of nodes) {
    if (node.kind === 'refs') {
      refs.push(...node.refs);
      filters.push(...node.filters);
    } else if (node.kind === 'formula') {
      refs.push(...formulaRefs(node.formula));
      filters.push(...node.filters);
    } else if (node.kind === 'optional') {
      const inner = nodeRefs(node.nodes);
      refs.push(...inner.refs);
      filters.push(...inner.filters);
    }
  }
  return { refs, filters };
}

/** The field keys a pattern reads and the lookup tables it names; throws on a syntax error. */
export function patternReads(pattern: string): { keys: string[]; tables: string[] } {
  const ast = parsePattern(pattern);
  if (isExpressionError(ast)) throw new Error(`"${pattern}" does not parse: ${ast.message}`);
  const { refs, filters } = nodeRefs(ast.nodes);
  return {
    keys: refs.map((ref) => splitRef(ref).key),
    tables: filters.flatMap((filter) => (filter.name === 'lookup' ? [filter.table] : [])),
  };
}

/** The field keys a formula reads; throws on a syntax error. */
export function formulaReads(formula: string): string[] {
  const node = parseFormula(formula);
  if (isExpressionError(node)) throw new Error(`"${formula}" does not parse: ${node.message}`);
  return formulaRefs(node).map((ref) => splitRef(ref).key);
}
