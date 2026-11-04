import { isPlainRecord } from './fieldValueOf';

const MAX_DEPTH = 32;

function isEmptyAt(value: unknown, depth: number): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (typeof value === 'number') return Number.isNaN(value);
  if (depth >= MAX_DEPTH) return false;
  if (Array.isArray(value)) return value.every((item) => isEmptyAt(item, depth + 1));
  if (isPlainRecord(value)) return Object.values(value).every((item) => isEmptyAt(item, depth + 1));
  return false;
}

/**
 * Whether a value says nothing: missing, null, blank text, or a list or record
 * holding only such values. `0` and `false` are values.
 */
export function isEmptyValue(value: unknown): boolean {
  return isEmptyAt(value, 0);
}
