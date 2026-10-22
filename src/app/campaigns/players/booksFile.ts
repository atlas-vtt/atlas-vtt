/**
 * `books.json` in a campaign's folder: what the players of the campaign wrote into the books of
 * their characters. `{ format, campaignId, books: { <library token id>: { items, notes, pins,
 * purse, slots, equipped } } }`. A book is its character's, so whoever plays that character next
 * finds it again, and it follows the library token, not its artwork. Fields Atlas does not know
 * are kept.
 */

import { isEmptyBook, readStoredBook, type StoredBook } from '../../online/gm/book/bookStore';
import type { RecordLayout, StoredRecord } from '../../services/recordFiles/recordLayout';
import { campaignFileLayout } from '../campaignFileLayout';
import { isAssetId, isRecord } from '../campaignValues';

export const BOOKS_FILE = 'books.json';
/** The format this Atlas writes; a file of a later one is read and never written. */
export const BOOKS_FORMAT = 1;

/** A books file as stored, with its `campaignId` as the record's id. */
export type StoredBooks = StoredRecord;

const FILE = campaignFileLayout({ file: BOOKS_FILE, format: BOOKS_FORMAT, kind: 'campaign books' });

/** Whether `path` is a books file: `books.json` directly in a campaign's folder. */
export const isBooksPath = FILE.isPath;

/** The books file of the campaign whose folder is `folder`. */
export const booksPathIn = FILE.pathIn;

/** A books file lies in its campaign's folder (see `campaignFileLayout`). */
export const BOOKS_LAYOUT: RecordLayout<StoredBooks> = FILE.layout;

/** Whether this Atlas may write the file: one of a later format is only read. */
export const isWritable: (stored: StoredBooks) => boolean = FILE.isWritable;

/** An empty books file for a campaign. */
export const emptyBooks = (campaignId: string): StoredBooks => ({ id: campaignId, campaignId, books: {} });

/** Whether a character's book can be kept in the file: only a library token's id names one. */
export const isBookKey = isAssetId;

/** The book of the character `characterId` the file holds; undefined for none. */
export function bookIn(stored: StoredBooks, characterId: string): StoredBook | undefined {
  if (!isRecord(stored.books) || !Object.hasOwn(stored.books, characterId)) return undefined;
  return readStoredBook(stored.books[characterId]) ?? undefined;
}

/**
 * The file with the book of `characterId` set to `book` (removed when it is empty); every other
 * character's entry stays exactly as the file held it.
 */
export function withBook(stored: StoredBooks, characterId: string, book: StoredBook): StoredBooks {
  if (!isWritable(stored) || !isBookKey(characterId)) return stored;
  const { [characterId]: _removed, ...others } = isRecord(stored.books) ? stored.books : {};
  return { ...stored, books: isEmptyBook(book) ? others : { ...others, [characterId]: book } };
}
