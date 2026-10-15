import { parseBookCharacter, parseBookResourceMessage, type BookCharacter, type BookResourceMessage } from './bookCharacter.ts';
import { MAX_BOOK_PINS, parseBookPin, type BookPin, type BookQuest } from './bookMap.ts';
import { isBookPartType, parseBookPart, parseQuests, parseWorldMap, type BookPartMessage, type BookWorldMap } from './bookParts.ts';
import { DEFAULT_BOOK_SLOTS, parseBookSlots, parseEquipped, parseSlotMessage, settledEquipped, type BookSlots, type Equipped, type SlotMessage } from './bookSlots.ts';
import { bookLine, bookText, MAX_BOOK_TITLE } from './bookText.ts';
import { isRecord } from './shape.ts';
import { MAX_TOKEN_VALUE } from './tokenUI.ts';

export * from './bookCharacter.ts';
export * from './bookLevels.ts';
export * from './bookMap.ts';
export * from './bookParts.ts';
export * from './questText.ts';

/** What a player's book holds at most. */
export const MAX_BOOK_ITEMS = 200;
export const MAX_BOOK_NOTES = 60;
export const MAX_PURSE_ROWS = 6;
/** The longest texts of a book, in characters. A note's body is as long as one player frame carries. */
export const MAX_NOTE_BODY = 2000;
export const MAX_ITEM_TEXT = 4000;
export const MAX_ITEM_PROPERTIES = 16;
export const MAX_ITEM_VALUE = 200;
export const MAX_COIN_NAME = 24;
/** An item's, note's or pin's id: 96 random bits in hex, made by whoever made the thing. */
export const BOOK_ID_PATTERN = /^[0-9a-f]{24}$/;
/** The ladder an item's rarity is coloured by; null for a rarity outside it. */
export const ITEM_TONES = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
export type ItemTone = (typeof ITEM_TONES)[number];

/** An item the GM handed to the character, as text only. `at` is the GM's clock when it was given. */
export interface BookItem {
  readonly id: string;
  readonly name: string;
  readonly type: string | null;
  readonly rarity: string | null;
  readonly tone: ItemTone | null;
  readonly price: string | null;
  readonly description: string | null;
  readonly properties: readonly { readonly label: string; readonly value: string }[];
  readonly at: number;
}

/** A note as its player writes it; shown as text only. A note written on a quest names it, and is not among the free notes. */
export interface BookNoteDraft {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly quest?: string;
}

/** A note as the GM keeps it: `at` is the GM's clock when it was last written. */
export interface BookNote extends BookNoteDraft {
  readonly at: number;
}

/** One kind of coin and how many of it the character carries. */
export interface PurseRow {
  readonly name: string;
  readonly amount: number;
}

/** Everything one player's pages besides the table show. Without a character only the world map is there. */
export interface PlayerBook {
  readonly character: BookCharacter | null;
  readonly worldMap: BookWorldMap | null;
  readonly items: readonly BookItem[];
  readonly notes: readonly BookNote[];
  readonly pins: readonly BookPin[];
  /** The quests the GM gave the character, in the GM's order; a GM that gives none sends none. */
  readonly quests: readonly BookQuest[];
  readonly purse: readonly PurseRow[];
  /** The player's slots, and which item lies in which; a GM that knows no slots sends neither (the defaults, nothing equipped). */
  readonly slots: BookSlots;
  readonly equipped: readonly Equipped[];
}

/** Sent to one player: their book whole, the character alone once only it changed, an item just handed over, or another part alone (`BookPartMessage`). */
export type BookMessage =
  | { readonly t: 'book'; readonly book: PlayerBook }
  | { readonly t: 'book-sheet'; readonly character: BookCharacter | null }
  | { readonly t: 'book-item'; readonly item: BookItem }
  | BookPartMessage;

/** What a player writes into their own book. The GM keeps it and answers a refused one with the whole book. */
export type PlayerBookMessage =
  | { readonly t: 'book-note'; readonly note: BookNoteDraft }
  | { readonly t: 'book-note-delete'; readonly id: string }
  | { readonly t: 'book-pin'; readonly pin: BookPin }
  | { readonly t: 'book-pin-delete'; readonly id: string }
  | { readonly t: 'book-purse'; readonly purse: readonly PurseRow[] }
  | BookResourceMessage
  | SlotMessage;

const GM_TYPES: readonly unknown[] = ['book', 'book-sheet', 'book-item', 'book-map', 'book-quests'];
const PLAYER_TYPES: readonly unknown[] = ['book-note', 'book-note-delete', 'book-pin', 'book-pin-delete', 'book-purse', 'book-resource', 'book-equip', 'book-slots'];

export const isBookType = (t: unknown): t is BookMessage['t'] => GM_TYPES.includes(t);
export const isPlayerBookType = (t: unknown): t is PlayerBookMessage['t'] => PLAYER_TYPES.includes(t);

const isId = (value: unknown): value is string => typeof value === 'string' && BOOK_ID_PATTERN.test(value);
const isTime = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function parseList<T>(value: unknown, max: number, parse: (entry: unknown) => T | null): T[] | null {
  if (!Array.isArray(value) || value.length > max) return null;
  const parsed: T[] = [];
  for (const entry of value) {
    const item = parse(entry);
    if (item === null) return null;
    parsed.push(item);
  }
  return parsed;
}

/** Entries with ids, each id once. */
function distinct<T extends { readonly id: string }>(entries: T[] | null): T[] | null {
  return entries !== null && new Set(entries.map((entry) => entry.id)).size === entries.length ? entries : null;
}

