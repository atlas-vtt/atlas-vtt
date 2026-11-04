/**
 * The random tables of a note: its Markdown tables (`markdownTables.ts`) read
 * as roll column, die, weights and result columns, with their problems. Pure.
 */

import {
  dieInText, dieOfHeader, dieOfNumbers, isWeightHeader, looksLikeRoll, readRollCell, readWeight,
} from './dieRanges';
import { readMarkdownTables, type MarkdownTable } from './markdownTables';
import type { NoteTables, RandomTable, TableDie, TableProblem, TableRow } from './tableModel';
import { tableProblems } from './tableProblems';

/** Whether the first column holds the rolls: its header is a die, or every body cell starts like a number. */
function hasRollColumn(table: MarkdownTable): boolean {
  if (table.headers.length < 2 || table.rows.length === 0) return false;
  if (isWeightHeader(table.headers[0]!)) return false;
  return dieOfHeader(table.headers[0]!) !== null || table.rows.every((row) => looksLikeRoll(row[0] ?? ''));
}

/** The die: the roll column's header, else a "Roll 1d6" in the heading or the line above, else the highest number. */
function dieOfTable(table: MarkdownTable, rows: readonly TableRow[]): TableDie | null {
  return dieOfHeader(table.headers[0]!)
    ?? table.context.map(dieInText).find((die) => die !== null)
    ?? dieOfNumbers(rows.flatMap((row) => row.ranges));
}

/** A table of the note as Atlas rolls it. */
export function toRandomTable(table: MarkdownTable): RandomTable {
  const rolls = hasRollColumn(table);
  const weightColumn = table.headers.findIndex((header, column) => (column > 0 || !rolls) && isWeightHeader(header));
  const resultColumns = table.headers.map((_, column) => column).filter((column) => !(rolls && column === 0) && column !== weightColumn);
  const readWeights = weightColumn >= 0;
  const weightProblems: TableProblem[] = [];

  let rows: TableRow[] = table.rows.map((cells, index) => {
    const weight = readWeights ? readWeight(cells[weightColumn] ?? '') : 1;
    if (weight === null) weightProblems.push({ kind: 'unreadable', row: index, column: 'weight', text: cells[weightColumn] ?? '' });
    return {
      index,
      ...(rolls && { roll: cells[0] ?? '' }),
      ranges: rolls ? readRollCell(cells[0] ?? '') ?? [] : [],
      weight: weight ?? 0,
      cells: resultColumns.map((column) => cells[column] ?? ''),
    };
  });
  const die = rolls ? dieOfTable(table, rows) : null;
  // A die decides alone: weights only weigh a table without one.
  const weighted = readWeights && die === null;
  if (!weighted && readWeights) rows = rows.map((row) => ({ ...row, weight: 1 }));

  return {
    name: table.name,
    ...(table.heading !== undefined && { heading: table.heading }),
    index: table.index,
    line: table.line,
    columns: resultColumns.map((column) => table.headers[column] ?? ''),
    rows,
    die,
    hasRollColumn: rolls,
    weighted,
    problems: [
      ...tableProblems(rows, die, rolls),
      ...(weighted ? weightProblems : []),
      ...table.limits.map((limit) => ({ kind: 'limit', limit }) as const),
    ],
  };
}

/** The random tables of a note's Markdown; `noteName` names a table without a heading. */
export function tablesOfNote(text: string, noteName: string): NoteTables {
  const { tables, tooLarge, moreTables } = readMarkdownTables(text, noteName);
  return { tables: tables.map(toRandomTable), tooLarge, moreTables };
}
