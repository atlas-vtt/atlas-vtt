import { parseTextAsset, type AssetRef } from './asset.ts';
import { bookLine, bookText, MAX_BOOK_TITLE } from './bookText.ts';
import { isRecord } from './shape.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';

/** The longest opening of a text on a sheet, in characters; a longer text also comes whole by hash. */
export const MAX_SHEET_TEXT = 400;
/** The longest text a player may write into a field or an ability, in characters. */
export const MAX_FIELD_TEXT = 2000;
/** The most items of a list value, cells of a table row, rows of a table and keys of a map. */
export const MAX_SHEET_LIST = 64;
export const MAX_TABLE_COLUMNS = 12;
export const MAX_TABLE_ROWS = 20;
export const MAX_SHEET_KEYS = 32;
/** The most options of a choice. */
export const MAX_SHEET_OPTIONS = 64;
/** The deepest a stored value nests (a list of maps of lists). */
const MAX_RAW_DEPTH = 3;
/** A field's key: what the statblock note stores it under. */
export const MAX_FIELD_KEY = 64;

/** A value as the character's statblock note stores it, bounded. */
export type SheetRaw = string | number | boolean | null | readonly SheetRaw[] | { readonly [key: string]: SheetRaw };

/** A text of a sheet: its opening, and the whole text by hash where it is longer. */
export interface SheetText {
  readonly opening: string;
  readonly whole?: AssetRef;
}

export const SHEET_FIELD_TYPES = ['text', 'markdown', 'number', 'rating', 'dice', 'choice', 'list', 'scores', 'pairs'] as const;
export type SheetFieldType = (typeof SHEET_FIELD_TYPES)[number];

/** What a player may change of a value: present only where they may. `base` names the value the note holds, which an edit must name back. */
export interface SheetField {
  readonly key: string;
  readonly base: string;
  readonly type: SheetFieldType;
  readonly value: SheetRaw;
  readonly options?: readonly string[];
  readonly open?: boolean;
  readonly several?: boolean;
  readonly numbered?: boolean;
  readonly unit?: string;
}

const CONTROL = /\p{Cc}/u;
/** A base or an entry's key: the content hash of a stored value and its occurrence among equal ones. */
export const SHEET_KEY_PATTERN = /^[0-9a-z]{1,8}~\d{1,4}$/;

export const isSheetKey = (value: unknown): value is string => typeof value === 'string' && SHEET_KEY_PATTERN.test(value);
/** A key a field is stored under: 1 to `MAX_FIELD_KEY` characters, none a control character. */
export const isFieldKey = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD_KEY && !CONTROL.test(value);

/** Keys a plain object answers through its prototype: a value naming one is refused, so no reader takes an inherited property for the value's own. */
const OBJECT_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype']);

/** A stored value as the page or the GM reads it, or undefined when it is malformed or larger than a sheet holds. */
export function parseSheetRaw(value: unknown, depth = 0): SheetRaw | undefined {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= MAX_TOKEN_VALUE ? value : undefined;
  if (typeof value === 'string') return bookText(value, MAX_FIELD_TEXT) ?? undefined;
  if (depth >= MAX_RAW_DEPTH) return undefined;
  if (Array.isArray(value)) {
    if (value.length > MAX_SHEET_LIST) return undefined;
    const items = value.map((item) => parseSheetRaw(item, depth + 1));
    return items.every((item) => item !== undefined) ? (items) : undefined;
  }
  if (!isRecord(value)) return undefined;
  const entries = Object.entries(value);
  if (entries.length > MAX_SHEET_KEYS) return undefined;
  const parsed: Record<string, SheetRaw> = {};
  for (const [key, item] of entries) {
    const raw = isFieldKey(key) && !OBJECT_KEYS.has(key) ? parseSheetRaw(item, depth + 1) : undefined;
    if (raw === undefined) return undefined;
    parsed[key] = raw;
  }
  return parsed;
}

