/**
 * Recognises the Fantasy Statblocks callbacks that look a value up in a table
 * they write out, as the bundled 5e layout's Challenge ("17 (18,000 XP)") and
 * Proficiency Bonus ("+6") do:
 *
 *   const CR = { "0": { cr: "0", value: 0, xp: 10 }, … };
 *   if ("cr" in monster && monster.cr in CR) { return `${CR[monster.cr].cr} (…)`; }
 *   return "";
 *
 * What such a callback returns depends only on the table's row for one field,
 * so it is worked out once per row into an Atlas lookup table
 * (`{cr|lookup:challenge}`). The code is read, never run: the few expressions
 * it may use (arithmetic, `Math`, `??`, `toLocaleString`, template literals)
 * are evaluated here over the table's own literals.
 */

import type { FieldKey } from '../model/templateTypes';
import { parseCallbackBody, type JsNode, type JsStatement } from './fsCallbackSyntax';

/** What a lookup callback writes: the text of each row of its table, by the value of `key`. */
export interface LookupCallback {
  key: FieldKey;
  rows: Record<string, string>;
}

interface Row {
  readonly [key: string]: Value;
}
type Value = string | number | boolean | null | undefined | Row;

const MONSTER = 'monster';
const MAX_ROWS = 1000;
const MATH: Readonly<Record<string, (...args: number[]) => number>> = {
  floor: Math.floor, ceil: Math.ceil, round: Math.round, abs: Math.abs, min: Math.min, max: Math.max,
};

/** Carries an expression this does not evaluate out of the recursion. */
class Unknown extends Error {}

function unknown(): never {
  throw new Unknown('not evaluated');
}

function isRow(value: Value): value is Row {
  return typeof value === 'object' && value !== null;
}

/** A literal: a string, a number, or an object or array of literals. */
function literal(node: JsNode): Value {
  switch (node.kind) {
    case 'string':
    case 'number':
      return node.value;
    case 'unary':
      if (node.op === '-' && node.arg.kind === 'number') return -node.arg.value;
      return unknown();
    case 'object':
      return Object.fromEntries(node.entries.map(([key, value]) => [key, literal(value)]));
    default:
      return unknown();
  }
}

function isMember(node: JsNode, object: string, key?: string): boolean {
  return node.kind === 'member' && node.object.kind === 'name' && node.object.name === object && (key === undefined || node.key === key);
}

/** `monster.cr in CR` in a test (alone or joined with `&&`): the field whose row the table gives. */
function testedKey(test: JsNode, table: string): FieldKey | null {
  if (test.kind !== 'binary') return null;
  if (test.op === '&&') return testedKey(test.left, table) ?? testedKey(test.right, table);
  const reads = test.op === 'in' && test.right.kind === 'name' && test.right.name === table;
  return reads && test.left.kind === 'member' && isMember(test.left, MONSTER) ? test.left.key : null;
}

function plus(left: Value, right: Value): Value {
  if (typeof left === 'number' && typeof right === 'number') return left + right;
  if (isRow(left) || isRow(right)) return unknown();
  return `${String(left)}${String(right)}`;
}

function arithmetic(op: string, left: Value, right: Value): Value {
  if (typeof left !== 'number' || typeof right !== 'number') return unknown();
  switch (op) {
    case '-': return left - right;
    case '*': return left * right;
    case '/': return left / right;
    case '%': return left % right;
    default: return unknown();
  }
}

class RowEvaluator {
  constructor(private readonly table: string, private readonly rows: Row, private readonly key: FieldKey, private readonly at: string) {}

