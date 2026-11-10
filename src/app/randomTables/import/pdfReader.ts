import { loadPdfJs } from 'obsidian';
import { TABLE_LIMITS } from '../tableModel';
import { IMPORT_LIMITS, TableImportError, type ImportWarning, type TableDiscovery } from './importModel';
import { spansFromPdfItems } from './pdfLayout';
import { discoverPdfTables } from './pdfTables';

export interface PdfPage {
  getViewport(options: { scale: number }): { transform: readonly number[] };
  getTextContent(): Promise<{ items: readonly unknown[] }>;
  cleanup(): void;
}

export interface PdfDocument {
  numPages: number;
  getPermissions(): Promise<readonly number[] | null>;
  getPage(page: number): Promise<PdfPage>;
}

interface PdfLoadingTask {
  promise: Promise<PdfDocument>;
  destroy(): Promise<void>;
}

export interface PdfLibrary {
  getDocument(options: {
    data: Uint8Array;
    isEvalSupported: false;
    useWorkerFetch: false;
    disableFontFace: true;
    stopAtErrors: true;
    verbosity: 0;
  }): PdfLoadingTask;
  PermissionFlag: { COPY: number };
}

export interface PdfReadOptions {
  signal?: AbortSignal;
  onProgress?: (page: number, pages: number) => void;
  load?: () => Promise<unknown>;
}

function isPdfLibrary(value: unknown): value is PdfLibrary {
  return typeof value === 'object' && value !== null && 'getDocument' in value && typeof value.getDocument === 'function'
    && 'PermissionFlag' in value && typeof value.PermissionFlag === 'object' && value.PermissionFlag !== null
    && 'COPY' in value.PermissionFlag && typeof value.PermissionFlag.COPY === 'number';
}

/** Cancellation releases the PDF worker even while its promise is pending. No rejected race promise is left unobserved. */
async function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  let abort: (() => void) | undefined;
  let timer: number | undefined;
  const stopped = new Promise<never>((_resolve, reject) => {
    abort = (): void => reject(new DOMException('Cancelled', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    timer = window.setTimeout(() => reject(new TableImportError('malformed')), 30_000);
  });
  try { return await Promise.race([promise, stopped]); }
  finally {
    if (abort) signal?.removeEventListener('abort', abort);
    window.clearTimeout(timer);
  }
}

/** Embedded text only, through Obsidian's PDF.js. Files, scripts, links and annotations are never executed. */
export async function readPdfTables(bytes: ArrayBuffer, options: PdfReadOptions = {}): Promise<TableDiscovery> {
  options.signal?.throwIfAborted();
  if (bytes.byteLength > IMPORT_LIMITS.pdfBytes) throw new TableImportError('tooLarge');
  const data = new Uint8Array(bytes);
  if (!new TextDecoder().decode(data.subarray(0, 1024)).includes('%PDF-')) throw new TableImportError('malformed');
  let runtime: unknown;
  try { runtime = await abortable((options.load ?? loadPdfJs)(), options.signal); }
  catch (error: unknown) {
    if (options.signal?.aborted) throw error;
    throw new TableImportError('pdfUnavailable');
  }
  if (!isPdfLibrary(runtime)) throw new TableImportError('pdfUnavailable');
  const task = runtime.getDocument({ data, isEvalSupported: false, useWorkerFetch: false, disableFontFace: true, stopAtErrors: true, verbosity: 0 });
  let destroying: Promise<void> | undefined;
  const destroy = (): Promise<void> => destroying ??= task.destroy().catch(() => undefined);
  const onAbort = (): void => { void destroy(); };
  options.signal?.addEventListener('abort', onAbort, { once: true });
  const tables: TableDiscovery['tables'] = [];
  const warnings = new Set<ImportWarning>(['pdfReview']);
  try {
    const doc = await abortable(task.promise, options.signal);
    if (!Number.isInteger(doc.numPages) || doc.numPages < 1 || doc.numPages > IMPORT_LIMITS.pages) throw new TableImportError('tooLarge');
    const permissions = await abortable(doc.getPermissions(), options.signal);
    if (permissions !== null && !permissions.includes(runtime.PermissionFlag.COPY)) throw new TableImportError('permissions');
    for (let index = 1; index <= doc.numPages; index++) {
      options.signal?.throwIfAborted();
      let page: PdfPage | undefined;
      try {
        page = await abortable(doc.getPage(index), options.signal);
        const content = await abortable(page.getTextContent(), options.signal);
        if (content.items.length > IMPORT_LIMITS.pageItems) { warnings.add('skippedTables'); continue; }
        const spans = spansFromPdfItems(content.items, page.getViewport({ scale: 1 }).transform);
        if (!spans || spans.reduce((count, span) => count + span.text.length, 0) > TABLE_LIMITS.noteBytes) {
          warnings.add('skippedTables');
          continue;
        }
        if (spans.length === 0) warnings.add('noText');
        const found = discoverPdfTables(spans, index);
        if (tables.length + found.tables.length > TABLE_LIMITS.tables) throw new TableImportError('tooLarge');
        tables.push(...found.tables);
        for (const warning of found.warnings) warnings.add(warning);
      } catch (error: unknown) {
        if (options.signal?.aborted || error instanceof TableImportError) throw error;
        warnings.add('pageFailed');
      } finally {
        page?.cleanup();
        if (!options.signal?.aborted) options.onProgress?.(index, doc.numPages);
      }
    }
    return { tables, warnings: [...warnings] };
  } catch (error: unknown) {
    if (options.signal?.aborted || error instanceof TableImportError) throw error;
    const name = error instanceof Error ? error.name : '';
    throw new TableImportError(name === 'PasswordException' ? 'password' : 'malformed');
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
    await destroy();
  }
}
