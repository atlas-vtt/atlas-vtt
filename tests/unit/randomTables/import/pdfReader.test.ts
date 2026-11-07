// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { readPdfTables, type PdfDocument, type PdfLibrary } from '../../../../src/app/randomTables/import/pdfReader';

const bytes = new TextEncoder().encode('%PDF-1.7\n').buffer;

function library(items: unknown[] = []): { runtime: PdfLibrary; doc: PdfDocument; destroy: ReturnType<typeof vi.fn>; cleanup: ReturnType<typeof vi.fn> } {
  const destroy = vi.fn(async () => undefined);
  const cleanup = vi.fn();
  const doc: PdfDocument = {
    numPages: 1,
    getPermissions: async () => null,
    getPage: vi.fn(async () => ({
      getViewport: () => ({ transform: [1, 0, 0, -1, 0, 800] }),
      getTextContent: async () => ({ items }), cleanup,
    })),
  };
  return { runtime: { getDocument: () => ({ promise: Promise.resolve(doc), destroy }), PermissionFlag: { COPY: 16 } }, doc, destroy, cleanup };
}

describe('PDF import lifecycle', () => {
  it('releases pages and the loading task, reporting image-only pages', async () => {
    const pdf = library();
    const result = await readPdfTables(bytes, { load: async () => pdf.runtime });
    expect(result.warnings).toContain('noText');
    expect(pdf.cleanup).toHaveBeenCalledOnce();
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('rejects password-protected input and releases a failed loading task', async () => {
    const pdf = library();
    pdf.runtime.getDocument = () => ({ promise: Promise.reject(Object.assign(new Error('Password'), { name: 'PasswordException' })), destroy: pdf.destroy });
    await expect(readPdfTables(bytes, { load: async () => pdf.runtime })).rejects.toMatchObject({ code: 'password' });
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('refuses disallowed copying and page limits, without reading pages', async () => {
    const pdf = library();
    pdf.doc.getPermissions = async () => [];
    await expect(readPdfTables(bytes, { load: async () => pdf.runtime })).rejects.toMatchObject({ code: 'permissions' });
    expect(pdf.doc.getPage).not.toHaveBeenCalled();
    pdf.doc.getPermissions = async () => null;
    pdf.doc.numPages = 1001;
    await expect(readPdfTables(bytes, { load: async () => pdf.runtime })).rejects.toMatchObject({ code: 'tooLarge' });
    expect(pdf.destroy).toHaveBeenCalledTimes(2);
  });

  it('accounts for failed pages rather than claiming a complete scan', async () => {
    const pdf = library();
    pdf.doc.getPage = async () => { throw new Error('broken page'); };
    expect((await readPdfTables(bytes, { load: async () => pdf.runtime })).warnings).toContain('pageFailed');
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('destroys the loading task immediately on cancellation', async () => {
    const pdf = library();
    const control = new AbortController();
    const promise = new Promise<PdfDocument>(() => undefined);
    pdf.runtime.getDocument = () => ({ promise, destroy: pdf.destroy });
    const reading = readPdfTables(bytes, { load: async () => pdf.runtime, signal: control.signal });
    await vi.waitFor(() => expect(control.signal.onabort !== null || pdf.destroy.mock.calls.length === 0).toBe(true));
    await Promise.resolve();
    control.abort();
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' });
    expect(pdf.destroy).toHaveBeenCalledOnce();
  });

  it('validates PDF signatures and the runtime API', async () => {
    await expect(readPdfTables(new ArrayBuffer(50), { load: async () => library().runtime })).rejects.toMatchObject({ code: 'malformed' });
    await expect(readPdfTables(bytes, { load: async () => ({}) })).rejects.toMatchObject({ code: 'pdfUnavailable' });
  });
});
