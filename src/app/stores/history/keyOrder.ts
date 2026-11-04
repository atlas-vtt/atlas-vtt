/** A plain record of entities (or collections, or values) as the store keeps them. */
export type Entries = Readonly<Record<string, unknown>>;

const hasOwn = (record: Entries, key: string): boolean => Object.prototype.hasOwnProperty.call(record, key);

export function isPlainRecord(value: unknown): value is Entries {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Whether a step changed the order of the keys it kept: the keys present on both sides
 * follow each other differently (an entity deleted and added again in one write).
 */
export function orderChanged(from: Entries, to: Entries): boolean {
  const kept = Object.keys(from).filter((key) => hasOwn(to, key));
  const keptInTo = Object.keys(to).filter((key) => hasOwn(from, key));
  return kept.some((key, i) => keptInTo[i] !== key);
}

/** The keys whose presence or value reference differs between the sides; every key of both when the order changed. */
export function changedKeys(from: Entries, to: Entries, reordered: boolean): string[] {
  const keys = new Set([...Object.keys(from), ...Object.keys(to)]);
  if (reordered) return [...keys];
  return [...keys].filter((key) => hasOwn(from, key) !== hasOwn(to, key) || from[key] !== to[key]);
}

export function isKey(record: Entries, key: string): boolean {
  return hasOwn(record, key);
}

/** The entries of a record being rebuilt: values changed in place, keys removed, keys placed at an index. */
export class EntryList {
  private readonly values: Map<string, unknown>;
  private readonly placed: { key: string; index: number; value: unknown }[] = [];

  constructor(record: Entries) {
    this.values = new Map(Object.keys(record).map((key) => [key, record[key]]));
  }

  /** Changes the value of a key the record holds, where it is. */
  set(key: string, value: unknown): void {
    this.values.set(key, value);
  }

  remove(key: string): void {
    this.values.delete(key);
  }

  /** Places the key at `index` once the record is built, lowest index first, clamped to the length. */
  insert(key: string, index: number, value: unknown): void {
    this.values.delete(key);
    this.placed.push({ key, index, value });
  }

  /** The record, or `same` itself when the entries are its own, in its order. */
  toRecord(same: Entries): Entries {
    const entries = [...this.values.entries()];
    for (const { key, index, value } of [...this.placed].sort((a, b) => a.index - b.index)) {
      entries.splice(Math.min(index, entries.length), 0, [key, value]);
    }
    const keys = Object.keys(same);
    if (keys.length === entries.length && entries.every(([key, value], i) => keys[i] === key && same[key] === value)) return same;
    // `fromEntries` defines every key as the record's own, `__proto__` included.
    return Object.freeze(Object.fromEntries(entries));
  }
}
