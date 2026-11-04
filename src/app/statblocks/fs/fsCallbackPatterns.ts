/**
 * Recognises the Fantasy Statblocks callbacks that only format values and
 * says what they write in Atlas' own terms: a pattern (`{hp}[ ({hit_dice})]`,
 * `{tier} {type}`, `{modifier|signed}`), the key an entry's text is under, or
 * a formula. Everything else stays JavaScript. The code is read, never run.
 */

import { isExpressionError } from '../expressions/errors';
import { SLOT_WORD, isFormulaFunction } from '../expressions/formulaTypes';
import { parseFormula } from '../expressions/parse';
import { escapePatternText, parsePattern } from '../expressions/patternParse';
import type { FieldKey } from '../model/templateTypes';
import { parseCallbackBody, type JsNode, type JsStatement } from './fsCallbackSyntax';

/** What a callback writes, as a pattern over the note's fields. */
export interface CallbackPattern {
  pattern: string;
  /** The fields it reads, in order of first use. */
  refs: FieldKey[];
}

type Piece = { text: string } | { ref: FieldKey; signed: boolean } | { optional: Piece[] };
type Sign = { key: FieldKey; follows: 'abs' | 'value' };

const MONSTER = 'monster';
const PROPERTY = 'property';
const MATH_FUNCTIONS: ReadonlySet<string> = new Set(['floor', 'ceil', 'round', 'abs', 'min', 'max']);
const ARITHMETIC: ReadonlySet<string> = new Set(['+', '-', '*', '/']);
const FORMULA_KEY = /^[\p{L}_][\p{L}\p{N}_]*$/u;

export function isName(node: JsNode | null | undefined, name: string): boolean {
  return node?.kind === 'name' && node.name === name;
}

/** `monster.key`, `monster?.key` or `monster["key"]`: the key it reads. */
export function fieldOf(node: JsNode | null | undefined, base = MONSTER): FieldKey | null {
  return node?.kind === 'member' && isName(node.object, base) ? node.key : null;
}

function textOf(node: JsNode | undefined): string | null {
  return node?.kind === 'string' ? node.value : null;
}

/** The arguments of `object.method(…)`, or null for any other node. */
function callArgs(node: JsNode | undefined, object: string, method: string): JsNode[] | null {
  if (node?.kind !== 'call' || node.callee.kind !== 'member') return null;
  return isName(node.callee.object, object) && node.callee.key === method ? node.args : null;
}

function soleReturn(body: readonly JsStatement[] | null): JsNode | null {
  const only = body?.length === 1 ? body[0] : undefined;
  return only?.kind === 'return' ? only.value : null;
}

/** `R < 0 ? "-" : "+"`, `R >= 0 ? "+" : ""` and the like: the field whose sign it writes, and what must follow it. */
function signPrefix(node: JsNode | undefined): Sign | null {
  if (node?.kind !== 'conditional' || node.test.kind !== 'binary') return null;
  const { op, left, right } = node.test;
  const key = fieldOf(left);
  if (!key || right.kind !== 'number' || right.value !== 0) return null;
  const negativeFirst = op === '<';
  if (!negativeFirst && op !== '>=' && op !== '>') return null;
  const [whenNegative, whenPositive] = negativeFirst ? [textOf(node.yes), textOf(node.no)] : [textOf(node.no), textOf(node.yes)];
  if (whenPositive !== '+') return null;
  if (whenNegative === '-') return { key, follows: 'abs' };
  return whenNegative === '' ? { key, follows: 'value' } : null;
}

function completesSign(node: string | JsNode | undefined, sign: Sign): boolean {
  if (node === undefined || typeof node === 'string') return false;
  if (sign.follows === 'value') return fieldOf(node) === sign.key;
  const args = callArgs(node, 'Math', 'abs');
  return args?.length === 1 && fieldOf(args[0]) === sign.key;
}

