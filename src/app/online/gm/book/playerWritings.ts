import { MAX_BOOK_NOTES, MAX_BOOK_PINS } from '../../protocol/index.ts';
import type { BookShelf } from './BookShelf.ts';
import type { ShelfMessage, StoredBook } from './bookStore.ts';

/** What a player wrote themselves, which is theirs to read whichever character they play now. */
export type Writings = Pick<StoredBook, 'notes' | 'pins'>;

/** Each entry once, the first of an id, as many as a book holds; the rest stay kept and unsent. */
function joined<T extends { readonly id: string }>(entries: readonly T[], max: number): T[] {
  const byId = new Map<string, T>();
  for (const entry of entries) if (!byId.has(entry.id)) byId.set(entry.id, entry);
  return [...byId.values()].slice(0, max);
}

/** The notes and pins of several books as one player reads them: the first book's first. */
export function writingsIn(books: readonly StoredBook[]): Writings {
  return { notes: joined(books.flatMap((book) => book.notes), MAX_BOOK_NOTES), pins: joined(books.flatMap((book) => book.pins), MAX_BOOK_PINS) };
}

/** The note or pin a message is about, as the books hold them; null for any other message. */
function writing(message: ShelfMessage): { readonly id: string; readonly list: keyof Writings } | null {
  switch (message.t) {
    case 'book-note':
      return { id: message.note.id, list: 'notes' };
    case 'book-note-delete':
      return { id: message.id, list: 'notes' };
    case 'book-pin':
      return { id: message.pin.id, list: 'pins' };
    case 'book-pin-delete':
      return { id: message.id, list: 'pins' };
    default:
      return null;
  }
}

/** The book among `keys` that already holds what a message is about: an edit goes where the note or pin lies, so there is never a second of it. */
export function bookHolding(shelf: BookShelf, keys: readonly string[], message: ShelfMessage): string | undefined {
  const about = writing(message);
  return about === null ? undefined : keys.find((key) => shelf.of(key)[about.list].some((entry) => entry.id === about.id));
}
