import { hashText } from '../utils/hashing';
import type { Translations } from '.';
import type { Message, Translation } from './types';

/** Stands in a packed table where the language has no text for the key: a text is a string or its plural forms, never a number. */
export const MISSING = 0;

/** A language's texts without their keys: `values[i]` belongs to the i-th key of the source table. */
interface PackedLocale {
  readonly values: ReadonlyArray<Message | typeof MISSING>;
  /** The texts under keys the source table lacks. */
  readonly extra?: Readonly<Record<string, Message>>;
}

/** Every language of a build, packed against the keys of one of them (the source table). */
export interface PackedLocales {
  readonly keyCount: number;
  readonly keyHash: string;
  /** In the order they were registered; `null` is the source table itself. */
  readonly languages: ReadonlyArray<readonly [code: string, table: PackedLocale | null]>;
}

function keyHash(keys: readonly string[]): string {
  return hashText(JSON.stringify(keys));
}

function isMessage(value: unknown): value is Message {
  if (typeof value === 'string') return true;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  return Object.values(value).every((form) => typeof form === 'string');
}

function packTable(code: string, table: Translation, keys: readonly string[], known: ReadonlySet<string>): PackedLocale {
  const texts = new Map<string, Message>();
  for (const [key, value] of Object.entries<unknown>(table)) {
    if (!isMessage(value)) throw new Error(`${code}: "${key}" is neither a text nor its plural forms, so the language cannot be packed`);
    texts.set(key, value);
  }
  const values = keys.map((key) => texts.get(key) ?? MISSING);
  const extra = Object.fromEntries([...texts].filter(([key]) => !known.has(key)));
  return Object.keys(extra).length > 0 ? { values, extra } : { values };
}

/**
 * `translations` with every key written once: each language but `sourceCode` keeps only its texts,
 * in the order of the source table's keys. `unpackLocales` gives the same tables back.
 */
export function packLocales(translations: Translations, sourceCode: string): PackedLocales {
  const source = translations[sourceCode];
  if (!source) throw new Error(`"${sourceCode}" is not among the languages, so the others cannot be packed against it`);
  const keys = Object.keys(source);
  const known = new Set(keys);
  return {
    keyCount: keys.length,
    keyHash: keyHash(keys),
    languages: Object.entries(translations).map(([code, table]) => [code, table === source ? null : packTable(code, table, keys, known)]),
  };
}

function unpackTable(packed: PackedLocale, keys: readonly string[]): Translation {
  const texts: Array<[string, Message]> = [];
  packed.values.forEach((value, index) => {
    const key = keys[index];
    if (key !== undefined && value !== MISSING) texts.push([key, value]);
  });
  return Object.fromEntries([...texts, ...Object.entries(packed.extra ?? {})]);
}

/**
 * The tables `packLocales` packed, read against the keys of `source` as it is now. Texts are matched to
 * keys by position alone, so a source table with other keys, or the same keys in another order, throws
 * instead of showing a text under the wrong key.
 */
export function unpackLocales(source: Translation, packed: PackedLocales): Translations {
  const keys = Object.keys(source);
  const hash = keyHash(keys);
  if (keys.length !== packed.keyCount || hash !== packed.keyHash) {
    throw new Error(
      `Atlas' translations were packed for ${packed.keyCount} source texts (${packed.keyHash}), but this build holds ${keys.length} (${hash}). Build the plugin again.`,
    );
  }
  return Object.fromEntries(packed.languages.map(([code, table]) => [code, table ? unpackTable(table, keys) : source]));
}
