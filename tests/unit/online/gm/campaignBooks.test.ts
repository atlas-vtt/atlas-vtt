import { afterEach, describe, expect, it, vi } from 'vitest';
import { CampaignFiles } from '../../../../src/app/campaigns/CampaignFiles';
import { CAMPAIGNS_FOLDER } from '../../../../src/app/campaigns/campaignPaths';
import { CampaignBooks } from '../../../../src/app/campaigns/players/CampaignBooks';
import { BookShelf } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { BOOK_WRITE_MS, BoundBookSource, campaignBookSource } from '../../../../src/app/online/gm/book/campaignBookSource.ts';
import { carryBooksOver } from '../../../../src/app/online/gm/book/legacyBooks.ts';
import { EMPTY_BOOK, type StoredBook } from '../../../../src/app/online/gm/book/bookStore.ts';
import type { Timers } from '../../../../src/app/online/gm/companionTimers.ts';
import { createInMemoryApp } from '../../../mocks/inMemoryVault';

const FOLDER = `${CAMPAIGNS_FOLDER}/Witherwild`;
const PATH = `${FOLDER}/books.json`;
const campaignText = `${JSON.stringify({ format: 1, id: 'c1', name: 'Witherwild', createdAt: 1 })}\n`;
const id = (count: number): string => count.toString(16).padStart(24, '0');
const bookWith = (count: number): StoredBook => ({ ...EMPTY_BOOK, notes: [{ id: id(count), title: `Note ${count}`, body: 'Body', at: count }] });

/** Timers the test moves on by hand. */
function fakeTimers(): Timers & { advance(ms: number): void } {
  let now = 0;
  let next = 1;
  const due = new Map<number, { at: number; run: () => void }>();
  return {
    now: () => now,
    setTimer: (run, ms) => {
      due.set(next, { at: now + ms, run });
      return next++;
    },
    clearTimer: (timer) => void due.delete(timer),
    advance(ms) {
      now += ms;
      for (const [timer, entry] of [...due]) if (entry.at <= now) {
        due.delete(timer);
        entry.run();
      }
    },
  };
}

const opened: ReturnType<typeof createInMemoryApp>[] = [];

async function device(files: Record<string, string> = { [`${FOLDER}/campaign.json`]: campaignText }): Promise<{ vault: ReturnType<typeof createInMemoryApp>; books: CampaignBooks }> {
  const vault = createInMemoryApp({ files });
  opened.push(vault);
  await CampaignFiles.open(vault.app).load();
  const books = CampaignBooks.open(vault.app);
  await books.whenLoaded();
  return { vault, books };
}

const fileBooks = (vault: ReturnType<typeof createInMemoryApp>): Record<string, { notes: { id: string }[] }> => (JSON.parse(vault.files.get(PATH) ?? '{"books":{}}') as { books: Record<string, { notes: { id: string }[] }> }).books;

afterEach(() => {
  vi.restoreAllMocks();
  for (const vault of opened.splice(0)) {
    CampaignBooks.release(vault.app);
    CampaignFiles.release(vault.app);
  }
});

