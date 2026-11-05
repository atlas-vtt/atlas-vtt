import { requestUrl } from 'obsidian';
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

/** A pack that could not be fetched whole, or not written, so nothing of it was kept. */
export class StockPackError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StockPackError';
  }
}

export async function fetchBytes(url: string): Promise<ArrayBuffer> {
  const response = await requestUrl({ url, throw: false });
  if (response.status !== 200) throw new StockPackError(`${url} answered ${response.status}.`);
  return response.arrayBuffer;
}

/** Fetches a file from `host` and checks it against its size and SHA-256, so a broken or tampered download is never kept. */
export async function fetchVerified(host: string, file: PackedFile, fetch: FetchBytes = fetchBytes): Promise<ArrayBuffer> {
  const bytes = await fetch(host + file.key);
  if (bytes.byteLength !== file.bytes || (await sha256(bytes)) !== file.sha256) throw new StockPackError(`${file.key} is not the file the pack names.`);
  return bytes;
}
