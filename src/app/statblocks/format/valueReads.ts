/** Readers for single values of a template file: each returns the value, or undefined when it is not one. */

import type { FieldValue } from '../model/templateTypes';
import { jsonRecordCopy } from './jsonValues';

export type ValueRead<T> = (value: unknown) => T | undefined;

export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

/** A field key or another name that must not be empty. */
export function asKey(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function asBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

/** A switch written only where it is on: `true`, never `false`. */
export function asTrue(value: unknown): true | undefined {
  return value === true ? true : undefined;
}

export function asOneOf<T extends string | number>(options: readonly T[]): ValueRead<T> {
  return (value: unknown): T | undefined => options.find((option) => option === value);
}

export function asPositiveInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && typeof value === 'number' && value > 0 ? value : undefined;
}

export function asNonNegativeInteger(value: unknown): number | undefined {
  return Number.isSafeInteger(value) && typeof value === 'number' && value >= 0 ? value : undefined;
}

export function asPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

/** What `asJsonRecord` expects, for problem sentences: an object too deep to write back is refused too. */
export const JSON_OBJECT = 'an object JSON can write';

export function asJsonRecord(value: unknown): Record<string, FieldValue> | undefined {
  return jsonRecordCopy(value);
}

/** Text, or a number written as text: lookup tables are hand-edited, and `"1": 200` means `"200"`. */
export function asText(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
}

/** "one, two or three", for problem sentences. */
export function choices(options: readonly (string | number)[]): string {
  const words = options.map(String);
  return words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} or ${words[words.length - 1] ?? ''}`;
}