describe('the books of the campaign being played', () => {
  it('are read back at once and written to the campaign\'s file BOOK_WRITE_MS after the first change, one write for all of a character\'s changes', async () => {
    const { vault, books } = await device();
    const timers = fakeTimers();
    const shelf = new BookShelf(campaignBookSource(books, 'c1', timers));
    shelf.keep('lib-a', bookWith(1));
    shelf.keep('lib-a', bookWith(2));
    expect(shelf.of('lib-a').notes.map((note) => note.id)).toEqual([id(2)]);
    timers.advance(BOOK_WRITE_MS - 1);
    await books.flush();
    expect(vault.files.has(PATH)).toBe(false);
    timers.advance(1);
    await books.flush();
    expect(fileBooks(vault)['lib-a']?.notes.map((note) => note.id)).toEqual([id(2)]);
  });

  it('write only the changed character\'s entry, so a book another device wrote stays', async () => {
    const { vault, books } = await device({ [`${FOLDER}/campaign.json`]: campaignText, [PATH]: `${JSON.stringify({ format: 1, campaignId: 'c1', books: { other: bookWith(9) } })}\n` });
    const timers = fakeTimers();
    const source = campaignBookSource(books, 'c1', timers);
    source.write('lib-a', bookWith(1));
    // The other device's change reaches the disk before this one's write.
    vault.files.set(PATH, `${JSON.stringify({ format: 1, campaignId: 'c1', books: { other: bookWith(9), theirs: bookWith(8) } })}\n`);
    timers.advance(BOOK_WRITE_MS);
    await books.flush();
    expect(Object.keys(fileBooks(vault)).sort()).toEqual(['lib-a', 'other', 'theirs']);
  });

  it('are written at once when flushed, as on unload', async () => {
    const { vault, books } = await device();
    const source = campaignBookSource(books, 'c1', fakeTimers());
    source.write('lib-a', bookWith(1));
    source.flush();
    await books.flush();
    expect(Object.keys(fileBooks(vault))).toEqual(['lib-a']);
  });

  it('stay in memory while no campaign is bound, or its file is of a later format', async () => {
    const later = `${JSON.stringify({ format: 2, campaignId: 'c1', books: {} })}\n`;
    const { vault, books } = await device({ [`${FOLDER}/campaign.json`]: campaignText, [PATH]: later });
    const bound = new BoundBookSource();
    const shelf = new BookShelf(bound);
    shelf.keep('lib-a', bookWith(1));
    bound.bind(campaignBookSource(books, 'c1', fakeTimers()));
    shelf.keep('lib-b', bookWith(2));
    bound.flush();
    await books.flush();
    expect(vault.files.get(PATH)).toBe(later);
    expect(shelf.of('lib-a').notes).toHaveLength(1);
    expect(shelf.of('lib-b').notes).toHaveLength(1);
  });

  it('carry an older Atlas\'s books over, a book the file holds staying the file\'s, and leave behind what no token takes over', async () => {
    const { vault, books } = await device({ [`${FOLDER}/campaign.json`]: campaignText, [PATH]: `${JSON.stringify({ format: 1, campaignId: 'c1', books: { 'lib-a': bookWith(1) } })}\n` });
    const tokens = [{ id: 'lib-a', collection: 'Cairn', imagePath: 'art/a.webp' }, { id: 'lib-b', collection: 'Cairn', imagePath: 'art/b.webp' }];
    const stray = bookWith(4);
    const old = { Cairn: { 'art/a.webp': bookWith(2), 'art/b.webp': bookWith(3), 'art/gone.webp': stray } };
    expect(await carryBooksOver(old, tokens, books, 'c1')).toEqual({ Cairn: { 'art/gone.webp': stray } });
    const carried = fileBooks(vault);
    expect(carried['lib-a']?.notes.map((note) => note.id)).toEqual([id(1), id(2)]);
    expect(carried['lib-b']?.notes.map((note) => note.id)).toEqual([id(3)]);
    expect(Object.keys(carried).sort()).toEqual(['lib-a', 'lib-b']);
  });

  it('carry nothing over, and keep everything, when the campaign\'s file cannot take them', async () => {
    const { books } = await device();
    const tokens = [{ id: 'lib-a', collection: 'Cairn', imagePath: 'art/a.webp' }];
    const old = { Cairn: { 'art/a.webp': bookWith(2) } };
    expect(await carryBooksOver(old, tokens, books, 'nowhere')).toBeNull();
    expect(await carryBooksOver({}, tokens, books, 'nowhere')).toEqual({});
  });

  it('keep everything when the write fails or the file is of a later format', async () => {
    const tokens = [{ id: 'lib-a', collection: 'Cairn', imagePath: 'art/a.webp' }];
    const old = { Cairn: { 'art/a.webp': bookWith(2) } };
    const failing = await device();
    vi.spyOn(failing.vault.app.vault, 'create').mockRejectedValue(new Error('disk full'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(await carryBooksOver(old, tokens, failing.books, 'c1')).toBeNull();
    expect(failing.vault.files.has(PATH)).toBe(false);

    const later = `${JSON.stringify({ format: 2, campaignId: 'c1', books: {} })}\n`;
    const locked = await device({ [`${FOLDER}/campaign.json`]: campaignText, [PATH]: later });
    expect(await carryBooksOver(old, tokens, locked.books, 'c1')).toBeNull();
    expect(locked.vault.files.get(PATH)).toBe(later);
  });
});
