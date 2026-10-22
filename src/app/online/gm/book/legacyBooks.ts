import type { CampaignBooks } from '../../../campaigns/players/CampaignBooks';
import { bookIn, withBook } from '../../../campaigns/players/booksFile';
import { mergeBooks, migrateBooks, unmigratedBooks, type LibraryToken } from './bookMigration.ts';
import { EMPTY_BOOK, type BookData, type StoredBook } from './bookStore.ts';

/**
 * Carries the books an older Atlas kept in this device's data into the books file of `campaignId`,
 * a book already in the file staying the file's. Settles once the file is on disk, and answers
 * what stays behind in the data: the books no library token takes over. Null when the carried
 * books are not on disk afterwards (the campaign's file cannot be written, or its write failed),
 * and then nothing is to be removed from the data.
 */
export async function carryBooksOver(old: BookData, tokens: readonly LibraryToken[], books: CampaignBooks, campaignId: string): Promise<BookData | null> {
  const carried = new Map<string, StoredBook>();
  migrateBooks(old, tokens, (characterId, book) => {
    const held = carried.get(characterId);
    carried.set(characterId, held === undefined ? book : mergeBooks(held, book));
  });
  const left = unmigratedBooks(old, tokens);
  if (carried.size === 0) return left;
  const carry = (stored: Parameters<typeof withBook>[0]): ReturnType<typeof withBook> =>
    [...carried].reduce((file, [characterId, book]) => withBook(file, characterId, mergeBooks(bookIn(file, characterId) ?? EMPTY_BOOK, book)), stored);
  if (!books.change(campaignId, carry)) return null;
  await books.flush();
  // The queue of writes reports no failure, so the file is read back.
  const written = await books.onDisk(campaignId);
  if (written === null || [...carried.keys()].some((characterId) => bookIn(written, characterId) === undefined)) {
    console.error('[Atlas] The books of the campaign\'s players could not be written; they stay in this device\'s data.');
    return null;
  }
  return left;
}
