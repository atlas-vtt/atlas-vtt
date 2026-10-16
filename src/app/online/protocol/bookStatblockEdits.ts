import { bookLine, bookText, MAX_BOOK_TITLE } from './bookText.ts';
import { isRecord } from './shape.ts';
import { isFieldKey, isSheetKey, MAX_FIELD_TEXT, MAX_SHEET_KEYS, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, parseSheetRaw, type SheetRaw } from './sheetValues.ts';

/**
 * A player sets one value of their character's statblock: `value` is the whole new value, null to
 * clear it, or with `cell` (row, column) the one cell of a table it changes. `base` names the value
 * the sheet showed, and the GM's Atlas refuses an edit of a value that has changed since.
 */
export interface BookFieldMessage {
  readonly t: 'book-field';
  readonly key: string;
  readonly base: string;
  readonly value: SheetRaw;
  readonly cell?: readonly [number, number];
}

/** An ability as a player writes it: its name, its text, and a value per part of its list. */
export interface AbilityInput {
  readonly name: string;
  readonly text: string;
  readonly parts: Readonly<Record<string, SheetRaw>>;
}

/** A player adds an ability to a list of theirs (after the entry `after` names, or first for null), changes one or removes one. */
export type BookAbilityMessage =
  | { readonly t: 'book-ability'; readonly op: 'add'; readonly list: string; readonly after: string | null; readonly entry: AbilityInput }
  | { readonly t: 'book-ability'; readonly op: 'edit'; readonly list: string; readonly key: string; readonly entry: AbilityInput }
  | { readonly t: 'book-ability'; readonly op: 'remove'; readonly list: string; readonly key: string };

const isIndex = (value: unknown, below: number): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < below;

export function parseBookFieldMessage(value: Record<string, unknown>): BookFieldMessage | null {
  if (!isFieldKey(value.key) || !isSheetKey(value.base)) return null;
  const raw = parseSheetRaw(value.value);
  if (raw === undefined) return null;
  if (value.cell === undefined) return { t: 'book-field', key: value.key, base: value.base, value: raw };
  const cell = value.cell;
  if (!Array.isArray(cell) || cell.length !== 2 || !isIndex(cell[0], MAX_TABLE_ROWS) || !isIndex(cell[1], MAX_TABLE_COLUMNS)) return null;
  if (raw !== null && typeof raw !== 'string' && typeof raw !== 'number') return null;
  return { t: 'book-field', key: value.key, base: value.base, value: raw, cell: [cell[0], cell[1]] };
}

/** An ability as a player wrote it, cleaned; its name may not be empty, its text may. */
export function parseAbilityInput(value: unknown): AbilityInput | null {
  if (!isRecord(value) || !isRecord(value.parts) || Object.keys(value.parts).length > MAX_SHEET_KEYS) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  const text = bookText(value.text, MAX_FIELD_TEXT);
  const parts = parseSheetRaw(value.parts);
  if (name === null || text === null || parts === undefined) return null;
  return { name, text, parts: parts as Record<string, SheetRaw> };
}

export function parseBookAbilityMessage(value: Record<string, unknown>): BookAbilityMessage | null {
  if (!isFieldKey(value.list)) return null;
  const list = value.list;
  if (value.op === 'remove') return isSheetKey(value.key) ? { t: 'book-ability', op: 'remove', list, key: value.key } : null;
  const entry = parseAbilityInput(value.entry);
  if (entry === null) return null;
  if (value.op === 'edit') return isSheetKey(value.key) ? { t: 'book-ability', op: 'edit', list, key: value.key, entry } : null;
  if (value.op !== 'add' || (value.after !== null && !isSheetKey(value.after))) return null;
  return { t: 'book-ability', op: 'add', list, after: value.after, entry };
}
