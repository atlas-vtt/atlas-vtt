import {
  MAX_BOOK_ITEMS, MAX_BOOK_NOTES, MAX_BOOK_PINS, MAX_ITEM_PROPERTIES, MAX_ITEM_TEXT, MAX_BOOK_TITLE, parseBookItem, parsePlayerBook, type BookItem, type BookPin, type PlayerBookMessage,
} from '../../../../src/app/online/protocol/index.ts';
import { describe, expect, it } from 'vitest';
import type { LootDraw } from '../../../../src/app/loot/lootRoller';
import { bookItemOf } from '../../../../src/app/online/gm/book/bookItem.ts';
import { BookShelf, type BookSource } from '../../../../src/app/online/gm/book/BookShelf.ts';
import { applyBookMessage, EMPTY_BOOK, isEmptyBook, readBooks, withItem, type StoredBook } from '../../../../src/app/online/gm/book/bookStore.ts';
import { clippedLine, clippedText, openingOf } from '../../../../src/app/online/gm/book/bookTexts.ts';

/** A source that keeps books in a map, noting what it was asked to write. */
function fakeSource(accepts = true): BookSource & { readonly written: [string, StoredBook][] } {
  const kept = new Map<string, StoredBook>();
  const written: [string, StoredBook][] = [];
  return {
    written,
    read: (characterId) => kept.get(characterId),
    write: (characterId, book) => {
      if (!accepts) return false;
      written.push([characterId, book]);
      if (isEmptyBook(book)) kept.delete(characterId);
      else kept.set(characterId, book);
      return true;
    },
  };
}

const id = (count: number): string => count.toString(16).padStart(24, '0');
const note = (count: number, body = 'Body'): PlayerBookMessage => ({ t: 'book-note', note: { id: id(count), title: `Note ${count}`, body } });
const pin = (count: number): BookPin => ({ id: id(count), x: 0.25, y: 0.75, kind: 'danger', title: `Pin ${count}`, body: '' });
const item = (count: number): BookItem => ({ id: id(count), name: `Item ${count}`, type: null, rarity: null, tone: null, price: null, description: null, properties: [], at: count });

/** A book after these messages, each written at its place in the list; a refused one fails the test. */
function written(messages: readonly PlayerBookMessage[], from: StoredBook = EMPTY_BOOK): StoredBook {
  return messages.reduce((book, message, at) => {
    const next = applyBookMessage(book, message, 1000 + at, new Set());
    if (next === null) throw new Error(`refused: ${message.t}`);
    return next;
  }, from);
}

