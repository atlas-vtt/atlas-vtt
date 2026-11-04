import { dieOfHeader, dieOfNumbers, isWeightHeader, looksLikeRoll, readRollCell } from '../dieRanges';
import { toRandomTable } from '../noteTables';
import type { PasteOptions, PastedTable } from '../pastedTable';
import { TABLE_LIMITS } from '../tableModel';
import { TableImportError, validateImportTable, type ImportCandidate } from './importModel';

/** CSV/TSV records, including quoted newlines. An unfinished or malformed quote is rejected. */
export function readDelimited(text: string, separator: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let closed = false;
  const finishCell = (): void => {
    if (row.length === TABLE_LIMITS.columns || cell.length > TABLE_LIMITS.cellCharacters) throw new TableImportError('tooLarge');
    row.push(cell.replace(/\r\n|[\r\n]/g, ' '));
    cell = '';
    closed = false;
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!;
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === separator) finishCell();
    else if (char === '\r' || char === '\n') {
      finishCell();
      rows.push(row);
      row = [];
      if (char === '\r' && text[i + 1] === '\n') i++;
    } else if (char === '"' && cell === '' && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new TableImportError('malformed');
      cell += char;
    }
    if (cell.length > TABLE_LIMITS.cellCharacters) throw new TableImportError('tooLarge');
  }
  if (quoted) throw new TableImportError('malformed');
  if (cell !== '' || row.length > 0 || closed) { finishCell(); rows.push(row); }
  return rows;
}

/** An explicitly separated spreadsheet region; title rows never become result headers. */
function regionTable(region: readonly string[][], options: PasteOptions, sheet?: string): ImportCandidate | null {
  const width = Math.max(...region.map((row) => row.findLastIndex((cell) => cell !== '') + 1));
  if (width === 0) return null;
  const rows = region.map((row) => Array.from({ length: width }, (_, column) => row[column] ?? ''));
  const titleRow = width > 1 && rows.length > 2 && rows[0]!.slice(1).every((cell) => cell === '') && !looksLikeRoll(rows[0]![0]!);
  const name = titleRow ? rows.shift()![0]! : sheet ?? '';
  const named = rows.length > 1 && !looksLikeRoll(rows[0]![0]!) && width > 1;
  const headers = named ? rows.shift()! : Array.from({ length: width }, (_, column) => {
    if (column === 0 && width > 1 && rows.every((row) => readRollCell(row[0]!) !== null)) {
      return dieOfNumbers(rows.flatMap((row) => readRollCell(row[0]!) ?? []))?.label ?? options.rollHeader;
    }
    return column <= 1 ? options.resultHeader : `${options.resultHeader} ${column}`;
  });
  if (rows.length === 0) return null;
  const numbered = toRandomTable({ headers, rows, name, index: 0, line: 0, context: [], limits: [] }).hasRollColumn;
  const table: PastedTable = { headers, rows, numbered };
  validateImportTable(table, name);
  let headerlessTable: PastedTable | undefined;
  if (named && dieOfHeader(headers[0]!) === null && !headers.some(isWeightHeader)) {
    headerlessTable = {
      headers: Array.from({ length: width }, (_, column) => column === 0 ? options.resultHeader : `${options.resultHeader} ${column + 1}`),
      rows: [headers, ...rows], numbered: false,
    };
    validateImportTable(headerlessTable, name);
  }
  return { name, table, ...(headerlessTable ? { headerlessTable } : {}), ...(sheet === undefined ? {} : { sheet }) };
}

/** Blank records delimit tables. Never silently takes just the first region. */
export function discoverCellTables(rows: readonly string[][], options: PasteOptions, sheet?: string): ImportCandidate[] {
  const tables: ImportCandidate[] = [];
  let region: string[][] = [];
  const finish = (): void => {
    if (region.length === 0) return;
    const candidate = regionTable(region, options, sheet);
    if (candidate) tables.push(candidate);
    region = [];
    if (tables.length > TABLE_LIMITS.tables) throw new TableImportError('tooLarge');
  };
  for (const row of rows) {
    if (row.every((cell) => cell.trim() === '')) finish();
    else {
      region.push(row);
      if (region.length > TABLE_LIMITS.rows + 2) throw new TableImportError('tooLarge');
    }
  }
  finish();
  return tables;
}
