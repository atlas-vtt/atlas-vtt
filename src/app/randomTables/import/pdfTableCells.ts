import { readRollCell } from '../dieRanges';
import { tablesOfNote } from '../noteTables';
import type { PastedTable } from '../pastedTable';
import { tableNoteText } from '../tableMarkdown';
import { IMPORT_LIMITS, validateImportTable } from './importModel';
import { spanText, type PdfLine } from './pdfLayout';

/** A nearby individual caption, as printed. Keep its die until the caller has read it. */
export function pdfTableCaption(lines: readonly PdfLine[], index: number, start: number, end: number): string {
  const previous = lines[index - 1];
  const current = lines[index]!;
  if (!previous || current.y - previous.y > current.height * 3.5) return '';
  const spans = previous.spans.filter((span) => span.x >= start - previous.height * 1.5 && span.x < end - previous.height * 0.5);
  const text = spanText(spans);
  if (spans.some((span) => span.x + span.width > end)) return '';
  const headingStyle = spans.some((span) => span.height > current.height * 1.05) || (/[A-Z]/.test(text) && text === text.toUpperCase());
  return !headingStyle || text.length > IMPORT_LIMITS.nameCharacters || /[.!?;]$/.test(text) || readRollCell(text) !== null ? '' : text;
}

/** A wrapped cell without clipping; a word split by a line-ending hyphen is joined. */
export function appendPdfCell(previous: string, next: string): string {
  if (!next) return previous;
  const brokenWord = /\p{L}-$/u.test(previous) && /^\p{Ll}/u.test(next);
  return brokenWord ? previous.slice(0, -1) + next : previous ? `${previous} ${next}` : next;
}

/** Every imported dice table must cover its die exactly, without partial rows or unreadable cells. */
export function isCompletePdfTable(table: PastedTable): boolean {
  if (table.rows.length < 2) return false;
  try { validateImportTable(table); } catch { return false; }
  const model = tablesOfNote(tableNoteText('Table', table), 'Table').tables[0];
  return !!model?.die && model.problems.length === 0;
}
