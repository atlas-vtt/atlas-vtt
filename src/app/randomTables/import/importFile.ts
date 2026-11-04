import { Platform } from 'obsidian';
import type { PasteOptions } from '../pastedTable';
import { TABLE_LIMITS } from '../tableModel';
import { IMPORT_LIMITS, TableImportError, hasUnreadableText, type TableDiscovery } from './importModel';
import { readPdfTables, type PdfReadOptions } from './pdfReader';
import { discoverTextTables } from './textTables';

export const TABLE_FILE_ACCEPT = '.pdf,.xlsx,.csv,.tsv,.md,.markdown,.txt';
export type TableImportFile = Pick<File, 'name' | 'size' | 'arrayBuffer'>;

/** Read only the explicit supported formats, checking size before allocation. */
export async function importTableFile(file: TableImportFile, options: PasteOptions, readOptions: PdfReadOptions = {}): Promise<TableDiscovery> {
  readOptions.signal?.throwIfAborted();
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  const format = extension === 'markdown' ? 'md' : extension;
  if (!format || !['pdf', 'xlsx', 'csv', 'tsv', 'md', 'txt'].includes(format)) throw new TableImportError('unsupported');
  const limit = format === 'pdf' ? (Platform.isDesktop ? IMPORT_LIMITS.pdfBytes : 64 * 1024 * 1024)
    : format === 'xlsx' ? IMPORT_LIMITS.workbookBytes : TABLE_LIMITS.noteBytes;
  if (!Number.isSafeInteger(file.size) || file.size < 0 || file.size > limit) throw new TableImportError('tooLarge');
  const bytes = await file.arrayBuffer();
  readOptions.signal?.throwIfAborted();
  if (bytes.byteLength > limit) throw new TableImportError('tooLarge');
  if (format === 'pdf') return readPdfTables(bytes, readOptions);
  if (format === 'xlsx') {
    const { discoverWorkbookTables } = await import('./workbookTables');
    const result = await discoverWorkbookTables(bytes, options);
    readOptions.signal?.throwIfAborted();
    return result;
  }
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new TableImportError('malformed'); }
  if (hasUnreadableText(text)) throw new TableImportError('malformed');
  if (format !== 'csv' && format !== 'tsv' && format !== 'md' && format !== 'txt') throw new TableImportError('unsupported');
  return discoverTextTables(text, format, options);
}