/** A line that may be missing: null when it is, undefined when it is malformed. */
function optionalLine(value: unknown, max: number): string | null | undefined {
  if (value === null) return null;
  return bookLine(value, max) ?? undefined;
}

function parseProperty(value: unknown): { label: string; value: string } | null {
  if (!isRecord(value)) return null;
  const label = bookLine(value.label, MAX_BOOK_TITLE);
  const text = bookLine(value.value, MAX_ITEM_VALUE);
  return label === null || text === null ? null : { label, value: text };
}

export function parseBookItem(value: unknown): BookItem | null {
  if (!isRecord(value) || !isId(value.id) || !isTime(value.at)) return null;
  const name = bookLine(value.name, MAX_BOOK_TITLE);
  const type = optionalLine(value.type, MAX_BOOK_TITLE);
  const rarity = optionalLine(value.rarity, MAX_BOOK_TITLE);
  const price = optionalLine(value.price, MAX_BOOK_TITLE);
  const description = value.description === null ? null : bookText(value.description, MAX_ITEM_TEXT);
  const properties = parseList(value.properties, MAX_ITEM_PROPERTIES, parseProperty);
  const tone = value.tone === null || (ITEM_TONES as readonly unknown[]).includes(value.tone) ? (value.tone as ItemTone | null) : undefined;
  if (name === null || type === undefined || rarity === undefined || price === undefined || tone === undefined || properties === null) return null;
  if (description === null && value.description !== null) return null;
  return { id: value.id, name, type, rarity, tone, price, description, properties, at: value.at };
}

/** A note as its player sent it, cleaned; a title may be empty. */
export function parseBookNoteDraft(value: unknown): BookNoteDraft | null {
  if (!isRecord(value) || !isId(value.id)) return null;
  const title = bookLine(value.title, MAX_BOOK_TITLE, true);
  const body = bookText(value.body, MAX_NOTE_BODY);
  if (title === null || body === null || (value.quest !== undefined && value.quest !== null && !isId(value.quest))) return null;
  return isId(value.quest) ? { id: value.id, title, body, quest: value.quest } : { id: value.id, title, body };
}

function parseBookNote(value: unknown): BookNote | null {
  const draft = parseBookNoteDraft(value);
  return draft === null || !isRecord(value) || !isTime(value.at) ? null : { ...draft, at: value.at };
}

function parsePurseRow(value: unknown): PurseRow | null {
  if (!isRecord(value) || typeof value.amount !== 'number' || !Number.isInteger(value.amount) || value.amount < 0 || value.amount > MAX_TOKEN_VALUE) return null;
  const name = bookLine(value.name, MAX_COIN_NAME);
  return name === null ? null : { name, amount: value.amount };
}

export function parsePurse(value: unknown): PurseRow[] | null {
  return parseList(value, MAX_PURSE_ROWS, parsePurseRow);
}

export function parsePlayerBook(value: unknown): PlayerBook | null {
  if (!isRecord(value)) return null;
  const character = parseBookCharacter(value.character);
  const worldMap = parseWorldMap(value.worldMap);
  const items = distinct(parseList(value.items, MAX_BOOK_ITEMS, parseBookItem));
  const notes = distinct(parseList(value.notes, MAX_BOOK_NOTES, parseBookNote));
  const pins = distinct(parseList(value.pins, MAX_BOOK_PINS, parseBookPin));
  const quests = parseQuests(value.quests);
  const purse = parsePurse(value.purse);
  const slots = value.slots === undefined ? DEFAULT_BOOK_SLOTS : parseBookSlots(value.slots);
  const equipped = value.equipped === undefined ? [] : parseEquipped(value.equipped);
  if (character === undefined || worldMap === undefined || items === null || notes === null || pins === null || quests === null || purse === null || slots === null || equipped === null) return null;
  return { character, worldMap, items, notes, pins, quests, purse, slots, equipped: settledEquipped(equipped, slots, items) };
}

/** A book message as the page reads it, or null for anything malformed. */
export function parseBookMessage(value: Record<string, unknown>): BookMessage | null {
  if (value.t === 'book') {
    const book = parsePlayerBook(value.book);
    return book === null ? null : { t: 'book', book };
  }
  if (value.t === 'book-sheet') {
    const character = parseBookCharacter(value.character);
    return character === undefined ? null : { t: 'book-sheet', character };
  }
  if (isBookPartType(value.t)) return parseBookPart(value);
  const item = value.t === 'book-item' ? parseBookItem(value.item) : null;
  return item === null ? null : { t: 'book-item', item };
}

/** What a player wrote into their book as the GM reads it, cleaned; null for anything malformed. */
export function parsePlayerBookMessage(value: Record<string, unknown>): PlayerBookMessage | null {
  switch (value.t) {
    case 'book-note': {
      const note = parseBookNoteDraft(value.note);
      return note === null ? null : { t: 'book-note', note };
    }
    case 'book-pin': {
      const pin = parseBookPin(value.pin);
      return pin === null ? null : { t: 'book-pin', pin };
    }
    case 'book-note-delete':
    case 'book-pin-delete':
      return isId(value.id) ? { t: value.t, id: value.id } : null;
    case 'book-purse': {
      const purse = parsePurse(value.purse);
      return purse === null ? null : { t: 'book-purse', purse };
    }
    case 'book-resource':
      return parseBookResourceMessage(value);
    case 'book-equip':
    case 'book-slots':
      return parseSlotMessage(value);
    default:
      return null;
  }
}