/** Text parts and values side by side, as a template literal or a `+` chain lists them. */
function sequence(items: readonly (string | JsNode)[]): Piece[] | null {
  const pieces: Piece[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) continue;
    if (typeof item === 'string') {
      pieces.push({ text: item });
      continue;
    }
    const sign = signPrefix(item);
    if (sign && completesSign(items[index + 1], sign)) {
      pieces.push({ ref: sign.key, signed: true });
      index += 1;
      continue;
    }
    const inner = valuePieces(item);
    if (!inner) return null;
    pieces.push(...inner);
  }
  return pieces;
}

function isText(node: JsNode | undefined): boolean {
  if (node?.kind === 'string' || node?.kind === 'template') return true;
  if (node?.kind === 'call') return isName(node.callee, 'String');
  return node?.kind === 'conditional' && textOf(node.yes) !== null && textOf(node.no) !== null;
}

function operands(node: JsNode): JsNode[] {
  return node.kind === 'binary' && node.op === '+' ? [...operands(node.left), node.right] : [node];
}

function valuePieces(node: JsNode): Piece[] | null {
  switch (node.kind) {
    case 'string': return [{ text: node.value }];
    case 'number': return [{ text: String(node.value) }];
    case 'template': return sequence(node.parts);
    case 'member': {
      const key = fieldOf(node);
      return key === null ? null : [{ ref: key, signed: false }];
    }
    case 'call': return isName(node.callee, 'String') && node.args.length === 1 && node.args[0] ? valuePieces(node.args[0]) : null;
    case 'binary': {
      if (node.op !== '+') return null;
      const list = operands(node);
      // JavaScript adds numbers until text joins in, so only a chain that starts as text is a concatenation
      return isText(list[0]) || isText(list[1]) ? sequence(list) : null;
    }
    default: return null;
  }
}

function joined(items: readonly JsNode[], separator: string): Piece[] | null {
  const pieces: Piece[] = [];
  for (const [index, item] of items.entries()) {
    const inner = valuePieces(item);
    if (!inner) return null;
    if (index > 0) pieces.push({ text: separator });
    pieces.push(...inner);
  }
  return pieces;
}

/** The key whose presence `"k" in monster`, `monster.k`, `monster.k?.length` or `monster.k != null` tests. */
function presenceOf(test: JsNode): FieldKey | null {
  if (test.kind === 'unary' && test.op === '!' && test.arg.kind === 'unary' && test.arg.op === '!') return presenceOf(test.arg.arg);
  if (test.kind === 'binary' && test.op === 'in') return isName(test.right, MONSTER) ? textOf(test.left) : null;
  if (test.kind === 'binary' && (test.op === '!=' || test.op === '!==')) {
    const nothing = test.right.kind === 'name' && (test.right.name === 'null' || test.right.name === 'undefined');
    return nothing ? fieldOf(test.left) : null;
  }
  if (test.kind === 'member' && test.key === 'length') return fieldOf(test.object);
  return fieldOf(test);
}

function pushed(statement: JsStatement | undefined, list: string, separator: string): Piece[] | null {
  if (statement?.kind === 'expression') {
    const args = callArgs(statement.value, list, 'push');
    const items = args?.length ? joined(args, separator) : null;
    return items ? [{ text: separator }, ...items] : null;
  }
  if (statement?.kind !== 'if' || statement.then.length !== 1 || statement.otherwise) return null;
  const key = presenceOf(statement.test);
  const inner = key === null ? null : pushed(statement.then[0], list, separator);
  // The part shows only while the field it tests holds something
  return inner?.some((piece) => 'ref' in piece && piece.ref === key) ? [{ optional: inner }] : null;
}

/** `const parts = [monster.hp]; if (monster.hit_dice) parts.push(`(${monster.hit_dice})`); return parts.join(" ");` */
function joinedPieces(body: readonly JsStatement[]): Piece[] | null {
  const first = body[0];
  const last = body[body.length - 1];
  if (body.length < 2 || first?.kind !== 'declare' || first.value.kind !== 'array') return null;
  if (last?.kind !== 'return' || !last.value) return null;
  const joinArgs = callArgs(last.value, first.name, 'join');
  const separator = joinArgs?.length === 0 ? ',' : textOf(joinArgs?.[0]);
  if (!joinArgs || joinArgs.length > 1 || separator === null || first.value.items.length === 0) return null;
  const pieces = joined(first.value.items, separator);
  for (const statement of body.slice(1, -1)) {
    const more = pieces ? pushed(statement, first.name, separator) : null;
    if (!more || !pieces) return null;
    pieces.push(...more);
  }
  return pieces;
}

