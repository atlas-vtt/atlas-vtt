/**
 * Renders a parsed pattern against a statblock's values.
 *
 * - A value with one ref shows the field: a list's items, or a record's pairs,
 *   joined by ", " unless a `join` filter says otherwise.
 * - A value with several refs shows the non-empty ones, each as one item,
 *   joined the same way: `{damage_immunities, condition_immunities|join:; }`.
 * - A value whose fields are empty skips its filters and counts as empty, and
 *   so does a formula without a result (its error lands in `problems`). A
 *   formula's result shows to two decimals at most.
 * - An optional part is dropped when a value directly inside it is empty, or
 *   when it holds values and none of them showed (its nested parts all dropped).
 * - The pattern is `empty` when it holds values and none of them showed; its
 *   text is then "". A pattern of text alone ("None") is never empty.
 */

import type { FieldValue } from '../model/templateTypes';
import { isEmptyValue } from '../values/emptyValue';
import type { ValueReader } from '../values/fieldValues';
import { roundForDisplay } from '../values/numberText';
import { valueText } from '../values/valueText';
import type { ExpressionError } from './errors';
import { evaluateFormula, type FormulaContext } from './evaluate';
import { applyFilter, type Lookups } from './filters';
import type { PatternAst, PatternNode } from './patternTypes';

export interface PatternContext extends FormulaContext {
  /** The template's lookup tables. */
  lookups?: Lookups | undefined;
}

export interface PatternRender {
  text: string;
  empty: boolean;
  /** Why values gave nothing: empty or non-numeric fields in formulas, missing lookup tables. */
  problems: ExpressionError[];
}

type ValueNode = Extract<PatternNode, { kind: 'refs' | 'formula' }>;

interface Environment {
  reader: ValueReader;
  context: PatternContext;
  problems: ExpressionError[];
}

interface Pass {
  text: string;
  /** Values in these nodes, at any depth. */
  values: number;
  /** Values whose text was kept. */
  shown: number;
  /** A value directly in these nodes was empty. */
  missing: boolean;
}

const ITEM_SEPARATOR = ', ';

/** A field's items: a list's entries, a record's pairs one by one, or the value itself. */
function itemsOf(value: FieldValue | undefined): FieldValue[] {
  if (value === undefined || isEmptyValue(value)) return [];
  if (Array.isArray(value)) return value.filter((item) => !isEmptyValue(item));
  if (value !== null && typeof value === 'object') {
    return Object.entries(value).map(([key, item]): FieldValue => ({ [key]: item })).filter((item) => !isEmptyValue(item));
  }
  return [value];
}

function startingItems(node: ValueNode, env: Environment): FieldValue[] {
  if (node.kind === 'refs') {
    const [only] = node.refs;
    if (node.refs.length === 1 && only !== undefined) return itemsOf(env.reader(only));
    return node.refs.map((ref) => env.reader(ref)).filter((value): value is FieldValue => !isEmptyValue(value));
  }
  const result = evaluateFormula(node.formula, env.reader, env.context);
  if (result.ok) return [roundForDisplay(result.value)];
  env.problems.push(result.error);
  return [];
}

/** The value's text, or null when it is empty. */
function renderValue(node: ValueNode, env: Environment): string | null {
  let items = startingItems(node, env);
  for (const filter of node.filters) {
    if (items.length === 0) break;
    const step = applyFilter(items, filter, env.context.lookups);
    if (step.problem) env.problems.push(step.problem);
    items = step.items;
  }
  const text = items.map(valueText).filter((part) => part.trim() !== '').join(ITEM_SEPARATOR);
  return text.trim() === '' ? null : text;
}

function renderNodes(nodes: readonly PatternNode[], env: Environment): Pass {
  const pass: Pass = { text: '', values: 0, shown: 0, missing: false };
  for (const node of nodes) {
    if (node.kind === 'text') {
      pass.text += node.text;
    } else if (node.kind === 'optional') {
      const inner = renderNodes(node.nodes, env);
      pass.values += inner.values;
      const kept = !inner.missing && (inner.values === 0 || inner.shown > 0);
      if (kept) {
        pass.text += inner.text;
        pass.shown += inner.shown;
      }
    } else {
      pass.values += 1;
      const text = renderValue(node, env);
      if (text === null) pass.missing = true;
      else {
        pass.text += text;
        pass.shown += 1;
      }
    }
  }
  return pass;
}

/** The pattern's text for one statblock, trimmed at both ends. Never throws. */
export function renderPattern(ast: PatternAst, reader: ValueReader, context: PatternContext = {}): PatternRender {
  const env: Environment = { reader, context, problems: [] };
  const pass = renderNodes(ast.nodes, env);
  const empty = pass.values > 0 && pass.shown === 0;
  return { text: empty ? '' : pass.text.trim(), empty, problems: env.problems };
}
