import type React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bandColumns, fittingBands, type ColumnWidths } from './tableBands';
import { TABLE_COL_ATTRIBUTE } from './tableAttributes';

export interface TableBands {
  /** The columns of each band, in order. */
  bands: number[][];
  /** Every band holds one column and the table is still too wide: its cells may break inside words. */
  squeezed: boolean;
  /** The element whose width the bands share; their tables are found inside it. */
  roomRef: React.RefObject<HTMLDivElement | null>;
}

/** Set on the room while its tables are laid out at their least width to be measured (`_sheet-table.scss`). */
const MEASURING = 'data-measuring';

/**
 * Each column's least width, read from the bands as they stand: every table
 * is laid out at its min-content width for the moment of the reading, where
 * each column takes its least width, and what is left of the table's width
 * beside its columns is what every band adds.
 */
function measureColumns(room: HTMLElement, count: number): ColumnWidths | null {
  const tables = [...room.querySelectorAll('table')];
  if (tables.length === 0) return null;
  const columns = new Array<number>(count).fill(0);
  let extra = 0;
  room.setAttribute(MEASURING, '');
  try {
    for (const table of tables) {
      let sum = 0;
      for (const cell of table.querySelector('tr')?.children ?? []) {
        const col = Number(cell.getAttribute(TABLE_COL_ATTRIBUTE));
        if (!cell.hasAttribute(TABLE_COL_ATTRIBUTE) || !Number.isInteger(col) || col >= count) continue;
        const width = cell.getBoundingClientRect().width;
        columns[col] = width;
        sum += width;
      }
      extra = Math.max(extra, table.getBoundingClientRect().width - sum);
    }
  } finally {
    room.removeAttribute(MEASURING);
  }
  return { columns, extra };
}

/**
 * How many bands a Table of `columns` columns takes in the width it is given:
 * the fewest in which every band fits, worked out from each column's least
 * width again whenever the table is drawn or its room or a band changes size
 * (a cell's text drawn late). While `hold` is set (a cell is typed) the bands
 * stay as they are, so the typed cell keeps its place; the table may stand
 * wider than its room until then.
 */
export function useTableBands(columns: number, hold: boolean): TableBands {
  const roomRef = useRef<HTMLDivElement | null>(null);
  const [count, setCount] = useState(1);
  const holdRef = useRef(hold);
  holdRef.current = hold;

  const fit = (): void => {
    const room = roomRef.current;
    if (!room || holdRef.current || room.clientWidth <= 0) return;
    const widths = measureColumns(room, columns);
    if (widths) setCount(fittingBands(widths, room.clientWidth));
  };

  const fitRef = useRef(fit);
  fitRef.current = fit;

  // Before the bands are painted.
  useLayoutEffect(fit);

  // A new count draws new tables to observe.
  useEffect(() => {
    const room = roomRef.current;
    if (!room) return undefined;
    const observer = new ResizeObserver(() => fitRef.current());
    observer.observe(room);
    for (const table of room.querySelectorAll('table')) observer.observe(table);
    return (): void => observer.disconnect();
  }, [count, columns]);

  const bands = bandColumns(columns, count);
  return { bands, squeezed: columns > 1 && bands.length >= columns, roomRef };
}
