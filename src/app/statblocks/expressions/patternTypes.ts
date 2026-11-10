/**
 * Patterns (§5.6) write a block's values as text without code:
 *
 *   pattern  := ( text | value | optional )*
 *   value    := '{' ref ( ',' ref )* ( '|' filter )* '}'  |  '{=' formula ( '|' filter )* '}'
 *   optional := '[' pattern ']'      dropped when a value directly inside it is empty
 *   ref      := key ( '.' index )?   stats.1, hp
 *   filter   := signed | upper | lower | count | avg | lookup ':' table | join ':' text
 *
 * A backslash escapes { } [ ] \ , | anywhere ("AC {ac} \[{aac}\]").
 */

import type { FormulaNode } from './formulaTypes';

export type PatternFilter =
  | { name: 'signed' | 'upper' | 'lower' | 'count' | 'avg' }
  | { name: 'lookup'; table: string }
  | { name: 'join'; text: string };

export type PatternFilterName = PatternFilter['name'];

export type PatternNode =
  | { kind: 'text'; text: string }
  | { kind: 'refs'; refs: string[]; filters: PatternFilter[] }
  | { kind: 'formula'; source: string; formula: FormulaNode; filters: PatternFilter[] }
  | { kind: 'optional'; nodes: PatternNode[] };

export interface PatternAst {
  kind: 'pattern';
  nodes: PatternNode[];
}
