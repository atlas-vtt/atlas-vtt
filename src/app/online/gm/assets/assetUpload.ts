import { sha256Hex } from '../assetServe.ts';
import { partSizes } from './assetRoutes.ts';
import type { AssetStoreClient, StoreTrouble } from './storeClient.ts';

/** What an upload needs of the store. */
export type UploadClient = Pick<AssetStoreClient, 'putWhole' | 'startParts' | 'putPart' | 'complete'>;

/** An asset on its way up: its id, content hash, type, and how the store asked for it. */
export interface UploadJob {
  readonly id: string;
  readonly hash: string;
  readonly mime: string;
  readonly upload: 'single' | 'multipart';
  readonly partBytes: number;
}

/** How an upload ended: stored, the bytes are no longer those offered (the file changed), stopped, or a trouble of the store. */
export type UploadEnd = 'stored' | 'changed' | 'stopped' | StoreTrouble;

/** One request's turn: taken before it goes out, given back once it came back. */
export type TakeSlot = () => Promise<() => void>;

/** How an upload runs: `signal` stops it before its next request; `trusted` bytes are known to be those offered (kept since, or a file whose time and size did not change). */
export interface UploadOptions {
  readonly signal: AbortSignal;
  readonly trusted: boolean;
}

/** Bytes as the body of one request (`requestUrl` takes an `ArrayBuffer`): the buffer itself where they are all of it, else a copy of the range. */
function bodyOf(bytes: Uint8Array<ArrayBuffer>, from = 0, to = bytes.length): ArrayBuffer {
  const whole = bytes.byteOffset === 0 && from === 0 && to === bytes.length && bytes.buffer.byteLength === bytes.length;
  return whole ? bytes.buffer : bytes.buffer.slice(bytes.byteOffset + from, bytes.byteOffset + to);
}

/**
 * Uploads one asset as the store asked: a whole object in one body, or in parts (16 MiB) of which only
 * those the store does not hold yet go up, as many at once as `slot` lets out. Bytes not `trusted` are
 * checked against the hash they were offered with before anything goes; `progress` hears the share
 * stored so far. Once `signal` stops it, no further request goes out.
 */
export async function uploadAsset(job: UploadJob, bytes: Uint8Array<ArrayBuffer>, client: UploadClient, slot: TakeSlot, progress: (share: number) => void, options: UploadOptions): Promise<UploadEnd> {
  if (!options.trusted && (await sha256Hex(bytes)) !== job.hash) return 'changed';
  if (job.upload === 'multipart') return uploadParts(job, bytes, client, slot, progress, options.signal);
  const release = await slot();
  try {
    if (options.signal.aborted) return 'stopped';
    const put = await client.putWhole(job.id, bodyOf(bytes), job.mime, job.hash);
    return put.ok ? 'stored' : put.trouble;
  } finally {
    release();
  }
}

/** The SHA-256 of each part, one after another, so no more than one part's copy is hashed at a time. */
async function partHashes(bytes: Uint8Array<ArrayBuffer>, sizes: readonly number[], partBytes: number, signal: AbortSignal): Promise<string[] | null> {
  const hashes: string[] = [];
  for (const [index, size] of sizes.entries()) {
    if (signal.aborted) return null;
    hashes.push(await sha256Hex(bytes.subarray(index * partBytes, index * partBytes + size)));
  }
  return hashes;
}

async function uploadParts(job: UploadJob, bytes: Uint8Array<ArrayBuffer>, client: UploadClient, slot: TakeSlot, progress: (share: number) => void, signal: AbortSignal): Promise<UploadEnd> {
  const sizes = partSizes(bytes.length, job.partBytes);
  const hashes = await partHashes(bytes, sizes, job.partBytes, signal);
  if (hashes === null) return 'stopped';
  const started = await client.startParts(job.id, bytes.length, job.mime, sizes.map((size, index) => ({ sha256: hashes[index] ?? '', size })));
  if (!started.ok) return started.trouble;
  let stored = sizes.reduce((sum, size, index) => (started.value.arrived.has(index + 1) ? sum + size : sum), 0);
  progress(stored / bytes.length);
  // The first trouble of any part: the parts still waiting do not go.
  const failure: { trouble: UploadEnd | null } = { trouble: null };
  const send = async (index: number): Promise<void> => {
    const release = await slot();
    try {
      if (signal.aborted) failure.trouble ??= 'stopped';
      if (failure.trouble !== null) return;
      const from = index * job.partBytes;
      const size = sizes[index] ?? 0;
      const put = await client.putPart(job.id, index + 1, bodyOf(bytes, from, from + size), hashes[index] ?? '');
      if (!put.ok) {
        failure.trouble ??= put.trouble;
        return;
      }
      stored += size;
      progress(stored / bytes.length);
    } finally {
      release();
    }
  };
  await Promise.all(sizes.map((_, index) => (started.value.arrived.has(index + 1) ? Promise.resolve() : send(index))));
  if (failure.trouble !== null) return failure.trouble;
  if (signal.aborted) return 'stopped';
  const done = await client.complete(job.id, job.hash);
  return done.ok ? 'stored' : done.trouble;
}
