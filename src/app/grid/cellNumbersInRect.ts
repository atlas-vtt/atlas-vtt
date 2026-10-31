import { columnRowDigits, columnRowLabel, letterNumberLabel } from './cellNumbering';
import type { CellLattice, CellLines, CellNumberFormat, MapRect, NumberedCell, PlacedCell } from './cellNumbering';

/** Numbers the cells of the map whose centres lie in a rect, as `numberCells` numbers them on the whole map. */
export type CellNumberer = (rect: MapRect) => NumberedCell[];

/**
 * Numbers parts of a map without placing its other cells: what a number depends on beyond its own
 * cell (the widest column and row for `column-row`, the cells before it in reading order for
 * `sequential`) is read from the map's lines once, so each part costs only its own cells.
 */
export function cellNumberer(lattice: CellLattice, map: MapRect, format: CellNumberFormat): CellNumberer {
  if (!(lattice.size > 0) || !(map.width > 0) || !(map.height > 0)) return () => [];
  const label = labelOf(lattice.linesOnMap(map), format);
  return (rect) => lattice.cellsInRect(map, rect).map((cell) => ({ key: cell.key, center: cell.center, label: label(cell) }));
}

/** The labels `numberCells` gives the cells of the map whose centres lie in `rect`, without numbering the rest. */
export function numberCellsInRect(lattice: CellLattice, map: MapRect, rect: MapRect, format: CellNumberFormat): NumberedCell[] {
  return cellNumberer(lattice, map, format)(rect);
}

function labelOf(lines: CellLines, format: CellNumberFormat): (cell: PlacedCell) => string {
  if (format === 'letter-number') return letterNumberLabel;
  if (format === 'sequential') {
    const before = cellsBefore(lines);
    return (cell) => String(before(cell) + 1);
  }
  const longest = lines.counts.reduce((most, count) => Math.max(most, count), 0);
  const lineCount = lastFilledLine(lines.counts) + 1;
  const digits = lines.lineIsRow ? columnRowDigits(longest, lineCount) : columnRowDigits(lineCount, longest);
  return (cell) => columnRowLabel(cell, digits);
}

function lastFilledLine(counts: readonly number[]): number {
  for (let line = counts.length - 1; line >= 0; line--) if (counts[line]! > 0) return line;
  return -1;
}

/** How many cells of the map come before a cell in reading order (by row, then column). */
function cellsBefore(lines: CellLines): (cell: PlacedCell) => number {
  if (lines.lineIsRow) {
    const rowsAbove = new Float64Array(lines.counts.length + 1);
    lines.counts.forEach((count, row) => { rowsAbove[row + 1] = rowsAbove[row]! + count; });
    return (cell) => rowsAbove[cell.row]! + cell.column;
  }
  // Lines are columns. Before cell (column c, row r) come, from every column, its cells above row r,
  // and the cells of row r in the columns left of c that reach that row. Columns take one of a few
  // lengths (two on a hex grid, one per stagger), so they are counted by length.
  const columnsByLength = new Map<number, number[]>();
  lines.counts.forEach((count, column) => {
    if (count === 0) return;
    const columns = columnsByLength.get(count);
    if (columns) columns.push(column);
    else columnsByLength.set(count, [column]);
  });
  const lengths = [...columnsByLength.entries()].map(([length, columns]) => ({ length, columns }));
  return (cell) => {
    let before = 0;
    for (const { length, columns } of lengths) {
      before += columns.length * Math.min(length, cell.row);
      if (length > cell.row) before += countBelow(columns, cell.column);
    }
    return before;
  };
}

/** How many of the ascending `values` are below `limit`. */
function countBelow(values: readonly number[], limit: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle]! < limit) low = middle + 1;
    else high = middle;
  }
  return low;
}
