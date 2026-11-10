/**
 * JSON values as a template file holds them. What the parser keeps without
 * understanding it (unknown keys, blocks of a newer Atlas) is copied through
 * here, so the serializer can always write it back.
 */

import type { FieldValue } from '../model/templateTypes';

/** Deeper than this a value is not kept: `JSON.stringify` recurses and would overflow. */
const MAX_DEPTH = 100;
/** Guards against objects that share children (not JSON, but `parseTemplate` also takes objects). */
const MAX_NODES = 1_000_000;

const UNWRITABLE: unique symbol = Symbol('unwritable');
type Copied = FieldValue | undefined | typeof UNWRITABLE;

const BYTE_ORDER_MARK = 0xfeff;

/** JSON text as a file holds it, a leading byte order mark skipped; the parser's message when it is no JSON. */
export function parseJsonText(text: string): { value: unknown } | { error: string } {
  try {
    const value: unknown = JSON.parse(text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text);
    return { value };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'unreadable' };
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** A key's value as the object itself holds it; what an object inherits is not the file's. */
export function own(record: Readonly<Record<string, unknown>>, key: string): unknown {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}

/**
 * A copy of `value` as JSON writes it: non-finite numbers become null, and
 * functions, symbols and undefined are left out (null inside lists).
 * Undefined when nothing of it can be written (a cycle, too deep, too large,
 * or a value JSON leaves out entirely).
 */
export function jsonCopy(value: unknown): FieldValue | undefined {
  const copied = copy(value, 0, { nodes: MAX_NODES });
  return copied === UNWRITABLE ? undefined : copied;
}

/** A record holding only what JSON can write, or undefined when `value` is no record or cannot be written. */
export function jsonRecordCopy(value: unknown): Record<string, FieldValue> | undefined {
  if (!isRecord(value)) return undefined;
  const copied = jsonCopy(value);
  return isRecord(copied) ? copied : undefined;
}

function copy(value: unknown, depth: number, budget: { nodes: number }): Copied {
  budget.nodes -= 1;
  if (budget.nodes < 0) return UNWRITABLE;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'object') return undefined;
  if (value === null) return null;
  if (depth >= MAX_DEPTH) return UNWRITABLE;
  if (Array.isArray(value)) {
    const items: FieldValue[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const item = copy(value[index], depth + 1, budget);
      if (item === UNWRITABLE) return UNWRITABLE;
      items.push(item === undefined ? null : item);
    }
    return items;
  }
  if (!isRecord(value)) return undefined;
  const entries: [string, FieldValue][] = [];
  for (const key of Object.keys(value)) {
    const item = copy(value[key], depth + 1, budget);
    if (item === UNWRITABLE) return UNWRITABLE;
    if (item !== undefined) entries.push([key, item]);
  }
  return Object.fromEntries(entries);
}

/** Equality as JSON sees it: string keys only, keys holding undefined count as absent. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, index) => sameJson(item, b[index]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keysA = definedKeys(a);
  const keysB = definedKeys(b);
  return keysA.length === keysB.length && keysA.every((key) => Object.hasOwn(b, key) && sameJson(a[key], b[key]));
}

function definedKeys(record: Record<string, unknown>): string[] {
  return Object.keys(record).filter((key) => record[key] !== undefined);
}

/** A short description of a value for a problem sentence. */
export function describeValue(value: unknown): string {
  if (typeof value === 'string') return `"${value.length > 40 ? `${value.slice(0, 40)}…` : value}"`;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'a list';
  return typeof value === 'object' ? 'an object' : 'nothing';
}
