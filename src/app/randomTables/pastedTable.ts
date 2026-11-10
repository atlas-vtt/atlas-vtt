/**
 * Pasted text read as a table, for a note Atlas writes: a Markdown table,
 * tab-separated rows (a spreadsheet or a web page) or the lines of a PDF, one
 * result per line with its numbers in front. Pure, and bounded by
 * `TABLE_LIMITS`: the paste is untrusted input.
 */

import { dieOfHeader, dieOfNumbers, looksLikeRoll, plainCell, readRollCell } from './dieRanges';
import { readMarkdownTables } from './markdownTables';
import { toRandomTable } from './noteTables';
import { TABLE_LIMITS } from './tableModel';

export interface PastedTable {
  /** Column headers, the roll column's first when `numbered`. */
  headers: string[];
  /** Body rows, exactly one cell per header. */
  rows: string[][];
  /** The first column holds the numbers the rows answer. */
  numbered: boolean;
}

export interface PasteOptions {
  /** Header of the result column where the paste names none (the caller passes a translated word). */
  resultHeader: string;
  /** Header of a roll column whose numbers name no die (a translated word too). */
  rollHeader: string;
  /** A strict file importer can reject a clipped cell or row instead of accepting a partial table. */
  onLimit?: () => void;
}

/** The numbers at a line's start are read from this many characters and words at most. */
const ROLL_PREFIX_CHARACTERS = 40;
const ROLL_PREFIX_WORDS = 4;
/** A die heading a PDF table is read from this many characters of its first word. */
const DIE_WORD_CHARACTERS = 20;
/** What follows the numbers of a list: `1.`, `1)`, `1:`. */
const ROLL_MARKER = /[.):]$/;
const SPACES = /[\u00a0\u2007\u202f]/g;

interface LineRoll {
  roll: string;
  rest: string;
}

interface HeaderLine {
  roll?: string;
  result: string;
}

/** A cell trimmed and cut to `TABLE_LIMITS.cellCharacters`. */
function cell(text: string): string {
  return text.trim().slice(0, TABLE_LIMITS.cellCharacters).trim();
}

function padded(cells: readonly string[], width: number): string[] {
  return Array.from({ length: width }, (_, column) => cells[column] ?? '');
}

/** `Result`, `Result 2`, `Result 3`... for columns the paste names none of. */
function resultHeaders(count: number, resultHeader: string): string[] {
  return Array.from({ length: count }, (_, column) => (column === 0 ? resultHeader : `${resultHeader} ${column + 1}`));
}

/** The die the rows' numbers end on, else the plain word. */
function rollHeader(rows: readonly string[][], word: string): string {
  return dieOfNumbers(rows.flatMap((row) => readRollCell(row[0] ?? '') ?? []))?.label ?? word;
}

/** Whether the note reader takes the first column for the rolls, so paste and note agree. */
function hasRollColumn(headers: string[], rows: string[][]): boolean {
  return toRandomTable({ name: '', index: 0, line: 0, headers, rows, context: [], limits: [] }).hasRollColumn;
}

function fromMarkdown(text: string): PastedTable | null {
  const table = readMarkdownTables(text, '').tables[0];
  if (!table) return null;
  return { headers: table.headers, rows: table.rows, numbered: hasRollColumn(table.headers, table.rows) };
}

function fromTabs(lines: readonly string[], options: PasteOptions): PastedTable {
  const lineCharacters = TABLE_LIMITS.columns * (TABLE_LIMITS.cellCharacters + 1);
  const split = lines
    .filter((line) => line.trim() !== '')
    .slice(0, TABLE_LIMITS.rows + 1)
    .map((line) => line.slice(0, lineCharacters).split('\t', TABLE_LIMITS.columns).map(cell));
  if (split.length === 0) return { headers: [], rows: [], numbered: false };
  const width = Math.max(...split.map((cells) => cells.length));
  const first = split[0]?.[0] ?? '';
  const second = split[1]?.[0];
  const named = second !== undefined && !looksLikeRoll(first) && (looksLikeRoll(second) || width > 1);
  const rows = split.slice(named ? 1 : 0, (named ? 1 : 0) + TABLE_LIMITS.rows).map((cells) => padded(cells, width));
  if (named) {
    const headers = padded(split[0]!, width);
    return { headers, rows, numbered: hasRollColumn(headers, rows) };
  }
  const numbered = hasRollColumn(padded([], width), rows);
  const headers = numbered
    ? [rollHeader(rows, options.rollHeader), ...resultHeaders(width - 1, options.resultHeader)]
    : resultHeaders(width, options.resultHeader);
  return { headers, rows, numbered };
}

