import { MAX_BOOK_ITEMS, MAX_BOOK_NOTES, MAX_BOOK_PINS, settledEquipped } from '../../protocol/index.ts';
import { isEmptyBook, type BookData, type StoredBook } from './bookStore.ts';

/** A library token as the migration reads it: which collection it is in and whose artwork it wears. */
export interface LibraryToken {
  readonly id: string;
  readonly collection: string;
  readonly imagePath: string;
}

interface Entry {
  readonly id: string;
}

/** The entries of both lists, each id once: `a`'s place and entry, unless `later` picks `b`'s; at most the last `max`. */
function unite<T extends Entry>(a: readonly T[], b: readonly T[], max: number, later: (kept: T, other: T) => T = (kept) => kept): readonly T[] {
  const united = new Map(a.map((entry) => [entry.id, entry]));
  for (const entry of b) {
    const kept = united.get(entry.id);
    united.set(entry.id, kept === undefined ? entry : later(kept, entry));
  }
  return [...united.values()].slice(-max);
}

/**
 * Two books of one character as one. Notes, pins and items are united by id: of a note both hold,
 * the later `at` stays, of a pin or an item `a`'s. The purse, the slots and what is equipped are
 * `a`'s unless it has none, then `b`'s.
 */
export function mergeBooks(a: StoredBook, b: StoredBook): StoredBook {
  const items = unite(a.items, b.items, MAX_BOOK_ITEMS);
  const ownSlots = a.slots.hidden.length + a.slots.own.length > 0;
  const slots = ownSlots ? a.slots : b.slots;
  return {
    items,
    notes: unite(a.notes, b.notes, MAX_BOOK_NOTES, (kept, other) => (other.at > kept.at ? other : kept)),
    pins: unite(a.pins, b.pins, MAX_BOOK_PINS),
    purse: a.purse.length > 0 ? a.purse : b.purse,
    slots,
    equipped: settledEquipped(a.equipped.length > 0 ? a.equipped : b.equipped, slots, items),
  };
}

/**
 * Hands every book an older Atlas kept by collection and artwork to `into`, once for each library
 * token that is in that collection and wears that artwork. A book whose artwork no token has stays
 * behind, and so do empty ones.
 */
export function migrateBooks(old: BookData, tokens: readonly LibraryToken[], into: (characterId: string, book: StoredBook) => void): void {
  for (const [collection, characters] of Object.entries(old)) {
    for (const [artwork, book] of Object.entries(characters)) {
      if (isEmptyBook(book)) continue;
      for (const token of tokens) if (token.collection === collection && token.imagePath === artwork) into(token.id, book);
    }
  }
}

/** The books no library token takes over: those whose artwork no token of their collection wears. Empty ones are nothing to keep. */
export function unmigratedBooks(old: BookData, tokens: readonly LibraryToken[]): BookData {
  const left: Record<string, Record<string, StoredBook>> = {};
  for (const [collection, characters] of Object.entries(old)) {
    for (const [artwork, book] of Object.entries(characters)) {
      if (isEmptyBook(book) || tokens.some((token) => token.collection === collection && token.imagePath === artwork)) continue;
      left[collection] = { ...left[collection], [artwork]: book };
    }
  }
  return left;
}
