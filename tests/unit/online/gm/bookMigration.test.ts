import { describe, expect, it } from 'vitest';
import type { BookItem, BookNote, BookPin } from '../../../../src/app/online/protocol/index.ts';
import { mergeBooks, migrateBooks, unmigratedBooks } from '../../../../src/app/online/gm/book/bookMigration.ts';
import { EMPTY_BOOK, type StoredBook } from '../../../../src/app/online/gm/book/bookStore.ts';

const id = (count: number): string => count.toString(16).padStart(24, '0');
const note = (count: number, at: number, body = 'Body'): BookNote => ({ id: id(count), title: `Note ${count}`, body, at });
const pin = (count: number, title = `Pin ${count}`): BookPin => ({ id: id(count), x: 0.25, y: 0.75, kind: 'danger', title, body: '' });
const item = (count: number, name = `Item ${count}`): BookItem => ({ id: id(count), name, type: null, rarity: null, tone: null, price: null, description: null, properties: [], at: count });
const book = (changes: Partial<StoredBook>): StoredBook => ({ ...EMPTY_BOOK, ...changes });

const TOKENS = [
  { id: 'lib-a', collection: 'Cairn', imagePath: 'art/x.webp' },
  { id: 'lib-b', collection: 'Cairn', imagePath: 'art/x.webp' },
  { id: 'lib-c', collection: 'Cairn', imagePath: 'art/y.webp' },
  { id: 'lib-d', collection: 'Dolmenwood', imagePath: 'art/x.webp' },
];

describe('carrying the books of an older Atlas over', () => {
  it('hands an old book to every token of its collection that wears its artwork', () => {
    const handed: [string, StoredBook][] = [];
    const old = book({ notes: [note(1, 10)] });
    migrateBooks({ Cairn: { 'art/x.webp': old } }, TOKENS, (characterId, kept) => handed.push([characterId, kept]));
    expect(handed).toEqual([['lib-a', old], ['lib-b', old]]);
  });

  it('leaves a book whose artwork no token has, an empty one, and one of a collection with no such token', () => {
    const handed: string[] = [];
    migrateBooks({
      Cairn: { 'art/gone.webp': book({ notes: [note(1, 10)] }), 'art/y.webp': EMPTY_BOOK },
      '': { 'art/x.webp': book({ notes: [note(2, 10)] }) },
      Elsewhere: { 'art/x.webp': book({ notes: [note(3, 10)] }) },
    }, TOKENS, (characterId) => handed.push(characterId));
    expect(handed).toEqual([]);
  });
});

describe('what stays behind in the old data', () => {
  it('is exactly the books no library token takes over', () => {
    const kept = book({ notes: [note(1, 10)] });
    const stray = book({ notes: [note(2, 10)] });
    const left = unmigratedBooks({
      Cairn: { 'art/x.webp': kept, 'art/gone.webp': stray, 'art/y.webp': EMPTY_BOOK },
      Elsewhere: { 'art/x.webp': stray },
    }, TOKENS);
    expect(left).toEqual({ Cairn: { 'art/gone.webp': stray }, Elsewhere: { 'art/x.webp': stray } });
  });
});

describe('two books of one character', () => {
  it('keep both notes of two ids and the later of one id', () => {
    const merged = mergeBooks(book({ notes: [note(1, 10, 'Mine'), note(2, 50, 'Newer here')] }), book({ notes: [note(2, 20, 'Older there'), note(3, 5)] }));
    expect(merged.notes.map(({ id: noteId, body, at }) => [noteId, body, at])).toEqual([[id(1), 'Mine', 10], [id(2), 'Newer here', 50], [id(3), 'Body', 5]]);
    const later = mergeBooks(book({ notes: [note(2, 20, 'Older here')] }), book({ notes: [note(2, 50, 'Newer there')] }));
    expect(later.notes.map(({ body }) => body)).toEqual(['Newer there']);
  });

  it('unite pins and items by id, the first book\'s winning', () => {
    const merged = mergeBooks(book({ pins: [pin(1, 'Here')], items: [item(1, 'Here')] }), book({ pins: [pin(1, 'There'), pin(2)], items: [item(1, 'There'), item(2)] }));
    expect(merged.pins.map(({ title }) => title)).toEqual(['Here', 'Pin 2']);
    expect(merged.items.map(({ name }) => name)).toEqual(['Here', 'Item 2']);
  });

  it('take the first book\'s purse, slots and equipment unless it has none, then the second\'s', () => {
    const slots = { hidden: ['ammunition'], own: [] };
    const full = book({ purse: [{ name: 'Gold', amount: 4 }], slots, items: [item(1)], equipped: [{ slot: 'head', item: id(1) }] });
    const other = book({ purse: [{ name: 'Silver', amount: 9 }], slots: { hidden: ['cloak'], own: [] }, items: [item(1)], equipped: [{ slot: 'neck', item: id(1) }] });
    expect(mergeBooks(full, other)).toMatchObject({ purse: [{ name: 'Gold' }], slots, equipped: [{ slot: 'head' }] });
    expect(mergeBooks(EMPTY_BOOK, other)).toMatchObject({ purse: [{ name: 'Silver' }], slots: { hidden: ['cloak'] }, equipped: [{ slot: 'neck' }] });
  });
});