  value(node: JsNode): Value {
    switch (node.kind) {
      case 'string':
      case 'number':
        return node.value;
      case 'template':
        return node.parts.map((part) => (typeof part === 'string' ? part : this.text(this.value(part)))).join('');
      case 'name':
        return node.name === this.table ? this.rows : unknown();
      case 'member': {
        if (isMember(node, MONSTER, this.key)) return this.at;
        const object = this.value(node.object);
        return isRow(object) && Object.hasOwn(object, node.key) ? object[node.key] : undefined;
      }
      case 'index': {
        const object = this.value(node.object);
        const key = this.value(node.key);
        if (!isRow(object) || isRow(key)) return unknown();
        return Object.hasOwn(object, String(key)) ? object[String(key)] : undefined;
      }
      case 'call': return this.call(node);
      case 'unary': {
        const arg = this.value(node.arg);
        if (node.op === '!') return !arg;
        if (typeof arg !== 'number') return unknown();
        return node.op === '-' ? -arg : arg;
      }
      case 'binary': return this.binary(node);
      case 'conditional': return this.value(node.test) ? this.value(node.yes) : this.value(node.no);
      default: return unknown();
    }
  }

  private call(node: Extract<JsNode, { kind: 'call' }>): Value {
    const callee = node.callee;
    const args = node.args.map((arg) => this.value(arg));
    if (callee.kind === 'name' && callee.name === 'String' && args.length === 1) return this.text(args[0]);
    if (callee.kind !== 'member') return unknown();
    const math = callee.object.kind === 'name' && callee.object.name === 'Math' && Object.hasOwn(MATH, callee.key) ? MATH[callee.key] : undefined;
    if (math) return args.every((arg): arg is number => typeof arg === 'number') && args.length > 0 ? math(...args) : unknown();
    if (callee.key !== 'toLocaleString' || args.length > 0) return unknown();
    const target = this.value(callee.object);
    // As the 5E built-ins write experience: "18,000"
    return typeof target === 'number' ? target.toLocaleString('en-US') : unknown();
  }

  private binary(node: Extract<JsNode, { kind: 'binary' }>): Value {
    const left = this.value(node.left);
    switch (node.op) {
      case '??': return left ?? this.value(node.right);
      case '||': return left || this.value(node.right);
      case '&&': return left && this.value(node.right);
      case '+': return plus(left, this.value(node.right));
      case 'in': {
        if (node.right.kind === 'name' && node.right.name === MONSTER) return left === this.key;
        const right = this.value(node.right);
        return isRow(right) && !isRow(left) ? Object.hasOwn(right, String(left)) : unknown();
      }
      default: return arithmetic(node.op, left, this.value(node.right));
    }
  }

  /** A value as a template literal writes it; what the table lacks is no text. */
  text(value: Value): string {
    if (value === undefined || isRow(value)) return unknown();
    return String(value);
  }
}

/** `return ""`, `return` or `return null`: the callback gives nothing. */
function returnsNothing(statement: JsStatement | undefined): boolean {
  if (statement === undefined) return true;
  if (statement.kind !== 'return') return false;
  const value = statement.value;
  return value === null || (value.kind === 'string' && value.value === '') || (value.kind === 'name' && value.name === 'null');
}

/** What the callback writes for each row of its table, or null where it is not a lookup callback. */
export function lookupCallback(code: string): LookupCallback | null {
  const body = parseCallbackBody(code);
  const [declare, guard, last, ...rest] = body ?? [];
  if (declare?.kind !== 'declare' || guard?.kind !== 'if' || guard.otherwise || rest.length > 0 || !returnsNothing(last)) return null;
  const [returned, ...more] = guard.then;
  if (returned?.kind !== 'return' || !returned.value || more.length > 0) return null;
  const key = testedKey(guard.test, declare.name);
  if (key === null || declare.value.kind !== 'object' || declare.value.entries.length > MAX_ROWS) return null;
  try {
    const rows = literal(declare.value);
    if (!isRow(rows)) return null;
    const written: Record<string, string> = {};
    for (const at of Object.keys(rows)) {
      const evaluator = new RowEvaluator(declare.name, rows, key, at);
      if (evaluator.value(guard.test)) written[at] = evaluator.text(evaluator.value(returned.value));
    }
    return Object.keys(written).length > 0 ? { key, rows: written } : null;
  } catch (error) {
    if (error instanceof Unknown) return null;
    throw error;
  }
}
