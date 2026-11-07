import type { LiveSegments } from '../sound/liveSegments.ts';
import type { TakeSlot } from './assetUpload.ts';
import { multipartBody } from './multipartBody.ts';
import type { AssetStoreClient, StoreTrouble } from './storeClient.ts';

/** A sound in segments on its way up: its id, its segments, and the next segment to send. */
export interface SegmentsJob {
  readonly id: string;
  readonly segments: LiveSegments;
  readonly next: number;
}

/** How a run ended: stored, stopped before a segment not cut yet (`waiting`), or a trouble of the store; `next` is the segment to send next. */
export interface SegmentsRun {
  readonly end: 'stored' | 'waiting' | 'stopped' | StoreTrouble;
  readonly next: number;
}

export interface SegmentsDeps {
  readonly client: Pick<AssetStoreClient, 'putSegments'>;
  readonly slot: TakeSlot;
  boundary(): string;
  /** The share of pieces the store holds. */
  progress(share: number): void;
  /** How many segments, from the first, the store holds: what a page may fetch. */
  parts(count: number): void;
  /** A batch went: the next to send. */
  sent(next: number): void;
  /** Before the last batch: the store is told the sound's true size and pieces, so the last batch stores it. */
  settle(): Promise<void>;
  readonly signal: AbortSignal;
}

/**
 * Uploads a sound's segments in order from `job.next`, as many as are cut (the manifest with the first, so a
 * page can read what follows), and stops before one not cut yet. Once the copy is whole, its true size and count
 * are settled with the store before the batch that ends it, which then stores it whole.
 */
export async function uploadSegments(job: SegmentsJob, deps: SegmentsDeps): Promise<SegmentsRun> {
  const { segments } = job;
  let settled = false;
  for (let next = job.next; ; ) {
    if (segments.failed || deps.signal.aborted) return { end: 'stopped', next };
    if (segments.doneAt(next)) return { end: 'rejected', next: 0 };
    if (!segments.readyAt(next)) return { end: 'waiting', next };
    const release = await deps.slot();
    let put: Awaited<ReturnType<AssetStoreClient['putSegments']>>;
    let after = next;
    try {
      if (deps.signal.aborted) return { end: 'stopped', next };
      const batch = await segments.batch(next);
      after = batch.next;
      if (segments.doneAt(after) && !settled) {
        await deps.settle();
        settled = true;
      }
      const { body, contentType } = multipartBody(batch.parts, deps.boundary());
      put = await deps.client.putSegments(job.id, body, contentType);
    } finally {
      release();
    }
    if (!put.ok) return { end: put.trouble, next };
    deps.parts(Math.max(0, put.value.pieces - 1));
    if (put.value.stored) return { end: 'stored', next: after };
    deps.sent(after);
    deps.progress(put.value.of > 0 ? Math.min(0.99, put.value.pieces / put.value.of) : 0);
    next = after;
  }
}
