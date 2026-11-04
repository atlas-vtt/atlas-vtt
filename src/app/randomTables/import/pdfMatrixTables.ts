import { dieInText, dieOfHeader, dieOfNumbers, readRollCell } from '../dieRanges';
import { headingName } from '../markdownTables';
import { TABLE_LIMITS } from '../tableModel';
import { IMPORT_LIMITS, hasUnreadableText, type ImportCandidate, type TableDiscovery } from './importModel';
import { groupPdfSpans, spanText, type PdfLine, type PdfSpan } from './pdfLayout';
import { isCompletePdfTable, pdfTableCaption } from './pdfTableCells';

interface MatrixHeader {
  labels: string[];
  start: number;
  end: number;
  centers: number[];
  tolerances: number[];
}

export interface PdfMatrixDiscovery extends TableDiscovery {
  /** Last line read, so a matrix's range columns cannot also be mistaken for ordinary tables. */
  endLine: number;
}

const UNAVAILABLE = /^[-–—−]$/;

function matrixHeader(line: PdfLine): MatrixHeader | null {
  const groups = groupPdfSpans(line);
  if (groups.length < 3 || groups.length > TABLE_LIMITS.columns) return null;
  const labels = groups.map(spanText);
  if (labels.some((label) => !/\p{L}/u.test(label) || hasUnreadableText(label) || dieOfHeader(label) !== null
    || label.length > IMPORT_LIMITS.nameCharacters)) return null;
  if (new Set(labels.slice(1).map((label) => label.toLowerCase())).size !== labels.length - 1) return null;
  const centers = groups.slice(1).map((group) => (group[0]!.x + group.at(-1)!.x + group.at(-1)!.width) / 2);
  if (centers.some((center, index) => index > 0 && center - centers[index - 1]! < line.height * 2)) return null;
  const tolerances = centers.map((center, index) => Math.min(line.height * 1.4,
    (center - (centers[index - 1] ?? -Infinity)) / 4,
    ((centers[index + 1] ?? Infinity) - center) / 4));
  return { labels, centers, tolerances, start: groups[0]![0]!.x, end: groups.at(-1)!.at(-1)!.x + groups.at(-1)!.at(-1)!.width };
}

/** Centered ranges stay in their own columns; long left-aligned encounter names stay whole. */
function matrixCells(line: PdfLine, header: MatrixHeader): string[] | null {
  const cells: PdfSpan[][] = header.labels.map(() => []);
  for (const span of line.spans) {
    if (span.x + span.width <= header.start - line.height * 1.5 || span.x >= header.end + line.height * 0.5) continue;
    const center = span.x + span.width / 2;
    const column = header.centers.findIndex((anchor, index) => Math.abs(anchor - center) <= header.tolerances[index]!);
    if (column >= 0) cells[column + 1]!.push(span);
    else if (span.x >= header.start - line.height * 1.5
      && span.x + span.width < header.centers[0]! - header.tolerances[0]!) cells[0]!.push(span);
    else return null;
  }
  for (const group of cells) {
    for (let index = 1; index < group.length; index++) {
      if (group[index]!.x < group[index - 1]!.x + group[index - 1]!.width - line.height * 0.2) return null;
    }
  }
  for (let column = 1; column < cells.length; column++) {
    const left = cells[column - 1]!.at(-1);
    const right = cells[column]![0];
    if (left && right && left.x + left.width > right.x + line.height * 0.2) return null;
  }
  const text = cells.map(spanText);
  return text[0] !== '' && !text.some(hasUnreadableText) ? text : null;
}

/** True matrices contain ranges in multiple labeled columns, not ordinary price/statistic columns. */
function hasRanges(rows: readonly string[][]): boolean {
  return rows[0]!.slice(1).filter((_cell, index) => rows.some((row) =>
    readRollCell(row[index + 1]!)?.some((range) => range.min !== range.max))).length >= 2;
}

/** Result labels on the left and independent dice columns, e.g. terrain-based wilderness encounters. */
export function readPdfMatrix(lines: readonly PdfLine[], index: number, page: number): PdfMatrixDiscovery | null {
  const line = lines[index]!;
  const header = matrixHeader(line);
  if (!header) return null;
  const first = lines[index + 1];
  if (!first || first.y - line.y > line.height * 2.5) return null;
  const firstCells = matrixCells(first, header);
  if (!firstCells) return null;

  const rows: string[][] = [];
  let lastY = line.y;
  let height = line.height;
  let endLine = index;
  let badGeometry = false;
  for (let at = index + 1; at < lines.length; at++) {
    const rowLine = lines[at]!;
    if (rowLine.y - lastY > height * 2.5 || rowLine.height > height * 1.15 || matrixHeader(rowLine)) break;
    const cells = matrixCells(rowLine, header);
    if (!cells) { badGeometry = true; break; }
    const filled = cells.slice(1).filter((cell) => cell !== '').length;
    if (filled === 0) {
      const nextDiceHeader = groupPdfSpans(rowLine).some((group) => dieOfHeader(spanText(group).split(/\s/, 1)[0] ?? '') !== null);
      // Close same-sized text could be a wrapped label or another caption: neither is guessed.
      if (!nextDiceHeader && rows.length > 0 && rowLine.y - lastY <= height * 1.6) badGeometry = true;
      break;
    } else if (filled !== header.centers.length || rows.length === TABLE_LIMITS.rows) {
      badGeometry = true;
      break;
    } else rows.push(cells);
    lastY = rowLine.y;
    height = rowLine.height;
    endLine = at;
  }
  if (badGeometry) return { tables: [], warnings: ['skippedTables'], endLine };
  if (rows.length === 0 || !hasRanges(rows)) return null;
  const caption = pdfTableCaption(lines, index, header.start, header.end);
  const tables: ImportCandidate[] = [];
  let skipped = false;
  for (let column = 1; column < header.labels.length; column++) {
    const label = header.labels[column]!;
    const selected = rows.filter((row) => !UNAVAILABLE.test(row[column]!));
    const ranges = selected.map((row) => readRollCell(row[column]!));
    if (ranges.some((range) => range === null)) { skipped = true; continue; }
    const die = dieInText(label) ?? dieInText(caption) ?? dieOfNumbers(ranges.flatMap((range) => range ?? []));
    if (!die) { skipped = true; continue; }
    const table = { headers: [die.label, header.labels[0]!], rows: selected.map((row) => [row[column]!, row[0]!]), numbered: true };
    if (!isCompletePdfTable(table)) { skipped = true; continue; }
    const name = caption ? `${headingName(caption)} — ${headingName(label)}` : headingName(label);
    tables.push({ name: name.length <= IMPORT_LIMITS.nameCharacters ? name : '', table, page });
  }
  return { tables, warnings: skipped ? ['skippedTables'] : [], endLine };
}
