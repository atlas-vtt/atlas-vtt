import { isRecord } from './shape.ts';

/**
 * The numbers a player's `@` references name on their own character's sheet (`@str`, `@str.mod`,
 * `@prof`), as the GM's Atlas reads them from what the player may see: so the page fills in a
 * reference the moment it is typed, as the card fills it in once the note holds it. A reference to
 * a field the player may not see, or to anything else, names none there and stays as written.
 */
export type SheetReferences = Readonly<Record<string, number>>;

/** The most numbers one sheet names for references. */
export const MAX_SHEET_REFERENCES = 256;
/** The longest path a reference's number is named by. */
export const MAX_REFERENCE_PATH = 96;
/** The largest number a reference names, either way. */
export const MAX_REFERENCE_NUMBER = 1_000_000_000;

const REFERENCE_KEY = /^[a-z0-9]+(?:\.[a-z0-9]+)*$/;

/**
 * The key a reference's path is named by: each dotted part without case, spaces, `_` or `-`, as the
 * card matches a field's or a slot's name (`@Hit_Dice` and `@hit-dice` are `hitdice`).
 */
export function referenceKey(path: string): string {
  return path.split('.').map((part) => part.toLowerCase().replace(/[\s_-]/g, '')).join('.');
}

/** Whether a key is one a sheet may name a number by. */
export function isReferenceKey(value: unknown): value is string {
  return typeof value === 'string' && value.length <= MAX_REFERENCE_PATH && REFERENCE_KEY.test(value);
}

/** Whether a number is one a reference may name. */
export const isReferenceNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= MAX_REFERENCE_NUMBER;

/** A sheet's references as the page reads them: undefined for none, null when malformed. */
export function parseSheetReferences(value: unknown): SheetReferences | null | undefined {
  if (value === undefined) return undefined;
  if (!isRecord(value)) return null;
  const entries = Object.entries(value);
  if (entries.length > MAX_SHEET_REFERENCES || entries.some(([key, number]) => !isReferenceKey(key) || !isReferenceNumber(number))) return null;
  return Object.fromEntries(entries) as SheetReferences;
}

/** The number a sheet names for a reference's path, or undefined. */
export function referenceNumber(references: SheetReferences | undefined, path: string): number | undefined {
  const key = referenceKey(path);
  return references !== undefined && Object.hasOwn(references, key) ? references[key] : undefined;
}