/** The numbers a line starts with (`1`, `1–2`, `01–05`, `**3**`, `1.`, `2 or less`) and the text after them. */
function rollAtStart(line: string): LineRoll | null {
  const head = line.slice(0, ROLL_PREFIX_CHARACTERS);
  const words = /\S+/g;
  const ends: number[] = [];
  for (let word = words.exec(head); word && ends.length < ROLL_PREFIX_WORDS; word = words.exec(head)) {
    const end = word.index + word[0].length;
    // A word the head cuts short is read no further.
    if (end === head.length && end < line.length) break;
    ends.push(end);
  }
  for (let count = ends.length; count > 0; count--) {
    const end = ends[count - 1]!;
    const roll = plainCell(line.slice(0, end)).replace(ROLL_MARKER, '').trim();
    if (readRollCell(roll) !== null) return { roll, rest: line.slice(end) };
  }
  return null;
}

/** A wrapped line added to the cell before it; a word a hyphen broke at the line's end is joined whole. */
function joined(previous: string, next: string, onLimit?: () => void): string {
  const brokenWord = previous.endsWith('-') && /\p{L}/u.test(previous.charAt(previous.length - 2)) && /\p{Ll}/u.test(next.charAt(0));
  const text = brokenWord ? previous.slice(0, -1) + next : previous === '' ? next : `${previous} ${next}`;
  if (text.length > TABLE_LIMITS.cellCharacters) onLimit?.();
  return cell(text);
}

/** The header among the lines before the first numbered one: the last that starts with a die, else the first. */
function headerLine(lines: readonly string[], resultHeader: string): HeaderLine {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]!;
    const word = /^\S+/.exec(line.slice(0, DIE_WORD_CHARACTERS))?.[0] ?? '';
    if (dieOfHeader(word) !== null) return { roll: word, result: cell(line.slice(word.length)) || resultHeader };
  }
  return { result: lines[0] === undefined ? resultHeader : cell(lines[0]) || resultHeader };
}

/** Lines without numbers: one row each, under a first line that ends with a colon. */
function unnumbered(lines: readonly string[], resultHeader: string): PastedTable {
  const named = lines.length > 1 && lines[0]!.endsWith(':');
  const header = named ? cell(lines[0]!.slice(0, -1)) || resultHeader : resultHeader;
  const rows = lines.slice(named ? 1 : 0, (named ? 1 : 0) + TABLE_LIMITS.rows).map((line) => [cell(line)]);
  return { headers: [header], rows, numbered: false };
}

function fromLines(lines: readonly string[], options: PasteOptions): PastedTable {
  if (lines.some((line) => line.trim().length > TABLE_LIMITS.cellCharacters)) options.onLimit?.();
  const filled = lines.map((line) => line.slice(0, TABLE_LIMITS.cellCharacters).trim()).filter((line) => line !== '');
  const firstRoll = filled.findIndex((line) => rollAtStart(line) !== null);
  if (firstRoll < 0) return unnumbered(filled, options.resultHeader);

  const rows: string[][] = [];
  for (const line of filled.slice(firstRoll)) {
    const start = rollAtStart(line);
    if (start) {
      if (rows.length === TABLE_LIMITS.rows) { options.onLimit?.(); break; }
      rows.push([start.roll, cell(start.rest)]);
    } else {
      const row = rows[rows.length - 1]!;
      row[1] = joined(row[1]!, line, options.onLimit);
    }
  }
  const header = headerLine(filled.slice(0, firstRoll), options.resultHeader);
  return { headers: [header.roll ?? rollHeader(rows, options.rollHeader), header.result], rows, numbered: true };
}

/** Pasted text as a table, or null when it holds no rows. */
export function readPastedTable(text: string, options: PasteOptions): PastedTable | null {
  const bounded = text.slice(0, TABLE_LIMITS.noteBytes).replace(SPACES, ' ');
  const lines = bounded.split(/\r\n|\r|\n/);
  const table = fromMarkdown(bounded)
    ?? (lines.some((line) => line.includes('\t')) ? fromTabs(lines, options) : fromLines(lines, options));
  return table.rows.length > 0 ? table : null;
}
