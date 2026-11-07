import type { CampaignBooks } from '../../../campaigns/players/CampaignBooks';
import { isBookKey, withBook } from '../../../campaigns/players/booksFile';
import { companionTimers, type Timers } from '../companionTimers.ts';
import type { BookSource } from './BookShelf.ts';
import type { StoredBook } from './bookStore.ts';

/** How long a character's book waits after its first change before the campaign's file is written: every note typed would write it otherwise. */
export const BOOK_WRITE_MS = 2_000;

/** A source that is written down at some point, and so has changes waiting. */
export interface FlushableBookSource extends BookSource {
  /** Writes every change that still waits. */
  flush(): void;
}

/**
 * The books of one campaign, kept in its books file. A change is taken in at once for reading and
 * written `BOOK_WRITE_MS` after the first change of its character, touching that character's
 * entry only, so the books another device wrote stay.
 */
export class CampaignBookSource implements FlushableBookSource {
  private readonly pending = new Map<string, { readonly book: StoredBook; readonly timer: number }>();

  constructor(
    private readonly books: CampaignBooks,
    private readonly campaignId: string,
    private readonly timers: Timers = companionTimers(),
  ) {}

  read(characterId: string): StoredBook | undefined {
    return this.pending.get(characterId)?.book ?? this.books.of(this.campaignId, characterId);
  }

  write(characterId: string, book: StoredBook): boolean {
    if (!isBookKey(characterId) || !this.books.canChange(this.campaignId)) return false;
    const waiting = this.pending.get(characterId);
    this.pending.set(characterId, { book, timer: waiting?.timer ?? this.timers.setTimer(() => this.writeNow(characterId), BOOK_WRITE_MS) });
    return true;
  }

  flush(): void {
    for (const characterId of [...this.pending.keys()]) this.writeNow(characterId);
  }

  private writeNow(characterId: string): void {
    const waiting = this.pending.get(characterId);
    if (waiting === undefined) return;
    this.pending.delete(characterId);
    this.timers.clearTimer(waiting.timer);
    if (!this.books.change(this.campaignId, (stored) => withBook(stored, characterId, waiting.book))) console.error('[Atlas] A character\'s book could not be written to the campaign.');
  }
}

/** The books of `campaignId`, kept in its folder. */
export const campaignBookSource = (books: CampaignBooks, campaignId: string, timers?: Timers): FlushableBookSource => new CampaignBookSource(books, campaignId, timers);

/**
 * The source the shelf of the GM's online play is made with: it keeps nothing while no campaign
 * is bound, so books stay in memory, and the campaign's books once one is.
 */
export class BoundBookSource implements FlushableBookSource {
  private bound: FlushableBookSource | null = null;

  /** Keeps books in `source` from now on, or nowhere for null; what the last one still had to write is written first. */
  bind(source: FlushableBookSource | null): void {
    this.bound?.flush();
    this.bound = source;
  }

  read(characterId: string): StoredBook | undefined {
    return this.bound?.read(characterId);
  }

  write(characterId: string, book: StoredBook): boolean {
    return this.bound?.write(characterId, book) ?? false;
  }

  flush(): void {
    this.bound?.flush();
  }
}