describe('a book as the GM keeps it', () => {
  it('adds a note stamped with the GM\'s clock, replaces the one of its id in place and deletes by id', () => {
    const book = written([note(1), note(2), note(3)]);
    expect(book.notes.map((kept) => [kept.id, kept.at])).toEqual([[id(1), 1000], [id(2), 1001], [id(3), 1002]]);

    const changed = applyBookMessage(book, note(2, 'Rewritten'), 5000, new Set());
    expect(changed?.notes.map((kept) => [kept.id, kept.body, kept.at])).toEqual([[id(1), 'Body', 1000], [id(2), 'Rewritten', 5000], [id(3), 'Body', 1002]]);

    const deleted = written([{ t: 'book-note-delete', id: id(1) }, { t: 'book-note-delete', id: id(9) }], changed ?? book);
    expect(deleted.notes.map((kept) => kept.id)).toEqual([id(2), id(3)]);
    // The book it was made from is untouched.
    expect(book.notes).toHaveLength(3);
  });

  it('takes no more notes or pins than a book holds, and still takes a change of one it has', () => {
    const full = written(Array.from({ length: MAX_BOOK_NOTES }, (_, count) => note(count)));
    expect(full.notes).toHaveLength(MAX_BOOK_NOTES);
    expect(applyBookMessage(full, note(MAX_BOOK_NOTES), 1, new Set())).toBeNull();
    expect(applyBookMessage(full, note(3, 'Changed'), 1, new Set())?.notes).toHaveLength(MAX_BOOK_NOTES);

    const pinned = written(Array.from({ length: MAX_BOOK_PINS }, (_, count): PlayerBookMessage => ({ t: 'book-pin', pin: pin(count) })));
    expect(applyBookMessage(pinned, { t: 'book-pin', pin: pin(MAX_BOOK_PINS) }, 1, new Set())).toBeNull();
    const moved = applyBookMessage(pinned, { t: 'book-pin', pin: { ...pin(7), x: 1 } }, 1, new Set());
    expect(moved?.pins[7]).toMatchObject({ id: id(7), x: 1 });
    expect(applyBookMessage(pinned, { t: 'book-pin-delete', id: id(0) }, 1, new Set())?.pins).toHaveLength(MAX_BOOK_PINS - 1);
  });

  it('refuses, and never writes, a message that belongs elsewhere or that it does not know', () => {
    const book = written([note(1)]);
    const elsewhere = [
      { t: 'book-refill', refill: 'Long rest' },
      { t: 'book-field', key: 'speed', base: '', value: '40 ft.' },
      { t: 'book-unknown' },
    ] as unknown as Parameters<typeof applyBookMessage>[1][];
    for (const message of elsewhere) expect(applyBookMessage(book, message, 1000, new Set())).toBeNull();
  });

  it('replaces the purse whole and leaves the rest alone', () => {
    const book = written([note(1), { t: 'book-purse', purse: [{ name: 'Gold', amount: 12 }] }, { t: 'book-purse', purse: [{ name: 'Silver', amount: 3 }] }]);
    expect(book.purse).toEqual([{ name: 'Silver', amount: 3 }]);
    expect(book.notes).toHaveLength(1);
  });

  it('keeps the newest items and drops the oldest beyond what a book holds', () => {
    let book = EMPTY_BOOK;
    for (let count = 0; count < MAX_BOOK_ITEMS + 5; count += 1) book = withItem(book, item(count));
    expect(book.items).toHaveLength(MAX_BOOK_ITEMS);
    expect(book.items[0]?.id).toBe(id(5));
    expect(book.items.at(-1)?.id).toBe(id(MAX_BOOK_ITEMS + 4));
  });

  it('is read back through the protocol\'s parsers: what is malformed is dropped, the rest kept', () => {
    const stored = { Cairn: { 'art/brannoch.png': withItem(written([note(1), { t: 'book-pin', pin: pin(2) }, { t: 'book-purse', purse: [{ name: 'Gold', amount: 4 }] }]), item(3)) } };
    const saved = JSON.parse(JSON.stringify(stored)) as Record<string, Record<string, Record<string, unknown[]>>>;
    expect(readBooks(saved)).toEqual(stored);

    const book = saved.Cairn?.['art/brannoch.png'];
    if (book === undefined) throw new Error('no book saved');
    book.notes = [...(book.notes ?? []), { id: 'not-an-id', title: 'x', body: 'y', at: 1 }, { id: id(8), title: 'No time', body: '' }, { ...(book.notes?.[0] as object) }];
    book.pins = [{ ...pin(4), x: 7 }, ...(book.pins ?? [])];
    book.items = [{ ...item(5), name: '' }, ...(book.items ?? []), 'junk'];
    book.purse = [{ name: 'Gold', amount: -1 }];
    const read = readBooks({ ...saved, Other: 'junk', Empty: { 'art/x.png': { items: [], notes: [], pins: [], purse: [] } }, Cairn: { ...saved.Cairn, 'art/bad.png': 7, '': book } });
    expect(Object.keys(read)).toEqual(['Cairn']);
    expect(Object.keys(read.Cairn ?? {})).toEqual(['art/brannoch.png']);
    const kept = read.Cairn?.['art/brannoch.png'];
    expect(kept?.notes.map((entry) => entry.id)).toEqual([id(1)]);
    expect(kept?.pins.map((entry) => entry.id)).toEqual([id(2)]);
    expect(kept?.items.map((entry) => entry.id)).toEqual([id(3)]);
    expect(kept?.purse).toEqual([]);
    // What is read is a book the page takes.
    expect(parsePlayerBook({ character: null, worldMap: null, ...kept })).not.toBeNull();
    expect(readBooks(null)).toEqual({});
    expect(readBooks([1, 2])).toEqual({});
  });

  it('keeps a character named like a property of every object apart from it', () => {
    const source = fakeSource();
    const shelf = new BookShelf(source);
    shelf.keep('__proto__', written([note(1)]));
    expect(shelf.of('__proto__').notes).toHaveLength(1);
    expect(shelf.of('constructor')).toBe(EMPTY_BOOK);
    expect(({} as Record<string, unknown>).constructor).toBe(Object);
  });

  it('keeps a book in its source and reads it back, and takes a book that is empty again away', () => {
    const source = fakeSource();
    const shelf = new BookShelf(source);
    const book = written([note(1)]);
    shelf.keep('lib-a', book);
    expect(source.written).toEqual([['lib-a', book]]);
    expect(shelf.of('lib-a')).toBe(book);
    shelf.keep('lib-a', written([note(1), { t: 'book-note-delete', id: id(1) }]));
    expect(source.written.at(-1)?.[1]).toMatchObject({ notes: [] });
    expect(shelf.of('lib-a')).toBe(EMPTY_BOOK);
  });

  it('never hands a book of a token placed from no library token to its source', () => {
    const source = fakeSource();
    const shelf = new BookShelf(source);
    const book = written([note(1)]);
    shelf.keep('token:tok-1', book);
    expect(source.written).toEqual([]);
    expect(shelf.of('token:tok-1')).toBe(book);
  });

  it('keeps a book in memory while its source cannot keep it, and with no source at all', () => {
    const source = fakeSource(false);
    const book = written([note(1)]);
    const shelf = new BookShelf(source);
    shelf.keep('lib-a', book);
    expect(shelf.of('lib-a')).toBe(book);
    const alone = new BookShelf();
    alone.keep('lib-a', book);
    expect(alone.of('lib-a')).toBe(book);
    expect(alone.of('lib-b')).toBe(EMPTY_BOOK);
  });

  it('forgets what it held in memory of library tokens once a campaign\'s file keeps their books, and keeps the rest', () => {
    const book = written([note(1)]);
    const shelf = new BookShelf();
    shelf.keep('lib-a', book);
    shelf.keep('token:tok-1', book);
    shelf.forgetKept();
    expect(shelf.of('lib-a')).toBe(EMPTY_BOOK);
    expect(shelf.of('token:tok-1')).toBe(book);
  });
});

