import type { FieldValue } from '../model/templateTypes';

type FieldMap = { [key: string]: FieldValue };

/**
 * Structural equality of frontmatter values. Types must match (`5` is not `"5"`), map keys
 * compare in any order, list items in order; `NaN` equals `NaN`.
 */
export function deepEqual(a: FieldValue | undefined, b: FieldValue | undefined): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return Number.isNaN(a) && Number.isNaN(b);
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && listsEqual(a, b);
  }
  return mapsEqual(a, b);
}

/**
 * Where `item` is in `list`: `preferredIndex` when it holds the item, else the matching index
 * nearest to it (the first on a tie, and the first of all without a preference); -1 if none.
 */
export function findItemIndex(list: readonly FieldValue[], item: FieldValue, preferredIndex?: number): number {
  if (preferredIndex !== undefined && deepEqual(list[preferredIndex], item)) return preferredIndex;
  let found = -1;
  for (let index = 0; index < list.length; index++) {
    if (!deepEqual(list[index], item)) continue;
    if (preferredIndex === undefined) return index;
    if (found === -1 || Math.abs(index - preferredIndex) < Math.abs(found - preferredIndex)) found = index;
  }
  return found;
}

/** Every index of `list` whose item passes `test`. */
export function matchingIndexes(list: readonly FieldValue[], test: (index: number) => boolean): number[] {
  const indexes: number[] = [];
  for (let index = 0; index < list.length; index++) if (test(index)) indexes.push(index);
  return indexes;
}

/** A plain map of frontmatter values (not a list, not null). */
export function isFieldMap(value: FieldValue | undefined): value is FieldMap {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function listsEqual(a: readonly FieldValue[], b: readonly FieldValue[]): boolean {
  return a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
}

function mapsEqual(a: FieldMap, b: FieldMap): boolean {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every((key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]));
}
