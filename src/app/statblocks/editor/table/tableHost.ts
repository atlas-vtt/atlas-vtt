/**
 * What an editable Table asks of the surface it stands on (the statblock pane
 * writes the note, the template editor the template's starting table), and
 * how the keys walk its cells. The walking is pure.
 */

import { HEADER_ROW, type CellAt, type TableGrid } from '../../model/tableGrid';

/** What the surface lets the table change. Cells are always typed. */
export interface TableRoom {
  /** Add, delete, duplicate, move and sort rows. */
  rows: boolean;
  /** Add, delete, duplicate and move columns. */
  columns: boolean;
  /** Type the column names in the header row. */
  names: boolean;
  /** Align columns. */
  align: boolean;
}

export interface TableHost {
  /** What the table is called ("Weapons"): screen readers name its cells by it where it has no column names. */
  name: string;
  /** The table as it holds now, the last write included; read again for every edit. */
  grid: () => TableGrid;
  room: TableRoom;
  /** The cell being typed, if any. */
  active: CellAt | null;
  /** Starts typing a cell. */
  open: (at: CellAt) => void;
  /** Ends typing; `refocus` gives focus back to the block (Escape). */
  close: (refocus: boolean) => void;
  /** Focus left the cell `at` for somewhere outside the table: typing ends there unless another cell is typed by now. */
  leave: (at: CellAt) => void;
  /** The table holds `grid` now: one write, one undo step. `said` goes to the live region. */
  commit: (grid: TableGrid, said?: string) => void;
  /** Tab past the last cell or Shift+Tab before the first, where no row is added: on to the next value. */
  exit: (step: 1 | -1) => void;
  announce: (text: string) => void;
  /** Registers the commit of the text being typed, run when the surface closes mid-word; returns what lets it go. */
  pending?: ((commit: () => void) => () => void) | undefined;
}

/** The size of the table the keys walk, and whether its header row is typed. */
export interface TableWalk {
  rows: number;
  cols: number;
  /** The header row is drawn and its names typed. */
  names: boolean;
}

export function sameCell(a: CellAt | null | undefined, b: CellAt | null | undefined): boolean {
  return a !== null && a !== undefined && b !== null && b !== undefined && a.row === b.row && a.col === b.col;
}

/** The first row the keys reach: the header where its names are typed. */
function topRow(walk: TableWalk): number {
  return walk.names ? HEADER_ROW : 0;
}

export function firstCell(walk: TableWalk): CellAt {
  return { row: topRow(walk), col: 0 };
}

export function lastCell(walk: TableWalk): CellAt {
  return { row: walk.rows - 1, col: Math.max(walk.cols - 1, 0) };
}

/** The cell `step` places after (1) or before (-1) `at` in reading order; null past either end. */
export function stepCell(walk: TableWalk, at: CellAt, step: 1 | -1): CellAt | null {
  const col = at.col + step;
  if (col >= 0 && col < walk.cols) return { row: at.row, col };
  const row = at.row + step;
  if (row < topRow(walk) || row >= walk.rows) return null;
  return { row, col: step > 0 ? 0 : walk.cols - 1 };
}

/** The cell in the row above (-1) or below (1) `at`, in its column; null past the table's edge. */
export function cellOver(walk: TableWalk, at: CellAt, step: 1 | -1): CellAt | null {
  const row = at.row + step;
  return row < topRow(walk) || row >= walk.rows ? null : { row, col: at.col };
}

/** The cell left (-1) or right (1) of `at`, in its row; null past the table's edge. */
export function cellBeside(walk: TableWalk, at: CellAt, step: 1 | -1): CellAt | null {
  const col = at.col + step;
  return col < 0 || col >= walk.cols ? null : { row: at.row, col };
}

/** `at` where it is still a cell of the table, else the nearest one (a row or column went). */
export function clampCell(walk: TableWalk, at: CellAt): CellAt {
  return {
    row: Math.min(Math.max(at.row, topRow(walk)), walk.rows - 1),
    col: Math.min(Math.max(at.col, 0), Math.max(walk.cols - 1, 0)),
  };
}

export function walkOf(grid: TableGrid, header: boolean, room: TableRoom): TableWalk {
  return { rows: grid.rows.length, cols: grid.columns.length, names: header && room.names };
}
