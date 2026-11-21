import { describe, expect, it, vi } from 'vitest';
import { keptOrder, sortedRows, type SecondsOf } from '../../../src/app/react/components/dm-screen/sound/library/rowSort';
import type { LibraryRow } from '../../../src/app/react/components/dm-screen/sound/library/rowModel';
import { sortKey } from '../../../src/app/soundLibrary/FolderTree';
import { NAME_ORDER, SortChoice, type RowSort } from '../../../src/app/soundLibrary/libraryPlace';
import { SoundLengths } from '../../../src/app/soundLibrary/soundLengths';
import type { StoredSound } from '../../../src/app/soundLibrary/soundRecords';

const file = (name: string): LibraryRow => ({
  type: 'file', id: `music:${name}`, name, where: '', tagKeys: [], order: `${sortKey(name)}\0${name}`,
  file: { kind: 'music', name, path: name, size: 1, mtime: 1 },
});
const waiting = (name: string): LibraryRow => ({ type: 'waiting', id: `sound-${name}`, name, where: '', tagKeys: [], order: sortKey(name), sound: { id: name } as StoredSound });
const names = (rows: readonly LibraryRow[]): string[] => rows.map((row) => row.name);
const lengths = (of: Record<string, number | null | undefined>): SecondsOf => (one) => of[one.name];

const BY_LENGTH: RowSort = { by: 'length', descending: false };

describe('the rows by name', () => {
  // Already in their order, as `shelfOf` lists them: a missing file after the files.
  const rows = [file('Track 2'), file('track 10'), file('Émile'), waiting('Lost'), waiting('Gone')];

  it('reads numbers as numbers and letters without their accents, and keeps the very same list where it is in order', () => {
    const shelf = [file('Track 2'), file('track 10'), file('Émile')].sort((a, b) => (a.order < b.order ? -1 : 1));
    expect(names(shelf)).toEqual(['Émile', 'Track 2', 'track 10']);
    expect(sortedRows(shelf, NAME_ORDER, lengths({}))).toBe(shelf);
  });

  it('turns round with a second press, and a missing file stays last either way', () => {
    expect(names(sortedRows(rows, NAME_ORDER, lengths({})))).toEqual(['Émile', 'Track 2', 'track 10', 'Gone', 'Lost']);
    expect(names(sortedRows(rows, { by: 'name', descending: true }, lengths({})))).toEqual(['track 10', 'Track 2', 'Émile', 'Lost', 'Gone']);
  });
});

describe('the rows by length', () => {
  const rows = [file('a'), file('b'), file('c'), file('d'), waiting('w'), file('e')];
  const seconds = lengths({ a: 30, b: 10, c: null, d: 30, e: 200 });

  it('go shortest first, ties by name, and what cannot be told goes last, before a missing file', () => {
    expect(names(sortedRows(rows, BY_LENGTH, seconds))).toEqual(['b', 'a', 'd', 'e', 'c', 'w']);
  });

  it('turned round go longest first, and still keep the untold and the missing last', () => {
    expect(names(sortedRows(rows, { by: 'length', descending: true }, seconds))).toEqual(['e', 'a', 'd', 'b', 'c', 'w']);
  });

  it('give back the list shown where they are in its order, so nothing memoised on it renders again', () => {
    const shown = sortedRows(rows, BY_LENGTH, seconds);
    expect(sortedRows([...rows], BY_LENGTH, seconds, shown)).toBe(shown);
  });
});

describe('the order kept while a sort waits', () => {
  it('keeps every row that was shown in its place and puts the new ones after, in their own order', () => {
    const [a, b, c] = [file('a'), file('b'), file('c')];
    const shown = [c, a, b];
    const fresh = file('aa');
    expect(names(keptOrder(shown, [a, fresh, b, c]))).toEqual(['c', 'a', 'b', 'aa']);
    expect(keptOrder(shown, [a, b, c])).toBe(shown);
  });
});

describe('the choice of order', () => {
  it('starts by name, turns round on its own column, starts again on another, and is kept', () => {
    const write = vi.fn();
    const choice = new SortChoice({ read: () => undefined, write });
    expect(choice.current).toEqual(NAME_ORDER);
    choice.press('name');
    expect(choice.current).toEqual({ by: 'name', descending: true });
    choice.press('length');
    expect(choice.current).toEqual({ by: 'length', descending: false });
    expect(write).toHaveBeenLastCalledWith({ by: 'length', descending: false });
    expect(new SortChoice({ read: () => ({ by: 'length', descending: true }), write }).current).toEqual({ by: 'length', descending: true });
  });

  it('reads what it cannot use as the order by name, and lasts the session where storage throws', () => {
    expect(new SortChoice({ read: () => ({ by: 'size', descending: 1 }), write: () => undefined }).current).toEqual(NAME_ORDER);
    const broken = new SortChoice({ read: () => { throw new Error('denied'); }, write: () => { throw new Error('denied'); } });
    broken.press('length');
    expect(broken.current).toEqual(BY_LENGTH);
  });
});

describe('the lengths of a whole list', () => {
  it('are read behind the rows in view, more at a time, in the order asked', async () => {
    const waiting: { url: string; done: (seconds: number) => void }[] = [];
    const lengthsOf = new SoundLengths((url) => new Promise((done) => waiting.push({ url, done })));
    for (const name of ['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8', 'l9']) lengthsOf.secondsOf(name, name, true);
    expect(waiting.map(({ url }) => url)).toEqual(['l1', 'l2', 'l3', 'l4', 'l5', 'l6', 'l7', 'l8']);
    lengthsOf.secondsOf('view', 'view');
    waiting.shift()?.done(1);
    await vi.waitFor(() => expect(waiting.at(-1)?.url).toBe('view'));
    expect(lengthsOf.knows('l1')).toBe(true);
    expect(lengthsOf.secondsOf('l1', 'l1')).toBe(1);
  });
});
