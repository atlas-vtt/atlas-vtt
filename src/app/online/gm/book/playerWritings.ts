import { MAX_BOOK_NOTES, MAX_BOOK_PINS, type PlayerBookMessage } from '../../protocol/index.ts';
import type { BookShelf } from './BookShelf.ts';
import { applyBookMessage, type ShelfMessage, type StoredBook } from './bookStore.ts';

/** The book a player's own writing goes to, whichever character they play: `player:` cannot be an asset's id or a `token:` key. */
export const ownBookOf = (player: string): string => `player:${player}`;

/** What a player wrote themselves, which is theirs to read whichever character they play now. */
export type Writings = Pick<StoredBook, 'notes' | 'pins'>;

/** A note or pin written or taken away: all a player may write without a character. */
export type WritingMessage = Extract<ShelfMessage, { readonly t: 'book-note' | 'book-note-delete' | 'book-pin' | 'book-pin-delete' }>;

export const isWriting = (message: PlayerBookMessage): message is WritingMessage =>
  message.t === 'book-note' || message.t === 'book-note-delete' || message.t === 'book-pin' || message.t === 'book-pin-delete';

/** What became of a writing: taken, or taken and the page now holds all it takes though the own book has room, so it needs its book again. */
export type WritingOutcome = 'refused' | 'taken' | 'page-full';

const MAX = { notes: MAX_BOOK_NOTES, pins: MAX_BOOK_PINS } as const;

/**
 * Each entry once, the first book's copy, as many as the page is sent: the first book's whole, then
 * each other's newest; its order is newest last, the first book's last, as a new entry stands on the
 * page. Under the maximum while the first book has room, since the page refuses a new entry at it.
 */
function joined<T extends { readonly id: string }>(lists: readonly (readonly T[])[], max: number): T[] {
  const byId = new Map<string, T>();
  for (const entry of lists.flatMap((list) => [...list].reverse())) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  const room = (lists[0]?.length ?? 0) < max;
  return [...byId.values()].slice(0, room ? max - 1 : max).reverse();
}

/** The notes and pins of a player's books as their page reads them: the first is the player's own, the rest stay kept where they are cut. */
export function writingsIn(books: readonly StoredBook[]): Writings {
  return { notes: joined(books.map((book) => book.notes), MAX.notes), pins: joined(books.map((book) => book.pins), MAX.pins) };
}

/** Which entry a message is about, and whether it puts one there rather than takes one away. */
function aboutOf(message: WritingMessage): { readonly id: string; readonly list: keyof Writings; readonly puts: boolean } {
  switch (message.t) {
    case 'book-note':
      return { id: message.note.id, list: 'notes', puts: true };
    case 'book-note-delete':
      return { id: message.id, list: 'notes', puts: false };
    case 'book-pin':
      return { id: message.pin.id, list: 'pins', puts: true };
    case 'book-pin-delete':
      return { id: message.id, list: 'pins', puts: false };
  }
}

/**
 * Writes into a player's books (`keys`, their own first): into every one that holds the entry, since
 * a copy left behind would come back when the books are read in another order, else into the own
 * book. Nothing is written where one of them refuses.
 */
export function writeWriting(shelf: BookShelf, keys: readonly string[], message: WritingMessage, now: number, quests: ReadonlySet<string>): WritingOutcome {
  const { id, list, puts } = aboutOf(message);
  const holding = keys.filter((key) => shelf.of(key)[list].some((entry) => entry.id === id));
  const written: [string, StoredBook][] = [];
  for (const key of holding.length > 0 ? holding : keys.slice(0, 1)) {
    const book = applyBookMessage(shelf.of(key), message, now, quests);
    if (book === null) return 'refused';
    written.push([key, book]);
  }
  for (const [key, book] of written) shelf.keep(key, book);
  if (!puts || holding.length > 0) return 'taken';
  const books = keys.map((key) => shelf.of(key));
  const held = new Set(books.flatMap((book) => book[list].map((entry) => entry.id))).size;
  return held >= MAX[list] && (books[0]?.[list].length ?? 0) < MAX[list] ? 'page-full' : 'taken';
}
