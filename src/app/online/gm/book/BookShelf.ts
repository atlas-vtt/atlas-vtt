import { EMPTY_BOOK, isEmptyBook, type StoredBook } from './bookStore.ts';

/** What names a character whose token was placed from no library token: its book lives in memory only. */
export const UNPLACED_PREFIX = 'token:';

/** Where the books of a campaign's characters are kept, by the character's library token id. */
export interface BookSource {
  /** A character's book as it is kept; undefined for none. */
  read(characterId: string): StoredBook | undefined;
  /** Keeps a character's book (an empty one takes it away). False when it cannot be kept, as when no campaign is played or its file is of a later format. */
  write(characterId: string, book: StoredBook): boolean;
}

/**
 * The books the GM keeps, one per character. A book is its character's, so whoever plays that
 * character next finds it again. They are kept by the source (the campaign's books file); a book
 * that cannot be kept there, and one of a token that is no library token's, stays in memory for
 * as long as the shelf lives.
 */
export class BookShelf {
  private readonly memory = new Map<string, StoredBook>();

  constructor(private readonly source: BookSource = { read: () => undefined, write: () => false }) {}

  /** A character's book; an empty one while nothing was written into it. */
  of(characterId: string): StoredBook {
    return this.memory.get(characterId) ?? this.source.read(characterId) ?? EMPTY_BOOK;
  }

  /**
   * Forgets the books held in memory for want of a source, but those of tokens that are no library
   * token's: from now on the source (a campaign's books file just bound) holds each character's.
   */
  forgetKept(): void {
    for (const characterId of [...this.memory.keys()]) if (!characterId.startsWith(UNPLACED_PREFIX)) this.memory.delete(characterId);
  }

  /** Keeps a character's book as it is now. */
  keep(characterId: string, book: StoredBook): void {
    if (!characterId.startsWith(UNPLACED_PREFIX) && this.source.write(characterId, book)) {
      this.memory.delete(characterId);
      return;
    }
    if (isEmptyBook(book)) this.memory.delete(characterId);
    else this.memory.set(characterId, book);
  }
}
