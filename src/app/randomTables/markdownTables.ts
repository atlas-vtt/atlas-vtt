/**
 * Finding the tables of a Markdown note: a header row, a delimiter row and the
 * body rows below them, each named by the heading above it. Frontmatter and
 * code fences are skipped; a table may stand in a blockquote or callout. Pure,
 * and bounded by `TABLE_LIMITS`: the note is untrusted input.
 */

import { isDelimiterRow, splitTableLine } from './tableCells';
import { TABLE_LIMITS, type TableLimit } from './tableModel';

export interface MarkdownTable {
  /** Unique in the note: its heading without a trailing "Roll 1d6:", else the note's name; "<name> 2" for a later one. */
  name: string;
  /** The heading above it as written; absent without one. */
  heading?: string;
  index: number;
  /** Line of the header row, from 0. */
  line: number;
  headers: string[];
  rows: string[][];
  /** The heading and the line just above the table, where a "Roll 1d6" may name its die. */
  context: string[];
  limits: TableLimit[];
}

export interface MarkdownTables {
  tables: MarkdownTable[];
  tooLarge: boolean;
  moreTables: boolean;
}

const HEADING = /^ {0,3}#{1,6}(?:[ \t]|$)/;
/** Headings and lines read for a name or a die are cut to this, so no pattern ever reads a long line. */
const CONTEXT_CHARACTERS = 200;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const QUOTE = /^(?:[ \t]{0,3}>[ \t]?)+/;
/** "Roll 1d6:", "Roll d6", "(d6)" at the end of a heading. */
const ROLL_SUFFIX = /[\s:–—-]*(?:\(\s*\d*d(?:\d+|%)\s*\)|\broll(?:\s+(?:a|an|one))?\s+\d*d(?:\d+|%))\s*[:.]?\s*$/i;

/** The bytes of the note in UTF-8 are never fewer than its UTF-16 units, so a long text is skipped unencoded. */
function isTooLarge(text: string): boolean {
  if (text.length > TABLE_LIMITS.noteBytes) return true;
  return new TextEncoder().encode(text).length > TABLE_LIMITS.noteBytes;
}

/** The table's name as a heading gives it: without its emphasis and its "Roll 1d6:". */
export function headingName(heading: string): string {
  const plain = heading.replace(/(\*\*|__)/g, '').trim();
  return plain.replace(ROLL_SUFFIX, '').trim() || plain;
}

/** A heading's text without its closing hashes (`## Gems ##`), or undefined for no heading. */
function headingText(line: string): string | undefined {
  if (!HEADING.test(line)) return undefined;
  const text = line.trim().replace(/^#+/, '').slice(0, CONTEXT_CHARACTERS).trim();
  const closing = /\s#+$/.exec(text);
  return (closing ? text.slice(0, closing.index) : text).trim();
}

function quoteDepth(line: string): number {
  return (QUOTE.exec(line)?.[0].match(/>/g) ?? []).length;
}

/** Index of the line after the frontmatter, or 0 without any. */
function bodyStart(lines: readonly string[]): number {
  if (lines[0]?.trimEnd() !== '---') return 0;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trimEnd();
    if (line === '---' || line === '...') return i + 1;
  }
  return 0;
}

/** At most `TABLE_LIMITS.columns` cells, each at most `cellCharacters` long, padded to `width`. */
function boundedCells(cells: readonly string[], width: number, limits: Set<TableLimit>): string[] {
  const bounded: string[] = [];
  for (let i = 0; i < width; i++) {
    const cell = cells[i] ?? '';
    if (cell.length > TABLE_LIMITS.cellCharacters) limits.add('cell');
    bounded.push(cell.slice(0, TABLE_LIMITS.cellCharacters));
  }
  return bounded;
}

/** Names unique in the note, in order: a second table under one heading is "<heading> 2". */
function uniqueName(base: string, taken: Map<string, number>): string {
  const seen = (taken.get(base) ?? 0) + 1;
  taken.set(base, seen);
  return seen === 1 ? base : `${base} ${seen}`;
}

/** The tables of a note's Markdown, `noteName` naming those without a heading. */
export function readMarkdownTables(text: string, noteName: string): MarkdownTables {
  if (isTooLarge(text)) return { tables: [], tooLarge: true, moreTables: false };
  const lines = text.split(/\r?\n/);
  const tables: MarkdownTable[] = [];
  const names = new Map<string, number>();
  let heading: string | undefined;
  let lastText: string | undefined;
  let fence: string | null = null;

  for (let i = bodyStart(lines); i < lines.length; i++) {
    const raw = lines[i]!;
    if (fence !== null) {
      if (raw.replace(QUOTE, '').trim().startsWith(fence)) fence = null;
      continue;
    }
    const depth = quoteDepth(raw);
    const line = raw.replace(QUOTE, '');
    const opening = FENCE.exec(line);
    if (opening) {
      fence = opening[1]!;
      continue;
    }
    const headingLine = headingText(line);
    if (headingLine !== undefined) {
      heading = headingLine || undefined;
      lastText = undefined;
      continue;
    }

    const header = splitTableLine(line);
    const next = lines[i + 1];
    if (header.pipes === 0 || next === undefined || quoteDepth(next) !== depth
      || !isDelimiterRow(splitTableLine(next.replace(QUOTE, '')), header.cells.length)) {
      if (line.trim()) lastText = line.trim().slice(0, CONTEXT_CHARACTERS);
      continue;
    }
    if (tables.length === TABLE_LIMITS.tables) return { tables, tooLarge: false, moreTables: true };

    const limits = new Set<TableLimit>();
    const width = Math.min(header.cells.length, TABLE_LIMITS.columns);
    if (header.cells.length > width) limits.add('columns');
    const rows: string[][] = [];
    let end = i + 2;
    for (; end < lines.length; end++) {
      const rowLine = lines[end]!;
      if (quoteDepth(rowLine) !== depth) break;
      const row = splitTableLine(rowLine.replace(QUOTE, ''));
      if (row.pipes === 0) break;
      if (rows.length === TABLE_LIMITS.rows) {
        limits.add('rows');
        continue;
      }
      if (row.cells.length > width) limits.add('columns');
      rows.push(boundedCells(row.cells, width, limits));
    }

    tables.push({
      name: uniqueName(heading === undefined ? noteName : headingName(heading), names),
      ...(heading !== undefined && { heading }),
      index: tables.length,
      line: i,
      headers: boundedCells(header.cells, width, limits),
      rows,
      context: [heading, lastText].filter((part): part is string => part !== undefined),
      limits: [...limits],
    });
    lastText = undefined;
    i = end - 1;
  }
  return { tables, tooLarge: false, moreTables: false };
}
