/**
 * Random tables as Atlas reads them out of a note's Markdown. A note is untrusted
 * input (it may come with a bundle), so everything read from it is bounded by
 * `TABLE_LIMITS`.
 */

export const TABLE_LIMITS = {
  /** A larger note is skipped whole. */
  noteBytes: 256 * 1024,
  tables: 64,
  rows: 1000,
  columns: 16,
  cellCharacters: 2000,
  /** Tables rolled inside a result, one in another. */
  depth: 8,
  /** Results one roll may give, nested ones included. */
  results: 50,
} as const;

/** Rolled numbers a row answers; an open end is infinite ("12+" is 12 to Infinity). */
export interface RollRange {
  readonly min: number;
  readonly max: number;
}

/** The die a table is rolled with. */
export interface TableDie {
  /** As shown: "d6", "2d6", "d66", "d100". */
  readonly label: string;
  readonly count: number;
  readonly faces: number;
  /** Two d6 read as tens and ones (11 to 66), not one die of 66 faces. */
  readonly d66: boolean;
}

export interface TableRow {
  /** Position among the table's body rows, from 0. */
  readonly index: number;
  /** The roll cell as written; absent without a roll column. */
  readonly roll?: string;
  /** The numbers the row answers; empty without a roll column or where its cell cannot be read. */
  readonly ranges: readonly RollRange[];
  /** Its chance against the other rows when the table has no die; 0 never comes up. */
  readonly weight: number;
  /** One cell per result column, as written. */
  readonly cells: readonly string[];
}

/** A limit of `TABLE_LIMITS` the table reached: the rest was left out. */
export type TableLimit = 'rows' | 'columns' | 'cell';

/** What is wrong with a table. Atlas reports it and never fixes it: the note is the table. */
export type TableProblem =
  /** No row answers these numbers. */
  | { readonly kind: 'gap'; readonly from: number; readonly to: number }
  /** More than one row answers these numbers; the first of them comes up. */
  | { readonly kind: 'overlap'; readonly from: number; readonly to: number }
  /** The row names a number its die never rolls (13 on 2d6). */
  | { readonly kind: 'unreachable'; readonly row: number; readonly value: number }
  /** A roll cell that is no number or range, or a weight that is no number above 0. */
  | { readonly kind: 'unreadable'; readonly row: number; readonly column: 'roll' | 'weight'; readonly text: string }
  | { readonly kind: 'limit'; readonly limit: TableLimit };

export interface RandomTable {
  /** Its heading without a trailing "Roll 1d6:", else the note's name; unique in its note. */
  readonly name: string;
  /** The heading above it as written, which `[[Note#Heading]]` names; absent without one. */
  readonly heading?: string;
  /** Which table of the note, from 0. */
  readonly index: number;
  /** Line of its header row in the note, from 0. */
  readonly line: number;
  /** Headers of the result columns: every column but the roll and weight columns. */
  readonly columns: readonly string[];
  readonly rows: readonly TableRow[];
  readonly die: TableDie | null;
  readonly hasRollColumn: boolean;
  /** Rows come up by their weights: a weight column and no die. */
  readonly weighted: boolean;
  readonly problems: readonly TableProblem[];
}

/** The tables of one note. */
export interface NoteTables {
  readonly tables: readonly RandomTable[];
  /** The note is larger than `TABLE_LIMITS.noteBytes`: nothing of it was read. */
  readonly tooLarge: boolean;
  /** The note holds more tables than `TABLE_LIMITS.tables`: the later ones were left out. */
  readonly moreTables: boolean;
}
