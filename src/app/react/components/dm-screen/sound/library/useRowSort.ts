import { useEffect, useMemo, useRef, useState } from 'react';
import type { RowSort } from '../../../../../soundLibrary/libraryPlace';
import type { SoundLibrary } from '../../../../../soundLibrary/SoundLibrary';
import { useStoreValue } from '../useSound';
import { filesOfRows, type LibraryRow } from './rowModel';
import { keptOrder, sortedRows } from './rowSort';

/** How long answers gather before the count of lengths still to come is taken again: eight reads at once answer many times a frame. */
const LENGTHS_GATHER_MS = 100;

export interface RowOrder {
  /** The rows as they are shown: what Play, a Shift range and the keys go by. */
  rows: readonly LibraryRow[];
  sort: RowSort;
  /** While a sort by length waits for the lengths of the rows listed, the share of them read so far; null otherwise. */
  reading: number | null;
}

/** The lengths of these rows, asked for all at once: the share of them known, and whether that is all of them. */
function useListLengths(library: SoundLibrary, rows: readonly LibraryRow[], asked: boolean): { known: number; ready: readonly LibraryRow[] | null } {
  const [state, setState] = useState<{ rows: readonly LibraryRow[] | null; known: number }>({ rows: null, known: 0 });
  useEffect(() => {
    if (!asked) return undefined;
    const files = filesOfRows(rows);
    // One question each, in the order shown: the ones in view are read first anyway.
    let left = files.filter((file) => library.secondsOf(file, true) === undefined);
    const take = (): void => {
      left = left.filter((file) => !library.knowsSeconds(file));
      setState({ rows: left.length === 0 ? rows : null, known: files.length === 0 ? 1 : 1 - left.length / files.length });
    };
    take();
    if (left.length === 0) return undefined;
    let timer = 0;
    const stop = library.onLengths(() => {
      if (timer === 0) timer = window.setTimeout(() => {
        timer = 0;
        take();
        if (left.length === 0) stop();
      }, LENGTHS_GATHER_MS);
    });
    return () => {
      window.clearTimeout(timer);
      stop();
    };
  }, [library, rows, asked]);
  return { known: state.known, ready: state.rows };
}

/**
 * The rows in the order the viewer chose. By length the rows keep the order they were shown in until the length of
 * every row listed is known, and then are sorted once: rows never jump about while the lengths come in.
 */
export function useRowSort(library: SoundLibrary, rows: readonly LibraryRow[]): RowOrder {
  const sort = useStoreValue(library.sort, () => library.sort.current);
  const byLength = sort.by === 'length';
  const lengths = useListLengths(library, rows, byLength);
  const shown = useRef(rows);
  // Every length may already be known (asked before, or copies that said theirs): then there is nothing to wait for.
  const ready = !byLength || lengths.ready === rows || filesOfRows(rows).every((file) => library.knowsSeconds(file));
  const order = useMemo(
    () => (ready ? sortedRows(rows, sort, (file) => library.secondsOf(file), shown.current) : keptOrder(shown.current, rows)),
    [library, ready, rows, sort],
  );
  shown.current = order;
  return { rows: order, sort, reading: ready ? null : lengths.known };
}
