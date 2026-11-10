/**
 * Reads one object of a template file key by key. A value it cannot read is
 * reported, read as absent or as its default, and kept for writing back
 * (`keptValues.ts`); keys it does not know are copied onto the result as they
 * were, so a newer Atlas' additions survive a save.
 */

import type { FieldValue } from '../model/templateTypes';
import type { KeyOrder } from './formatKeys';
import { describeValue, jsonCopy, own } from './jsonValues';
import { KEPT_VALUES, KeptValues, type KeptValue } from './keptValues';
import type { ValueRead } from './valueReads';

type ItemRead<T> = (item: unknown, index: number) => T | undefined;

export class ObjectReader<K extends string> {
  private readonly kept = new Map<string, KeptValue>();

  constructor(
    private readonly raw: Readonly<Record<string, unknown>>,
    readonly where: string,
    readonly problems: string[],
    private readonly known: KeyOrder<K>,
  ) {}

  /** The value as read, or undefined; reports nothing, for values whose absence the caller handles. */
  get<T>(key: K, read: ValueRead<T>): T | undefined {
    const value = own(this.raw, key);
    return value === undefined ? undefined : read(value);
  }

  /** The file's value untouched. */
  rawValue(key: K): unknown {
    return own(this.raw, key);
  }

  /** A key the file may leave out. */
  optional<T>(key: K, read: ValueRead<T>, expected: string): T | undefined {
    const value = own(this.raw, key);
    if (value === undefined) return undefined;
    const result = read(value);
    if (result === undefined) this.keep(key, value, undefined, `is ${describeValue(value)}, not ${expected}; it is ignored`);
    return result;
  }

  /** `optional` as a spread: `{}` when absent or unreadable, else `{ [key]: value }`. */
  opt<P extends K, T>(key: P, read: ValueRead<T>, expected: string): Partial<Record<P, T>> {
    return spread(key, this.optional(key, read, expected));
  }

  /** A key every object of its kind has; absent reads as `fallback` without a problem. */
  withDefault<T>(key: K, read: ValueRead<T>, fallback: T, expected: string): T {
    const value = own(this.raw, key);
    if (value === undefined) return fallback;
    const result = read(value);
    if (result !== undefined) return result;
    this.keep(key, value, fallback, `is ${describeValue(value)}, not ${expected}; ${describeValue(fallback)} is used`);
    return fallback;
  }

  /**
   * A list whose unreadable entries are left out. `expected` names what an
   * entry should be; null when the entries report their own problems.
   */
  list<T>(key: K, readItem: ItemRead<T>, expected: string | null): T[] | undefined {
    return this.readList(key, readItem, expected, undefined);
  }

  /** A list every object of its kind has: absent or no list reads as empty. */
  requiredList<T>(key: K, readItem: ItemRead<T>, expected: string | null): T[] {
    return this.readList(key, readItem, expected, []);
  }

  private readList<T, F extends T[] | undefined>(key: K, readItem: ItemRead<T>, expected: string | null, fallback: F): T[] | F {
    const value = own(this.raw, key);
    if (value === undefined) return fallback;
    if (!Array.isArray(value)) {
      this.keep(key, value, fallback, `is ${describeValue(value)}, not a list; it is ignored`);
      return fallback;
    }
    const items: T[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const item: unknown = value[index];
      const read = readItem(item, index);
      if (read !== undefined) items.push(read);
    }
    const dropped = value.length - items.length;
    if (dropped === 0) return items;
    const problem = expected === null ? null : `holds ${dropped} of ${value.length} entries that are not ${expected}; they are ignored`;
    this.keep(key, value, items, problem);
    return items;
  }

  /** `list` as a spread. */
  optList<P extends K, T>(key: P, readItem: ItemRead<T>, expected: string): Partial<Record<P, T[]>> {
    return spread(key, this.list(key, readItem, expected));
  }

  /** Reports a problem with `key` and keeps its file value for writing back while the template holds `read`. */
  keep(key: K, raw: unknown, read: unknown, problem: string | null): void {
    if (problem !== null) this.report(`"${key}" ${problem}`);
    const copy = jsonCopy(raw);
    if (copy !== undefined) this.kept.set(key, { raw: copy, read });
  }

  report(problem: string): void {
    this.problems.push(`${this.where}: ${problem}.`);
  }

  /** `typed` with the file's unknown keys after it and the kept values beside it. */
  finish<T extends object>(typed: T): T {
    const unknown: [string, FieldValue][] = [];
    for (const key of Object.keys(this.raw)) {
      if (this.known.has(key)) continue;
      const value = this.raw[key];
      const copy = jsonCopy(value);
      if (copy !== undefined) unknown.push([key, copy]);
      else if (typeof value === 'object' && value !== null) this.report(`"${key}" cannot be written as JSON; it is left out`);
    }
    const extras: Record<string, FieldValue> = Object.fromEntries(unknown);
    if (this.kept.size === 0) return { ...typed, ...extras };
    return { ...typed, ...extras, [KEPT_VALUES]: new KeptValues(this.kept) };
  }
}

function spread<P extends string, T>(key: P, value: T | undefined): Partial<Record<P, T>> {
  const result: Partial<Record<P, T>> = {};
  if (value !== undefined) result[key] = value;
  return result;
}
