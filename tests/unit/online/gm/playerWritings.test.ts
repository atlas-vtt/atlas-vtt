import { describe, expect, it } from 'vitest';
import { EMPTY_BOOK, type StoredBook } from '../../../../src/app/online/gm/book/bookStore.ts';
import { writingsIn } from '../../../../src/app/online/gm/book/playerWritings.ts';
import { MAX_BOOK_NOTES, MAX_BOOK_PINS, type BookNote, type BookPin } from '../../../../src/app/online/protocol/index.ts';

const id = (count: number): string => count.toString(16).padStart(24, '0');
const note = (count: number, title = `Note ${count}`): BookNote => ({ id: id(count), title, body: '', at: count });
const pin = (count: number): BookPin => ({ id: id(count), x: 0, y: 0, kind: 'note', title: '', body: '' });
const notes = (from: number, length: number): StoredBook => ({ ...EMPTY_BOOK, notes: Array.from({ length }, (_, at) => note(from + at)) });
const pins = (from: number, length: number): StoredBook => ({ ...EMPTY_BOOK, pins: Array.from({ length }, (_, at) => pin(from + at)) });

describe('a player\'s notes and pins out of their books', () => {
  it('reads every entry while all of them fit, the player\'s own last, as a new one stands', () => {
    expect(writingsIn([notes(100, 1), notes(1, 2)]).notes.map((entry) => entry.id)).toEqual([id(1), id(2), id(100)]);
  });

  it('takes the player\'s own copy of an id, once', () => {
    const own = { ...EMPTY_BOOK, notes: [note(1, 'Mine')] };
    const character = { ...EMPTY_BOOK, notes: [note(1, 'Older')] };
    expect(writingsIn([own, character]).notes).toEqual([note(1, 'Mine')]);
  });

  it('never cuts the player\'s own book, and cuts the oldest of the others first', () => {
    const ids = writingsIn([notes(1000, 35), notes(1, 35)]).notes.map((entry) => entry.id);
    expect(ids).toHaveLength(MAX_BOOK_NOTES - 1);
    expect(ids).toContain(id(1034));
    expect(ids).toContain(id(35));
    expect(ids).not.toContain(id(1));
  });

  it('stays under the maximum where the own book has room, so the page can write', () => {
    expect(writingsIn([notes(1, 30), notes(100, 30)]).notes).toHaveLength(MAX_BOOK_NOTES - 1);
    expect(writingsIn([pins(1, 60), pins(1000, 60)]).pins).toHaveLength(MAX_BOOK_PINS - 1);
    expect(writingsIn([notes(1, 30), notes(100, 29)]).notes).toHaveLength(MAX_BOOK_NOTES - 1);
  });

  it('reads the own book alone once it is full: the page then says so, truly', () => {
    const ids = writingsIn([notes(1, MAX_BOOK_NOTES), notes(1000, 5)]).notes.map((entry) => entry.id);
    expect(ids).toHaveLength(MAX_BOOK_NOTES);
    expect(ids).not.toContain(id(1000));
  });
});
