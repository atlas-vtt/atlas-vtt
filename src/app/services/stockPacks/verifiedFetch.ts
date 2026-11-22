import { requestUrl } from 'obsidian';
import { t } from '../../i18n';
import { sha256 } from '../../utils/hashing';

/** A file of a pack as the plugin knows it: what it must hold to be kept. */
export interface PackedFile {
  /** Its name on the host. */
  key: string;
  bytes: number;
  sha256: string;
}

/** Fetches a file's bytes; Obsidian's `requestUrl` outside tests. Nothing about the user or the vault goes with it. */
export type FetchBytes = (url: string) => Promise<ArrayBuffer>;

/** What went wrong with a pack: the host did not serve it, what came is not what was pinned, or there is nowhere to put it. */
export type StockPackFailure = 'unavailable' | 'damaged' | 'folder';

/** A pack that could not be fetched whole, or not written, so nothing of it was kept. */
export class StockPackError extends Error {
  constructor(message: string, readonly failure: StockPackFailure = 'damaged') {
    super(message);
    this.name = 'StockPackError';
  }
}

/** Why a pack's download failed, in a few words. A rejection of `requestUrl` itself is the connection; one with a system code is the disk. */
export function explainStockPackError(error: unknown): string {
  if (error instanceof StockPackError) return t(`downloads.reason.${error.failure}`);
  if (error instanceof Error && 'code' in error && typeof error.code === 'string') return t('downloads.reason.disk');
  return t('downloads.reason.connection');
}

export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await requestUrl({ url, throw: false });
  if (response.status !== 200) throw new StockPackError(`${url} answered ${response.status}.`, 'unavailable');
  return response.arrayBuffer;
}

/** Whether `bytes` are the file `expected` describes: its size, then its SHA-256. */
export async function matchesFile(bytes: ArrayBuffer, expected: Pick<PackedFile, 'bytes' | 'sha256'>): Promise<boolean> {
  return bytes.byteLength === expected.bytes && (await sha256(bytes)) === expected.sha256;
}

/** Fetches a file from `host` and checks it against its size and SHA-256, so a broken or tampered download is never kept. */
export async function fetchVerified(host: string, file: PackedFile, fetch: FetchBytes = fetchBytes): Promise<ArrayBuffer> {
  const bytes = await fetch(host + file.key);
  if (!(await matchesFile(bytes, file))) throw new StockPackError(`${file.key} is not the file the pack names.`);
  return bytes;
}

/** Runs `task` for every item, at most `parallel` at a time, and returns the results in the items' order. */
export async function inPool<T, R>(items: readonly T[], parallel: number, task: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let next = 0;
  const worker = async (): Promise<void> => {
    for (let index = next++; index < items.length; index = next++) {
      const item = items[index];
      if (item !== undefined) results[index] = await task(item);
    }
  };
  await Promise.all(Array.from({ length: parallel }, worker));
  return results;
}
