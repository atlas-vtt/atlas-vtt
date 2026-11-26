import type { RowSort } from '../../../../../soundLibrary/libraryPlace';
import type { LibraryFile } from '../../../../../soundLibrary/SoundLibrary';
import type { LibraryRow } from './rowModel';

/** A file's length in seconds; null where it cannot be told, undefined while it is not known yet. */
export type SecondsOf = (file: LibraryFile) => number | null | undefined;

/** Files that can be ordered by the sort, then files whose length cannot be told, then records whose file is missing. */
const SORTED = 0;
const UNTOLD = 1;
const WAITING = 2;

interface Keyed {
  row: LibraryRow;
  group: number;
  seconds: number;
}

const byOrder = (a: LibraryRow, b: LibraryRow): number => (a.order < b.order ? -1 : a.order > b.order ? 1 : 0);

/** Whether two lists hold the same rows in the same order. */
export const sameRows = (a: readonly LibraryRow[], b: readonly LibraryRow[]): boolean =>
  a === b || (a.length === b.length && a.every((row, index) => row === b[index]));

/** The list it equals among those given, so whatever is memoised on it stays put; else `order` itself. */
const kept = (order: readonly LibraryRow[], ...candidates: readonly (readonly LibraryRow[])[]): readonly LibraryRow[] =>
  candidates.find((candidate) => sameRows(order, candidate)) ?? order;

type Compare = (a: LibraryRow, b: LibraryRow) => number;

/** By name: files, then records whose file is missing, each group turned round with the sort. */
const nameOrder = (sign: number): Compare => (a, b) =>
  Number(a.type === 'waiting') - Number(b.type === 'waiting') || byOrder(a, b) * sign;

function inOrder(rows: readonly LibraryRow[], compare: Compare): boolean {
  for (let index = 1; index < rows.length; index++) {
    const before = rows[index - 1];
    const row = rows[index];
    if (before && row && compare(before, row) > 0) return false;
  }
  return true;
}

/**
 * The rows in the order chosen, by keys worked out once per row: a name's `order`, a length's seconds. Records whose
 * file is missing stay last, and so, by length, do files whose length cannot be told (by name, A to Z). By length,
 * ties go by name, A to Z. The same array where the order does not change it, or where it equals `shown`: a list
 * already in its order (the shelf by name, as `shelfOf` lists it) costs one pass and no sort.
 */
export function sortedRows(rows: readonly LibraryRow[], sort: RowSort, secondsOf: SecondsOf, shown: readonly LibraryRow[] = rows): readonly LibraryRow[] {
  const sign = sort.descending ? -1 : 1;
  if (sort.by === 'name') {
    const compare = nameOrder(sign);
    return kept(inOrder(rows, compare) ? rows : [...rows].sort(compare), shown, rows);
  }
  const keyed = rows.map((row): Keyed => {
    if (row.type === 'waiting') return { row, group: WAITING, seconds: 0 };
    const seconds = secondsOf(row.file);
    return typeof seconds === 'number' ? { row, group: SORTED, seconds } : { row, group: UNTOLD, seconds: 0 };
  });
  keyed.sort((a, b) => a.group - b.group || (a.group === SORTED ? (a.seconds - b.seconds) * sign : 0) || byOrder(a.row, b.row));
  return kept(keyed.map(({ row }) => row), shown, rows);
}

/**
 * The rows in the order they were shown in, while a sort waits for what it sorts by: rows that were shown keep their
 * places, rows that were not follow them in the order given. Nothing moves until the sort has all it needs.
 */
export function keptOrder(shown: readonly LibraryRow[], rows: readonly LibraryRow[]): readonly LibraryRow[] {
  const placeOf = new Map(shown.map((row, index) => [row.id, index]));
  const placed = rows.map((row, index) => ({ row, place: placeOf.get(row.id) ?? shown.length + index }));
  placed.sort((a, b) => a.place - b.place);
  return kept(placed.map(({ row }) => row), shown, rows);
}
