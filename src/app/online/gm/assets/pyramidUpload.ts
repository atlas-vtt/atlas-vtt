import type { TesseraRef } from '../../../pixi/mosaicCanvas/pyramid';
import type { StoreTrouble } from './storeClient.ts';
import type { AssetStoreClient } from './storeClient.ts';
import type { TakeSlot } from './assetUpload.ts';
import { multipartBody, type FormPart } from './multipartBody.ts';
import type { TileBatch } from './pyramidPlan.ts';

/** Where a pyramid's stored tiles are read: this device's tile cache, as they are, never decoded. */
export type TileBlobs = (hash: string, tiles: readonly TesseraRef[]) => Promise<(ArrayBuffer | null)[]>;

/** A pyramid's batches as far as they are planned: a level's once the cache holds all its tiles (`LivePyramid`). */
export interface PyramidBatches {
  readonly manifest: Uint8Array<ArrayBuffer> | null;
  /** Whether nothing of it goes up any more. */
  readonly failed: boolean;
  batch(next: number): TileBatch | undefined;
  readyAt(next: number): boolean;
  done(next: number): boolean;
}

/** One pyramid on its way up: its id, its key in the cache (the image's hash), its batches, and its next batch. */
export interface PyramidJob {
  readonly id: string;
  readonly hash: string;
  readonly batches: PyramidBatches;
  readonly next: number;
}

/**
 * How a run ended: stored, stopped before a level the cache does not hold whole yet (`waiting`),
 * the cache no longer holds a tile (`changed`), or a trouble of the store; `next` is the batch to send next.
 */
export interface PyramidRun {
  readonly end: 'stored' | 'waiting' | 'changed' | 'stopped' | StoreTrouble;
  readonly next: number;
}

/** A tile's part in a batch: `<level>/<col>_<row>`, as the store names it. */
const partName = (tile: TesseraRef): string => `${tile.level}/${tile.col}_${tile.row}`;

/**
 * Uploads a pyramid's batches from `job.next` on, one after another (a page takes the tiles stored to be
 * the first of the plan's order): the manifest with the first, then the tiles read from the cache. It
 * stops before a level that is not stored whole yet, and once `signal` stops it before the next batch.
 * `progress` hears the share of pieces the store holds (the manifest and the tiles), `sent` each batch
 * that went (its rank may change with it: the overview's last).
 */
export async function uploadPyramid(job: PyramidJob, deps: { client: Pick<AssetStoreClient, 'putTiles'>; blobs: TileBlobs; slot: TakeSlot; boundary: () => string; progress: (share: number) => void; sent: (next: number) => void; signal: AbortSignal }): Promise<PyramidRun> {
  const { batches } = job;
  for (let next = job.next; !batches.done(next); next += 1) {
    if (batches.failed) return { end: 'stopped', next };
    if (!batches.readyAt(next)) return { end: 'waiting', next };
    const batch = batches.batch(next);
    if (batch === undefined) return { end: 'waiting', next };
    // The turn is taken first, so the map keeps its place among what waits while its tiles are read.
    const release = await deps.slot();
    let put: Awaited<ReturnType<AssetStoreClient['putTiles']>>;
    try {
      if (deps.signal.aborted || batches.failed) return { end: 'stopped', next };
      const blobs = await deps.blobs(job.hash, batch.tiles);
      if (blobs.length !== batch.tiles.length || blobs.some((blob) => blob === null)) return { end: 'changed', next };
      const parts: FormPart[] = batch.tiles.map((tile, index) => ({ name: partName(tile), bytes: new Uint8Array(blobs[index] ?? new ArrayBuffer(0)), type: 'image/webp' }));
      if (batch.manifest && batches.manifest !== null) parts.unshift({ name: 'manifest.json', bytes: batches.manifest, type: 'application/json' });
      const { body, contentType } = multipartBody(parts, deps.boundary());
      if (deps.signal.aborted) return { end: 'stopped', next };
      put = await deps.client.putTiles(job.id, body, contentType);
    } finally {
      release();
    }
    if (!put.ok) return { end: put.trouble, next };
    if (put.value.stored) return { end: 'stored', next: next + 1 };
    deps.sent(next + 1);
    deps.progress(put.value.of > 0 ? Math.min(0.99, put.value.pieces / put.value.of) : 0);
  }
  // Every batch went and the store still lacks pieces: sent again from the start, which the store takes once.
  return { end: 'rejected', next: 0 };
}
