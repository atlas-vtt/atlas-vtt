import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bandColumns } from './tableBands';
import { requestBandFit, watchBandFit, type BandFit } from './tableBandFits';

export interface TableBands {
  /** The columns of each band, in order. */
  bands: number[][];
  /** Every band holds one column and the table is still too wide: its cells may break inside words. */
  squeezed: boolean;
  /** The element whose width the bands share; their tables are found inside it. */
  roomRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * How many bands a Table of `columns` columns takes in the width it is given:
 * the fewest in which every band fits, worked out from each column's least
 * width again whenever the table is drawn or its room or a band changes size
 * (a cell's text drawn late), together with every other table of the
 * document (`tableBandFits`). While `hold` is set (a cell is typed) the bands
 * stay as they are, so the typed cell keeps its place; the table may stand
 * wider than its room until then.
 */
export function useTableBands(columns: number, hold: boolean): TableBands {
  const roomRef = useRef<HTMLDivElement | null>(null);
  const [count, setCount] = useState(1);
  const columnsRef = useRef(columns);
  columnsRef.current = columns;
  const holdRef = useRef(hold);
  holdRef.current = hold;

  const [fit] = useState<BandFit>(() => ({
    room: () => roomRef.current,
    columns: () => columnsRef.current,
    held: () => holdRef.current,
    apply: setCount,
  }));

  // Before the bands are painted.
  useLayoutEffect(() => requestBandFit(fit));

  // A new count draws new tables to observe.
  useEffect(() => {
    const room = roomRef.current;
    return room ? watchBandFit(fit, [room, ...room.querySelectorAll('table')]) : undefined;
  }, [fit, count, columns]);

  const bands = bandColumns(columns, count);
  return { bands, squeezed: columns > 1 && bands.length >= columns, roomRef };
}
