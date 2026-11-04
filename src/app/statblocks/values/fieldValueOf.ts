import type { FieldValue } from '../model/templateTypes';

/** Frontmatter is a tree; anything deeper than this is no statblock value (and may be a YAML alias cycle). */
const MAX_DEPTH = 32;

/**
 * A plain object, never a list, Date or Map. Read by its tag rather than its
 * prototype, so a record made in another window (a popout) counts too.
 */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Object.prototype.toString.call(value) === '[object Object]';
}

function isFieldValue(value: unknown, depth: number): value is FieldValue {
  if (value === null) return true;
  switch (typeof value) {
    case 'string': case 'number': case 'boolean': return true;
    case 'object': break;
    default: return false;
  }
  if (depth >= MAX_DEPTH) return false;
  if (Array.isArray(value)) return value.every((item) => isFieldValue(item, depth + 1));
  return isPlainRecord(value) && Object.values(value).every((item) => isFieldValue(item, depth + 1));
}

function converted(value: unknown, depth: number): FieldValue | undefined {
  if (value === null) return null;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  if (typeof value !== 'object' || depth >= MAX_DEPTH) return undefined;
  if (Array.isArray(value)) return value.map((item) => converted(item, depth + 1) ?? null);
  if (!isPlainRecord(value)) return undefined;
  const record: Record<string, FieldValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const next = converted(item, depth + 1);
    if (next !== undefined) record[key] = next;
  }
  return record;
}

/**
 * A frontmatter value as a `FieldValue`. A value that already is one comes back
 * as the same object, so memoised readers keep their identity; anything else
 * (a Date, a function, a value nested too deeply) is converted or left out.
 */
export function toFieldValue(value: unknown): FieldValue | undefined {
  if (value === undefined) return undefined;
  if (isFieldValue(value, 0)) return value;
  return converted(value, 0);
}
