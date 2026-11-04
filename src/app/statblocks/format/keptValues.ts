/**
 * Values of known keys that the parser could not read as they stood in the
 * file: a field type or a meaning of a newer Atlas, a list with an entry that
 * is not what it should be. The template holds what was read; the file's own
 * value rides along under a symbol and is written back for as long as the
 * template still holds exactly what was read, so opening and saving a template
 * loses nothing. Once an edit changes the value, the edit is written.
 *
 * The symbol is an enumerable own property, so spreads and Immer's copies keep
 * it, while JSON, `Object.keys` and `structuredClone` never see it.
 */

import type { FieldValue } from '../model/templateTypes';
import { sameJson } from './jsonValues';

export const KEPT_VALUES: unique symbol = Symbol('atlas-template-kept-values');

export interface KeptValue {
  /** The file's value, copied as JSON writes it. */
  raw: FieldValue;
  /** What the parser read in its place (undefined: the key was left out). */
  read: unknown;
}

export class KeptValues {
  constructor(readonly entries: ReadonlyMap<string, KeptValue>) {}
}

function keptValuesOf(target: object): KeptValues | undefined {
  if (!(KEPT_VALUES in target)) return undefined;
  const kept = target[KEPT_VALUES];
  return kept instanceof KeptValues ? kept : undefined;
}

/**
 * What the file gets for `key` of `target`: the file's own value while
 * `current` is still what was read in its place, otherwise `current`.
 */
export function writtenValue(target: object, key: string, current: unknown): { kept: boolean; value: unknown } {
  const kept = keptValuesOf(target)?.entries.get(key);
  if (kept && sameJson(current, kept.read)) return { kept: true, value: kept.raw };
  return { kept: false, value: current };
}

/** The keys whose file values ride along on `target`, for tests and diagnostics. */
export function keptKeys(target: object): string[] {
  return [...(keptValuesOf(target)?.entries.keys() ?? [])];
}
