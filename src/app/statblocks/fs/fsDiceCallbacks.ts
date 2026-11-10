/**
 * Recognises the Fantasy Statblocks `diceCallback` that only picks where a
 * line's dice come from, as Basic 5e's hit points do:
 *
 *   if ("hit_dice" in monster) { return [{ text: monster["hit_dice"] }]; } else { return property; }
 *
 * The dice roll from a field where the creature has it, else from the line's
 * own text. That is what a Value's `rollFrom` does in Atlas (its dice where
 * the value shows none to click), so such a callback becomes `rollFrom` and is
 * not kept as code. The code is read, never run. Pure.
 */

import type { FieldKey } from '../model/templateTypes';
import { fieldOf, isName } from './fsCallbackPatterns';
import { parseCallbackBody, type JsNode, type JsStatement } from './fsCallbackSyntax';

const MONSTER = 'monster';
const PROPERTY = 'property';

/** `"key" in monster` or `monster.key`: the key whose presence the test asks for. */
function testedKey(test: JsNode): FieldKey | null {
  if (test.kind === 'binary' && test.op === 'in' && test.left.kind === 'string' && isName(test.right, MONSTER)) return test.left.value;
  return fieldOf(test);
}

/** `[{ text: monster.key }]` or `monster.key`: the field whose text is rolled. */
function rolledKey(node: JsNode | null): FieldKey | null {
  if (node?.kind !== 'array') return fieldOf(node);
  const [only, ...more] = node.items;
  if (only?.kind !== 'object' || more.length > 0 || only.entries.length !== 1) return null;
  const [[name, value] = ['', null]] = only.entries;
  return name === 'text' ? fieldOf(value) : null;
}

/** One `return` alone. */
function returned(statements: readonly JsStatement[] | undefined): JsNode | null | undefined {
  const [only, ...more] = statements ?? [];
  return only?.kind === 'return' && more.length === 0 ? only.value : undefined;
}

/**
 * The field a dice callback rolls from where the creature has it, the line's
 * own text otherwise; null for any other callback (it is then kept as code).
 */
export function diceCallbackKey(code: string): FieldKey | null {
  const body = parseCallbackBody(code);
  const [guard, ...after] = body ?? [];
  if (guard?.kind !== 'if') return null;
  const fallback = guard.otherwise ? (after.length === 0 ? returned(guard.otherwise) : undefined) : returned(after);
  if (!isName(fallback, PROPERTY)) return null;
  const key = testedKey(guard.test);
  return key !== null && rolledKey(returned(guard.then) ?? null) === key ? key : null;
}
