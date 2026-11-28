import { isRecord } from '../../utils/guards';

/**
 * Where a preference is kept: `synced` in the plugin's `data.json`, which sync tools carry to the
 * GM's other devices; `device` in the vault's local storage, which never leaves this one.
 */
export type PreferenceStore = 'synced' | 'device';

/** What a store holds under a key, undefined where it holds nothing. */
export type StoredEntries = (key: string) => unknown;

/** What a change stores, by key; undefined takes the key out of the store. */
export type StoredChange = Readonly<Record<string, unknown>>;

/** One preference: the store it lives in, the keys it is stored under, how it is read and what a change stores. */
export interface PreferenceRow<T, Change = T> {
  readonly store: PreferenceStore;
  readonly keys: readonly string[];
  /** The value as stored. What Atlas cannot use (a hand edit, another version's value) reads as the default. */
  read(stored: StoredEntries): T;
  /** The entries a change stores, under the row's keys only. */
  write(change: Change, stored: StoredEntries): StoredChange;
  /**
   * For a key that other devices write: what its value in the file becomes as the file is read,
   * undefined to leave it out, so a hostile value is never kept to be written back.
   */
  readonly onLoad?: (stored: unknown) => unknown;
  /**
   * For a row that keeps another version's entries inside its value (the hotkeys' bindings of
   * actions this version lacks): when another device's file arrives during the save wait, a change
   * made here is written again over what arrived instead of replacing it, so those entries stay.
   */
  readonly rebasesOnArrival?: true;
}

/** Any row, for tables that hold rows of different types. */
export type AnyPreferenceRow = PreferenceRow<unknown, never>;
export type PreferenceValueOf<R> = R extends { read(stored: StoredEntries): infer T } ? T : never;
export type PreferenceChangeOf<R> = R extends { write(change: infer C, stored: StoredEntries): StoredChange } ? C : never;

interface Codec {
  /** The stored form as a value to read: device rows keep records as JSON text. */
  decode?: (stored: unknown) => unknown;
  /** The form a value is stored in. */
  encode?: (value: unknown) => unknown;
}

const same = (value: unknown): unknown => value;

/** A preference stored whole under one key: a change replaces what was stored. */
export function whole<T>(store: PreferenceStore, key: string, read: (stored: unknown) => T, { decode = same, encode = same }: Codec = {}): PreferenceRow<T> {
  return {
    store,
    keys: [key],
    read: (stored) => read(decode(stored(key))),
    write: (value) => ({ [key]: encode(value) }),
  };
}

/**
 * A record under one key, changed field by field. A change stores the checked value of each field
 * it names over the record as stored, so fields another version keeps there survive, and so do
 * values of this version's fields that only a newer one can read.
 */
export function fields<T extends object>(store: PreferenceStore, key: string, read: (stored: unknown) => T, { decode = same, encode = same }: Codec = {}): PreferenceRow<T, Partial<T>> {
  return {
    store,
    keys: [key],
    read: (stored) => read(decode(stored(key))),
    write: (change, stored) => {
      const before = decode(stored(key));
      const record = isRecord(before) ? before : {};
      const checked = new Map(Object.entries(read({ ...record, ...change })));
      const changed = Object.fromEntries(Object.keys(change).map((field) => [field, checked.get(field)]));
      return { [key]: encode({ ...record, ...changed }) };
    },
  };
}

/** A store a row reads from and writes to. */
export interface PreferenceStorage {
  entry: StoredEntries;
  put(change: StoredChange): void;
}

/**
 * The steps every change takes: what the row stores for it, nothing at all when the value read
 * back would be the one read before, else the entries put into the store. Returns whether the
 * store changed, which is when listeners are told.
 */
export function applyChange<T, C>(row: PreferenceRow<T, C>, change: C, storage: PreferenceStorage): boolean {
  const before = row.read(storage.entry);
  const entries = row.write(change, storage.entry);
  const after = row.read((key) => (key in entries ? entries[key] : storage.entry(key)));
  if (sameValue(before, after)) return false;
  storage.put(entries);
  return true;
}

/** Whether two values read from the store are equal, records and lists field by field. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, index) => sameValue(item, b[index]));
  }
  if (!isRecord(a) || !isRecord(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => key in b && sameValue(a[key], b[key]));
}
