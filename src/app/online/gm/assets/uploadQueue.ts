import type { AssetKind } from '../../protocol/index.ts';
import type { OfferAnswer, OfferRefusal, UploadWay } from './assetRoutes.ts';
import type { LivePyramid } from './livePyramid.ts';
import { retryMs } from './uploadPace.ts';

/**
 * Where an upload reads an asset's bytes: kept in memory (a text, a poster, a drawing), a vault file
 * read again then, or a map's tile pyramid in this device's cache, uploaded level by level as it is cut.
 */
export type AssetSource = { readonly bytes: Uint8Array<ArrayBuffer> } | { readonly path: string } | { readonly pyramid: LivePyramid };

/** Whether the store refused an entry for room it said it would make: it is offered again after a while. */
const roomAgain = (entry: QueueEntry): boolean => entry.state === 'refused' && entry.refusal === 'quota' && entry.quotaRetries > 0;

/** The pyramid an entry uploads, if it is one. */
export const entryPyramid = (entry: Pick<QueueEntry, 'source'>): LivePyramid | null => (entry.source !== null && 'pyramid' in entry.source ? entry.source.pyramid : null);

/** An asset's way into the store: offered next, offered, waiting to go up, going up, stored, refused by the store, or given up. */
export type EntryState = 'new' | 'offered' | 'queued' | 'uploading' | 'stored' | 'refused' | 'failed';

export interface QueueEntry {
  readonly id: string;
  readonly hash: string;
  /** What the store is asked to keep of it: a pyramid's bound, lowered to its true size once it is cut (never raised). */
  size: number;
  readonly mime: string;
  readonly kind: AssetKind;
  /** Its priority: the lower, the sooner (`ASSET_RANKS`). */
  rank: number;
  /** The floor map (vault path) a map sent as one image is of: it ranks by who looks at that floor. */
  readonly map?: string | undefined;
  /** When it was last asked for, by the queue's count: of one rank, the latest goes first. */
  stamp: number;
  /** Whether players were handed its id: only then is its progress told. */
  handed: boolean;
  /** Where its bytes are read for the upload; bytes larger than `KEPT_BYTES` are let go once it is stored. */
  source: AssetSource | null;
  state: EntryState;
  upload: { readonly upload: UploadWay; readonly partBytes: number } | null;
  /** A pyramid's next batch to send (`LivePyramid.batch`); 0 for every other asset. */
  next: number;
  /** Why the store refused it, while it is refused. */
  refusal: OfferRefusal | null;
  /** Failed tries in a row, which set the wait before the next. */
  failures: number;
  /** Uploads the store refused for what they carried. */
  rejected: number;
  /** Not tried again before this time. */
  retryAt: number;
  /** Refusals for want of room the store said would pass (it makes room on its own): offered again after a while. */
  quotaRetries: number;
  /** When the store last answered an offer of it that it holds or wants it: the store lets go of what is not offered for a day. */
  offeredAt: number;
}

/** Bytes held for an asset after it was stored, so it can go up again once the store was emptied: texts and small drawings. */
export const KEPT_BYTES = 1024 * 1024;

/** How long a stored asset may go unoffered before handing it to players again offers it first (the store lets go after 24 hours). */
export const REOFFER_AFTER_MS = 12 * 60 * 60 * 1000;

/** The most assets the queue remembers; stored ones not handed to players go first. */
export const MAX_ENTRIES = 4000;

/**
 * The assets of one table on their way into the store, in priority order: by rank (the map, then the
 * art of tokens players see, the video, handouts and texts, the other open scenes), and of one rank the
 * one asked for last first, so presenting another scene puts its assets ahead of the last one's.
 */
export class UploadQueue {
  private readonly entries = new Map<string, QueueEntry>();
  private count = 0;

  get(id: string): QueueEntry | undefined {
    return this.entries.get(id);
  }

  all(): IterableIterator<QueueEntry> {
    return this.entries.values();
  }

  /** Adds an asset, or asks for one known again: its rank rises where this use ranks higher, and it goes to the front of its rank. */
  note(entry: Omit<QueueEntry, 'stamp' | 'state' | 'upload' | 'next' | 'refusal' | 'failures' | 'rejected' | 'retryAt' | 'quotaRetries' | 'offeredAt'>): QueueEntry {
    const known = this.entries.get(entry.id);
    this.count += 1;
    if (known !== undefined) {
      known.rank = Math.min(known.rank, entry.rank);
      known.stamp = this.count;
      known.handed ||= entry.handed;
      // Given up only for want of its bytes (let go once stored, then the store was emptied): it goes up again.
      if (known.state === 'failed' && known.source === null) Object.assign(known, { state: 'new', failures: 0, rejected: 0, retryAt: 0 });
      known.source ??= entry.source;
      return known;
    }
    const added: QueueEntry = { ...entry, stamp: this.count, state: 'new', upload: null, next: 0, refusal: null, failures: 0, rejected: 0, retryAt: 0, quotaRetries: 0, offeredAt: 0 };
    this.entries.set(entry.id, added);
    this.trim();
    return added;
  }