function patternOf(pieces: readonly Piece[]): CallbackPattern | null {
  const refs: FieldKey[] = [];
  const write = (list: readonly Piece[]): string | null => {
    let text = '';
    for (const piece of list) {
      if ('text' in piece) {
        text += escapePatternText(piece.text);
      } else if ('ref' in piece) {
        if (piece.ref === '' || piece.ref !== piece.ref.trim()) return null;
        if (!refs.includes(piece.ref)) refs.push(piece.ref);
        text += `{${escapePatternText(piece.ref)}${piece.signed ? '|signed' : ''}}`;
      } else {
        const inner = write(piece.optional);
        if (inner === null) return null;
        text += `[${inner}]`;
      }
    }
    return text;
  };
  const pattern = write(pieces);
  return pattern === null || isExpressionError(parsePattern(pattern)) ? null : { pattern, refs };
}

/** What a property callback (`(monster) => string`) writes, or null where it does more than format fields. */
export function callbackPattern(code: string): CallbackPattern | null {
  const body = parseCallbackBody(code);
  if (!body) return null;
  const value = soleReturn(body);
  const pieces = value ? valuePieces(value) : joinedPieces(body);
  return pieces ? patternOf(pieces) : null;
}

/** `return property.text`: the key a traits callback takes each entry's text from. */
export function entryTextKey(code: string): string | null {
  return fieldOf(soleReturn(parseCallbackBody(code)) ?? undefined, PROPERTY);
}

/** `return property`: a callback that hands each item back as it is. */
export function returnsItemUnchanged(code: string): boolean {
  return isName(soleReturn(parseCallbackBody(code)) ?? undefined, PROPERTY);
}

function formulaOf(node: JsNode): string | null {
  const wrapped = (child: JsNode): string | null => {
    const text = formulaOf(child);
    return text !== null && (child.kind === 'binary' || child.kind === 'unary') ? `(${text})` : text;
  };
  switch (node.kind) {
    case 'number': return String(node.value);
    case 'name': return node.name === 'stat' ? SLOT_WORD : null;
    case 'member': {
      const key = fieldOf(node);
      return key && FORMULA_KEY.test(key) && key !== SLOT_WORD && !isFormulaFunction(key) ? key : null;
    }
    case 'call': {
      const callee = node.callee;
      if (callee.kind !== 'member' || !isName(callee.object, 'Math') || !MATH_FUNCTIONS.has(callee.key)) return null;
      const args = node.args.map(formulaOf);
      return args.length > 0 && args.every((arg) => arg !== null) ? `${callee.key}(${args.join(', ')})` : null;
    }
    case 'unary': {
      const operand = node.op === '-' || node.op === '+' ? wrapped(node.arg) : null;
      return operand === null ? null : `${node.op === '-' ? '-' : ''}${operand}`;
    }
    case 'binary': {
      if (!ARITHMETIC.has(node.op)) return null;
      const left = wrapped(node.left);
      const right = wrapped(node.right);
      return left === null || right === null ? null : `${left} ${node.op} ${right}`;
    }
    default: return null;
  }
}

/**
 * A table's `modifier` (`stat` is the score) as a formula over `value`, or
 * null where it is more than arithmetic. FS adds `return` to a bare expression.
 */
export function modifierFormula(code: string): string | null {
  const value = soleReturn(parseCallbackBody(/\breturn\b/.test(code) ? code : `return ${code}`));
  const text = value ? formulaOf(value) : null;
  return text !== null && !isExpressionError(parseFormula(text)) ? text : null;
}