describe('a rolled item as a book holds it', () => {
  const draw: LootDraw = {
    id: 'draw-1', notePath: 'Items/Secret Vault/Moon Blade.md', name: '  Moon\u200b Blade\n', source: ['Hidden Base', 'Weapons'], rarity: '**Rare**', type: 'Weapon', price: '500 thorns',
    description: `First line  \n\n\n\n${'long '.repeat(2000)}`,
    properties: [{ label: 'Damage', value: '1d8' }, { label: '\u200b', value: 'no label' }, ...Array.from({ length: 30 }, (_, count) => ({ label: `Trait ${count}`, value: 'v'.repeat(900) }))],
  };

  it('holds its texts only, cut to what a book takes, and never the note or the base it came from', () => {
    const made = bookItemOf(draw, id(1), 1234);
    expect(made).not.toBeNull();
    expect(parseBookItem(JSON.parse(JSON.stringify(made)))).toEqual(made);
    expect(made).toMatchObject({ id: id(1), at: 1234, name: 'Moon Blade', rarity: '**Rare**', tone: 'rare', type: 'Weapon', price: '500 thorns' });
    expect([...(made?.description ?? '')]).toHaveLength(MAX_ITEM_TEXT);
    expect(made?.description?.startsWith('First line\n\nlong long')).toBe(true);
    expect(made?.properties).toHaveLength(MAX_ITEM_PROPERTIES);
    expect(made?.properties[0]).toEqual({ label: 'Damage', value: '1d8' });
    expect(made?.properties[1]?.label).toBe('Trait 0');
    const text = JSON.stringify(made);
    for (const secret of ['Items/', 'Secret Vault', 'Hidden Base', 'draw-1']) expect(text).not.toContain(secret);
  });

  it('is told of an item without the optional parts, and named when its name shows nothing', () => {
    expect(bookItemOf({ id: 'd', notePath: 'n.md', name: '\u200b', source: [], properties: [] }, id(2), 5)).toEqual({ id: id(2), at: 5, name: 'Unnamed item', type: null, rarity: null, tone: null, price: null, description: null, properties: [] });
    expect(bookItemOf({ id: 'd', notePath: 'n.md', name: 'Rope', source: [], properties: [] }, 'no id', 5)).toBeNull();
  });

  it('cuts a line or a text to its length in characters, never inside one', () => {
    expect(clippedLine('🗡️'.repeat(200), MAX_BOOK_TITLE)?.length).toBeLessThanOrEqual(MAX_BOOK_TITLE * 2);
    expect([...(clippedLine('𝔄'.repeat(500), 10) ?? '')]).toEqual(Array.from({ length: 10 }, () => '𝔄'));
    expect(clippedLine('   ', 10)).toBeNull();
    expect(clippedLine(undefined, 10)).toBeNull();
    // Cut after the second line break, which a text does not end with.
    expect(clippedText('a\r\nb\u2028c   ', 4)).toBe('a\nb');
    expect(clippedText('\n\n', 10)).toBeNull();
  });

  it('cuts the opening of a text at its last line break, else its last space, in the second half; a text without either where the limit is', () => {
    expect(openingOf('Short.', 20)).toBe('Short.');
    expect(openingOf('First line here.\nSecond line goes on.', 30)).toBe('First line here.');
    expect(openingOf('One two three four five six', 15)).toBe('One two three');
    expect(openingOf('Tiny\nsupercalifragilistic', 15)).toBe('Tiny\nsupercalif');
    expect([...openingOf(`${'🐸'.repeat(30)} ${'𝔄'.repeat(30)}`, 40)]).toHaveLength(30);
  });
});
