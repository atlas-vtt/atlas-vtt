import { afterEach, describe, expect, it } from 'vitest';
import { CampaignFiles } from '../../../src/app/campaigns/CampaignFiles';
import { CAMPAIGNS_FOLDER } from '../../../src/app/campaigns/campaignPaths';
import { CampaignBooks } from '../../../src/app/campaigns/players/CampaignBooks';
import { bookIn, emptyBooks, isBooksPath, withBook } from '../../../src/app/campaigns/players/booksFile';
import { EMPTY_BOOK, type StoredBook } from '../../../src/app/online/gm/book/bookStore';
import { createInMemoryApp } from '../../mocks/inMemoryVault';

const FOLDER = `${CAMPAIGNS_FOLDER}/Witherwild`;
const campaignText = `${JSON.stringify({ format: 1, id: 'c1', name: 'Witherwild', createdAt: 1 })}\n`;
const noteId = (count: number): string => count.toString(16).padStart(24, '0');
const bookWith = (count: number): StoredBook => ({ ...EMPTY_BOOK, notes: [{ id: noteId(count), title: `Note ${count}`, body: 'Body', at: count }] });

const opened: ReturnType<typeof createInMemoryApp>[] = [];
const settle = async (): Promise<void> => { for (let i = 0; i < 5; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };

async function device(files: Record<string, string> = { [`${FOLDER}/campaign.json`]: campaignText }): Promise<{ vault: ReturnType<typeof createInMemoryApp>; books: CampaignBooks }> {
  const vault = createInMemoryApp({ files });
  opened.push(vault);
  await CampaignFiles.open(vault.app).load();
  const books = CampaignBooks.open(vault.app);
  await books.whenLoaded();
  return { vault, books };
}

afterEach(() => {
  for (const vault of opened.splice(0)) {
    CampaignBooks.release(vault.app);
    CampaignFiles.release(vault.app);
  }
});

describe('books.json', () => {
  it('lies directly in a campaign\'s folder', () => {
    expect(isBooksPath(`${FOLDER}/books.json`)).toBe(true);
    expect(isBooksPath(`${FOLDER}/deeper/books.json`)).toBe(false);
    expect(isBooksPath(`${FOLDER}/players.json`)).toBe(false);
  });

  it('sets one character\'s book and leaves every other entry as the file held it', () => {
    const held = { ...emptyBooks('c1'), books: { A: bookWith(1), B: { ...bookWith(2), futureField: { kept: true } } } };
    const next = withBook(held, 'A', bookWith(3));
    expect(bookIn(next, 'A')?.notes.map((note) => note.id)).toEqual([noteId(3)]);
    expect((next.books as Record<string, unknown>).B).toBe((held.books as Record<string, unknown>).B);
    expect(withBook(next, 'A', EMPTY_BOOK).books).toEqual({ B: (held.books as Record<string, unknown>).B });
  });

  it('a later format is never written', async () => {
    const later = `${JSON.stringify({ format: 2, campaignId: 'c1', books: {} })}\n`;
    const { vault, books } = await device({ [`${FOLDER}/campaign.json`]: campaignText, [`${FOLDER}/books.json`]: later });
    expect(books.canChange('c1')).toBe(false);
    expect(books.change('c1', (stored) => withBook(stored, 'A', bookWith(1)))).toBe(false);
    await books.flush();
    expect(vault.files.get(`${FOLDER}/books.json`)).toBe(later);
    const stored = emptyBooks('c1');
    expect(withBook({ ...stored, format: 2 }, 'A', bookWith(1))).toEqual({ ...stored, format: 2 });
  });

  it('creates the file in the campaign\'s folder, and refuses a campaign without one', async () => {
    const { vault, books } = await device();
    expect(books.canChange('c1')).toBe(true);
    expect(books.canChange('nowhere')).toBe(false);
    expect(books.change('nowhere', (stored) => withBook(stored, 'A', bookWith(1)))).toBe(false);
    expect(books.change('c1', (stored) => withBook(stored, 'A', bookWith(1)))).toBe(true);
    await books.flush();
    expect(JSON.parse(vault.files.get(`${FOLDER}/books.json`)!)).toMatchObject({ format: 1, campaignId: 'c1', books: { A: { notes: [{ id: noteId(1) }] } } });
    expect(books.of('c1', 'A')?.notes).toHaveLength(1);
    expect(books.of('c1', 'B')).toBeUndefined();
  });

  it('changing A keeps a book another device wrote for B meanwhile', async () => {
    const { vault, books } = await device();
    books.change('c1', (stored) => withBook(stored, 'A', bookWith(1)));
    await books.flush();
    const path = `${FOLDER}/books.json`;
    // Another device's copy arrives on disk before this device writes again.
    const onDisk = JSON.parse(vault.files.get(path)!) as { books: Record<string, unknown> };
    onDisk.books.B = bookWith(2);
    vault.files.set(path, `${JSON.stringify(onDisk)}\n`);
    books.change('c1', (stored) => withBook(stored, 'A', bookWith(3)));
    await books.flush();
    const written = JSON.parse(vault.files.get(path)!) as { books: Record<string, { notes: { id: string }[] }> };
    expect(written.books.A?.notes.map((note) => note.id)).toEqual([noteId(3)]);
    expect(written.books.B?.notes.map((note) => note.id)).toEqual([noteId(2)]);
    await settle();
  });
});
