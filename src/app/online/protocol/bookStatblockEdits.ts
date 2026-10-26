import { bookLine, bookText, MAX_BOOK_TITLE } from './bookText.ts';
import { isRecord } from './shape.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';
import { isFieldKey, isPairLabel, isSheetKey, MAX_FIELD_TEXT, MAX_SHEET_KEYS, MAX_TABLE_COLUMNS, MAX_TABLE_ROWS, parseSheetRaw, type SheetRaw } from './sheetValues.ts';

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

/** A label with its value in a list of them (Experiences: "Bounty Hunter" +2); the value may be missing. */
export interface SheetPairItem {
  readonly label: string;
  readonly value: string | number | null;
}

/** One entry of a list value a player adds or takes out: a word of a Words value, or a label with its value. */
export type SheetListItem = string | SheetPairItem;

/**
 * A player adds an entry at the end of a list value of their character's statblock (Words, Labels
 * and values) or takes one out: the first the list holds that equals `item`. The GM's Atlas writes
 * it as an insert or removal of that entry alone, so a change the GM made to the list meanwhile
 * stays. A GM from before `LIST_EDITS_GM_LEVEL` leaves the message unread.
 */
export interface BookListMessage {
  readonly t: 'book-list';
  readonly op: 'add' | 'remove';
  readonly key: string;
  readonly item: SheetListItem;
}

/** The GM level from which the GM's Atlas takes `book-list`. */
export const LIST_EDITS_GM_LEVEL = 4;

/** A pair's value as sent: a number, a line, or none (an empty line is none). */
function pairValue(value: unknown): string | number | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= MAX_TOKEN_VALUE ? value : undefined;
  return bookLine(value, MAX_BOOK_TITLE) ?? undefined;
}

/** An entry of a list as a player sends it, cleaned: a word is one line, a label a key a note can store a value under. */
export function parseSheetListItem(value: unknown): SheetListItem | null {
  if (typeof value === 'string') return bookLine(value, MAX_BOOK_TITLE);
  if (!isRecord(value)) return null;
  const label = typeof value.label === 'string' ? bookLine(value.label, MAX_BOOK_TITLE) : null;
  const held = pairValue(value.value);
  return label !== null && isPairLabel(label) && held !== undefined ? { label, value: held } : null;
}

export function parseBookListMessage(value: Record<string, unknown>): BookListMessage | null {
  if ((value.op !== 'add' && value.op !== 'remove') || !isFieldKey(value.key)) return null;
  const item = parseSheetListItem(value.item);
  return item === null ? null : { t: 'book-list', op: value.op, key: value.key, item };
}

/**
 * A player takes one of their sheet's refills ("Long rest"): the GM's Atlas gives back the uses of
 * every counter on the sheet that refill names, rolling the rows that regain a formula.
 */
export interface BookRefillMessage {
  readonly t: 'book-refill';
  readonly refill: string;
}

export function parseBookRefillMessage(value: Record<string, unknown>): BookRefillMessage | null {
  const refill = bookLine(value.refill, MAX_BOOK_TITLE);
  return refill === null ? null : { t: 'book-refill', refill };
}