/** A text of a sheet, or null when it is malformed. */
export function parseSheetText(value: unknown): SheetText | null {
  if (!isRecord(value)) return null;
  const opening = bookText(value.opening, MAX_SHEET_TEXT);
  const whole = value.whole === undefined ? undefined : parseTextAsset(value.whole);
  if (opening === null || whole === null) return null;
  return whole === undefined ? { opening } : { opening, whole };
}

/** A list of lines, each within `max`, or null. */
export function parseLines(value: unknown, most: number, max = MAX_BOOK_TITLE): string[] | null {
  if (!Array.isArray(value) || value.length > most) return null;
  const lines = value.map((line) => bookLine(line, max));
  return lines.every((line) => line !== null) ? (lines) : null;
}

/** A line that may be missing: null for none, undefined when it is malformed. */
export function optionalSheetLine(value: unknown): string | null | undefined {
  if (value === null || value === undefined) return null;
  return bookLine(value, MAX_BOOK_TITLE) ?? undefined;
}

const isFlag = (value: unknown): boolean => value === undefined || typeof value === 'boolean';

/** What a player may change of a value, null for nothing (a value they only read), or undefined when it is malformed. */
export function parseSheetField(value: unknown): SheetField | null | undefined {
  if (value === null || value === undefined) return null;
  if (!isRecord(value) || !isFieldKey(value.key) || !isSheetKey(value.base) || !(SHEET_FIELD_TYPES as readonly unknown[]).includes(value.type)) return undefined;
  const raw = parseSheetRaw(value.value);
  const options = value.options === undefined ? undefined : parseLines(value.options, MAX_SHEET_OPTIONS);
  const unit = value.unit === undefined ? undefined : bookLine(value.unit, MAX_BOOK_TITLE);
  if (raw === undefined || options === null || unit === null || !isFlag(value.open) || !isFlag(value.several) || !isFlag(value.numbered)) return undefined;
  return {
    key: value.key, base: value.base, type: value.type as SheetFieldType, value: raw,
    ...(options !== undefined && { options }),
    ...(value.open === true && { open: true }),
    ...(value.several === true && { several: true }),
    ...(value.numbered === true && { numbered: true }),
    ...(unit !== undefined && { unit }),
  };
}

/** What one parse has used of a statblock's budget: the most characters of all its texts together, and abilities over all its lists. */
export const MAX_SHEET_CHARS = 60_000;

export interface SheetBudget {
  nodes: number;
  chars: number;
  abilities: number;
}

export const newSheetBudget = (): SheetBudget => ({ nodes: 0, chars: 0, abilities: 0 });

/** Counts a text against the budget; false once the statblock holds more than it may. */
export function spendText(budget: SheetBudget, text: SheetText | string): boolean {
  budget.chars += typeof text === 'string' ? text.length : text.opening.length;
  return budget.chars <= MAX_SHEET_CHARS;
}

/** A value written with its map keys in order, so equal values read the same whatever order YAML gave their keys. */
function canonical(value: SheetRaw | undefined): string {
  if (value === undefined) return 'u';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const record = value as { readonly [key: string]: SheetRaw };
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonical(record[key])}`).join(',')}}`;
}

/** FNV-1a over the text, in base 36. */
function fnv(text: string): string {
  let h = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    h ^= text.charCodeAt(index);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * One key per item of a stored list, in its order: the hash of the item's content and how many equal
 * items came before it. The same keys the GM's Atlas gives a list's items, so a page that changed a
 * list can name its items as the GM will.
 */
export function sheetItemKeys(list: readonly (SheetRaw | undefined)[]): string[] {
  const seen = new Map<string, number>();
  return list.map((item) => {
    const content = fnv(canonical(item));
    const occurrence = seen.get(content) ?? 0;
    seen.set(content, occurrence + 1);
    return `${content}~${occurrence}`;
  });
}

/** The base that names a stored value (undefined: the note holds none). */
export const sheetBase = (value: SheetRaw | undefined): string => sheetItemKeys([value])[0] ?? 'u~0';
