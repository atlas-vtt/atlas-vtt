import type { PastedTable } from '../pastedTable';
import { TABLE_LIMITS } from '../tableModel';
import { tableNoteText } from '../tableMarkdown';
import { tablesOfNote } from '../noteTables';

export const IMPORT_LIMITS = {
  pdfBytes: 256 * 1024 * 1024,
  workbookBytes: 16 * 1024 * 1024,
  xmlBytes: 4 * 1024 * 1024,
  inflatedBytes: 24 * 1024 * 1024,
  zipEntries: 512,
  pages: 1000,
  pageItems: 30_000,
  nameCharacters: 200,
} as const;

export interface ImportCandidate {
  /** Empty if there is no reliably identified title. The user must name it. */
  name: string;
  table: PastedTable;
  /** For an ambiguous spreadsheet header, the same records with the first kept as data. */
  headerlessTable?: PastedTable;
  page?: number;
  sheet?: string;
  line?: number;
}

export type ImportWarning = 'pdfReview' | 'skippedTables' | 'noText' | 'pageFailed';
export interface TableDiscovery {
  tables: ImportCandidate[];
  warnings: ImportWarning[];
}

export type ImportErrorCode = 'tooLarge' | 'malformed' | 'unsupported' | 'password' | 'permissions' | 'pdfUnavailable' | 'workbookUnsupported';

export class TableImportError extends Error {
  constructor(public readonly code: ImportErrorCode) {
    super(code);
    this.name = 'TableImportError';
  }
}

export function hasUnreadableText(text: string): boolean {
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if ((code < 32 && code !== 9 && code !== 10 && code !== 13) || code === 0xfffd) return true;
  }
  return false;
}

/** No partial rows, cells or notes are offered as a successful import. */
export function validateImportTable(table: PastedTable, name = ''): void {
  if (name.length > IMPORT_LIMITS.nameCharacters || /[\r\n]/.test(name)
    || table.headers.length === 0 || table.headers.length > TABLE_LIMITS.columns
    || table.rows.length === 0 || table.rows.length > TABLE_LIMITS.rows) throw new TableImportError('tooLarge');
  for (const cells of [table.headers, ...table.rows]) {
    if (cells.length !== table.headers.length || cells.some((cell) => cell.length > TABLE_LIMITS.cellCharacters)) {
      throw new TableImportError('tooLarge');
    }
  }
  const text = tableNoteText(name || 'Table', table);
  const read = tablesOfNote(text, name || 'Table');
  if (read.tooLarge || read.moreTables || read.tables.length !== 1 || read.tables[0]?.problems.some((problem) => problem.kind === 'limit')) {
    throw new TableImportError('tooLarge');
  }
}
