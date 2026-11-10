import type { JSZipObject, JSZipStreamHelper } from 'jszip';
import { IMPORT_LIMITS, TableImportError } from './importModel';

/** Inspect the ZIP central directory before any entry is inflated. ZIP64 and encryption are unsupported. */
export function validateWorkbookZip(bytes: ArrayBuffer): void {
  if (bytes.byteLength > IMPORT_LIMITS.workbookBytes || bytes.byteLength < 22) throw new TableImportError('tooLarge');
  const view = new DataView(bytes);
  let end = -1;
  for (let at = bytes.byteLength - 22; at >= Math.max(0, bytes.byteLength - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50 && at + 22 + view.getUint16(at + 20, true) === bytes.byteLength) { end = at; break; }
  }
  if (end < 0) throw new TableImportError('malformed');
  const count = view.getUint16(end + 10, true);
  const size = view.getUint32(end + 12, true);
  let at = view.getUint32(end + 16, true);
  const start = at;
  if (view.getUint16(end + 4, true) !== 0 || view.getUint16(end + 6, true) !== 0
    || view.getUint16(end + 8, true) !== count || count === 0 || count > IMPORT_LIMITS.zipEntries
    || at + size !== end) throw new TableImportError('malformed');
  let inflated = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > end || view.getUint32(at, true) !== 0x02014b50) throw new TableImportError('malformed');
    const flags = view.getUint16(at + 8, true);
    const bytes = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    if ((flags & 1) !== 0 || view.getUint16(at + 34, true) !== 0 || view.getUint32(at + 42, true) === 0xffffffff) {
      throw new TableImportError('workbookUnsupported');
    }
    inflated += bytes;
    if (bytes > IMPORT_LIMITS.xmlBytes || inflated > IMPORT_LIMITS.inflatedBytes || nameLength > 512) throw new TableImportError('tooLarge');
    at += 46 + nameLength + extraLength + commentLength;
  }
  if (at !== start + size) throw new TableImportError('malformed');
}

/** Bound actual output too: a forged directory size cannot cause unbounded XML allocation. */
interface StreamedEntry extends JSZipObject {
  internalStream(type: 'uint8array'): JSZipStreamHelper<Uint8Array>;
}

function hasStream(entry: JSZipObject): entry is StreamedEntry {
  return 'internalStream' in entry && typeof entry.internalStream === 'function';
}

export async function readWorkbookPart(entry: JSZipObject, budget: { bytes: number }): Promise<string> {
  if (!hasStream(entry)) throw new TableImportError('workbookUnsupported');
  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    const stream = entry.internalStream('uint8array');
    stream.on('data', (chunk: Uint8Array) => {
      size += chunk.byteLength;
      budget.bytes += chunk.byteLength;
      if (size > IMPORT_LIMITS.xmlBytes || budget.bytes > IMPORT_LIMITS.inflatedBytes) {
        stream.pause();
        reject(new TableImportError('tooLarge'));
      } else chunks.push(chunk);
    });
    stream.on('error', () => reject(new TableImportError('malformed')));
    stream.on('end', () => {
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      try { resolve(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
      catch { reject(new TableImportError('malformed')); }
    });
    stream.resume();
  });
}
