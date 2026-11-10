/**
 * A Table too wide for its card wraps as Fantasy Statblocks wraps its tables:
 * its columns go on in a band below, each band a table of its own with its
 * column names over it. Bands hold as many columns as each other (nine in two
 * bands are five and four), in their order.
 */

/** The columns of each band: `count` columns in `bands` bands of near-equal size, in order. */
export function bandColumns(count: number, bands: number): number[][] {
  const columns = Array.from({ length: Math.max(0, count) }, (_, col) => col);
  const wanted = Math.min(Math.max(1, Math.floor(bands)), Math.max(1, columns.length));
  const size = Math.ceil(columns.length / wanted);
  const result: number[][] = [];
  for (let start = 0; start < columns.length; start += size) result.push(columns.slice(start, start + size));
  return result.length > 0 ? result : [[]];
}

/** How narrow a table's columns can be: each column's least width, and what every band adds (a label column, borders). */
export interface ColumnWidths {
  columns: readonly number[];
  extra: number;
}

/**
 * The fewest bands in which every band fits `room` (a pixel's rounding
 * aside); one band per column where even that does not fit.
 */
export function fittingBands({ columns, extra }: ColumnWidths, room: number): number {
  for (let count = 1; count < columns.length; count++) {
    const fits = bandColumns(columns.length, count).every((band) => band.reduce((sum, col) => sum + (columns[col] ?? 0), extra) <= room + 0.5);
    if (fits) return count;
  }
  return Math.max(1, columns.length);
}