  /** What waits to be offered now, a refusal for room that was to pass among it once its wait is over. */
  toOffer(now: number): QueueEntry[] {
    for (const entry of this.entries.values()) if (roomAgain(entry) && entry.retryAt <= now) entry.state = 'new';
    return [...this.entries.values()].filter((entry) => entry.state === 'new' && entry.retryAt <= now);
  }

  /** The asset to upload next of those `allow` lets go, or undefined while none may go now; a pyramid waits for its next level to be cut. */
  next(now: number, allow: (entry: QueueEntry) => boolean = () => true): QueueEntry | undefined {
    let best: QueueEntry | undefined;
    for (const entry of this.entries.values()) {
      if (entry.state !== 'queued' || entry.retryAt > now || !allow(entry) || entryPyramid(entry)?.readyAt(entry.next) === false) continue;
      if (best === undefined || entry.rank < best.rank || (entry.rank === best.rank && entry.stamp > best.stamp)) best = entry;
    }
    return best;
  }

  /**
   * Takes the store's answer for an offered asset: stored already, wanted (it waits to go up), or
   * refused, and why. One without an answer is offered again later (null). One refused for want of
   * room is offered again after a reconnect or a sign-in (`reoffer`): the store may have room by then.
   */
  answered(entry: QueueEntry, answer: OfferAnswer | undefined, now: number): 'have' | 'need' | OfferRefusal | null {
    if (entry.state !== 'offered') return null;
    if (answer === undefined) {
      this.failed(entry, now, 'new');
      return null;
    }
    if (answer.answer === 'have') {
      entry.offeredAt = now;
      return 'have';
    }
    if (answer.answer === 'need') {
      entry.offeredAt = now;
      entry.upload = { upload: answer.upload, partBytes: answer.partBytes };
      entry.state = 'queued';
      return 'need';
    }
    entry.state = 'refused';
    entry.refusal = answer.reason;
    return answer.reason;
  }

  /**
   * A stored asset handed to players again: offered first where it was last offered `REOFFER_AFTER_MS`
   * ago or longer, since the store may have let it go. Answers whether it is offered again.
   */
  stale(entry: QueueEntry, now: number): boolean {
    if (entry.state !== 'stored' || now - entry.offeredAt < REOFFER_AFTER_MS) return false;
    Object.assign(entry, { state: 'new', next: 0, failures: 0, rejected: 0, retryAt: 0 });
    return true;
  }

  /** Forgets an asset: asked for again, it starts afresh; a pyramid stops waiting for its levels. */
  forget(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    this.entries.delete(id);
    entryPyramid(entry)?.stop();
  }

  /** The asset is stored: its bytes are let go unless they are few; a pyramid stops waiting for its levels. */
  stored(entry: QueueEntry): void {
    entry.state = 'stored';
    entryPyramid(entry)?.stop();
    entry.failures = 0;
    if (entry.source !== null && 'bytes' in entry.source && entry.source.bytes.length > KEPT_BYTES) entry.source = null;
    entry.next = 0;
  }

  /** A try failed for a reason that may pass: it waits 1, 2, 4 … 60 seconds, in `state`. */
  failed(entry: QueueEntry, now: number, state: 'new' | 'queued'): void {
    entry.failures += 1;
    entry.retryAt = now + retryMs(entry.failures);
    entry.state = state;
  }

  /** Whether any asset is still on its way (offered, waiting or going up). */
  get busy(): boolean {
    return [...this.entries.values()].some((entry) => entry.state === 'new' || entry.state === 'offered' || entry.state === 'queued' || entry.state === 'uploading');
  }

  /**
   * Offers again what is on its way, what was refused for an account that may not store then, and
   * what was refused for room the store said it would make. An asset refused for its size or kind,
   * or for room for good, or given up, stays as it is.
   */
  reoffer(): void {
    for (const entry of this.entries.values()) {
      const waiting = entry.state === 'new' || entry.state === 'offered' || entry.state === 'queued';
      const restricted = entry.state === 'refused' && entry.refusal === 'restricted';
      if (!waiting && !restricted && !roomAgain(entry)) continue;
      if (entry.source === null) {
        entry.state = 'failed';
        continue;
      }
      entry.state = 'new';
      entry.refusal = null;
      entry.failures = 0;
      entry.retryAt = 0;
    }
  }

  private trim(): void {
    if (this.entries.size <= MAX_ENTRIES) return;
    const done = [...this.entries.values()].filter((entry) => entry.state === 'stored' || entry.state === 'failed' || entry.state === 'refused').sort((a, b) => Number(a.handed) - Number(b.handed) || a.stamp - b.stamp);
    for (const entry of done.slice(0, this.entries.size - MAX_ENTRIES)) this.entries.delete(entry.id);
  }
}
