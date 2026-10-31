import { ASSET_CAPS, type AssetRef } from '../../protocol/index.ts';
import { t, type MessageKey } from '../../../i18n';
import { AssetIds } from './assetIds.ts';
import { FileHashes, type FileStat } from './fileHashes.ts';
import { AssetProgress } from './assetProgress.ts';
import { AssetRefs, type Registration } from './assetRefs.ts';
import type { JobEnd } from './assetJob.ts';
import type { OfferedAsset, OfferRefusal } from './assetRoutes.ts';
import { answerOffer } from './offerRound.ts';
import { roomRetryMs } from './uploadPace.ts';
import type { AssetPublisherPorts } from './publisherPorts.ts';
import { PyramidPublishing } from './pyramidPublishing.ts';
import { entryPyramid, UploadQueue, type QueueEntry } from './uploadQueue.ts';
import { UploadRunner } from './uploadRunner.ts';

/** How long new assets gather before they are offered, so a scene's go in one request. */
export const OFFER_DELAY_MS = 200;
/** The most assets one offer names. */
export const MAX_OFFER = 2000;

export type { FileStat };
export type { AssetPublisherPorts };

/** Why the queue stands still: the account may not store, is signed out, or signs out now. */
type Halt = 'restricted' | 'forbidden' | 'signed-out';

const REFUSAL_TEXTS: Partial<Record<OfferRefusal | 'failed', MessageKey>> = { restricted: 'online.assetsRestricted', 'too-large': 'online.assetsMapTooLarge', failed: 'online.assetsFailed' };

/** An asset as an offer names it: a pyramid with its levels and tile count. */
function offeredAsset(entry: QueueEntry): OfferedAsset {
  const pyramid = entryPyramid(entry);
  return { id: entry.id, kind: entry.kind, size: entry.size, ...(pyramid !== null && { tiles: { levels: pyramid.levels, count: pyramid.count } }) };
}

/**
 * One table's way of keeping assets in the store for players (ASD-40 to ASD-44). Every share hands
 * players references through `storing`: with the asset's id where it can be stored, after which the
 * asset is offered (new ones gather for `OFFER_DELAY_MS`, so a scene's go in one request), uploaded in
 * priority order (`UploadRunner`), retried after 1, 2, 4 … 60 seconds and resumed where it stopped.
 * An account that may not store stops the queue and tells the GM once; a map larger than the store
 * keeps is shown to no one and the GM is told once. Each player hears how far the assets they were sent
 * references of have come (`AssetProgress`, fed by `sent`).
 * Nothing goes over the table's socket but that and the references themselves.
 */
export class AssetPublisher {
  private readonly queue = new UploadQueue();
  private readonly progress: AssetProgress;
  private readonly runner: UploadRunner;
  private readonly hashes: FileHashes;
  private ids: AssetIds | null = null;
  private halted: Halt | null = null;
  private readonly told = new Set<string>();
  private offering = false;
  private offerTimer: number | undefined;
  private readonly retryTimers = new Set<number>();
  private stopped = false;
  /** Whether the store refused a pyramid for its kind (a relay without them): maps go as images from then on. */
  private noTiles = false;
  private readonly pyramids: PyramidPublishing | undefined;
  /** How players are handed references, and how the scenes open beside the presented one are offered. */
  readonly storing: AssetRefs;

  constructor(private readonly ports: AssetPublisherPorts) {
    this.progress = new AssetProgress(ports);
    this.pyramids = ports.pyramids === undefined ? undefined : new PyramidPublishing({
      source: ports.pyramids,
      timers: ports.timers,
      entries: () => this.queue.all(),
      ready: () => this.runner.pump(),
      stage: (assets) => this.storing.stage(assets),
      // Its pyramid was given up: forgotten, what handed it hands its map again as an image, and what the store reserved for it is released.
      withdraw: (entry) => {
        const reserved = entry.state === 'queued' || entry.state === 'uploading';
        this.queue.forget(entry.id);
        this.withdraw([entry]);
        if (reserved) void this.ports.client.remove?.(entry.id);
      },
      settle: (entry) => void this.ports.client.offer([offeredAsset(entry)]),
      offerSoon: () => this.offerSoon(),
    });
    this.hashes = new FileHashes((path) => ports.stat(path));
    this.runner = new UploadRunner({
      queue: this.queue,
      timers: ports.timers,
      client: ports.client,
      readFile: (path) => ports.readFile(path),
      blobs: ports.pyramids?.blobs,
      unchanged: (path, hash) => this.hashes.kept(path) === hash,
      connection: () => ports.connection(),
      mayUpload: () => this.halted === null,
      progress: (entry, share) => this.progress.set(entry.id, Math.min(share, 0.99)),
      ended: (entry, end) => this.ended(entry, end),
      tick: () => (this.queue.toOffer(ports.timers.now()).length > 0 ? void this.offer() : this.runner.pump()),
      settled: () => ports.settled?.(),
    });
    this.storing = new AssetRefs({
      hashes: this.hashes,
      readFile: (path) => ports.readFile(path),
      stat: (path) => ports.stat(path),
      pyramids: this.pyramids,
      register: (asset) => this.register(asset),
      release: (ref) => this.release(ref),
      tilesRefused: () => this.noTiles,
      floorMaps: (maps) => this.pyramids?.floorMaps(maps),
    });
  }

  /** The relay welcomed the table again: everything not stored is offered again (players hear their shares through `resend`). */
  welcome(): void {
    this.resume();
  }

  /** The GM signed in again: what waits is offered again. */
  signedIn(): void {
    this.resume();
  }

  /** A message went to players (`to`: one, or everyone connected): the ids it names are theirs to hear of. */
  sent(text: string, to: string): void {
    this.progress.sent(text, to);
  }

  playerLeft(player: string): void {
    this.progress.playerLeft(player);
  }

  /** The shares a player holds to that player who joined, or each player's to all. */
  resend(to?: string): void {
    this.progress.resend(to);
  }

  /** The account signs out: nothing more is offered or sent, and what goes up stops before its next request. */
  suspend(): void {
    this.halted = 'signed-out';
    this.runner.abort();
  }

  stop(): void {
    this.stopped = true;
    this.progress.stop();
    this.runner.stop();
    this.pyramids?.stop();
    if (this.offerTimer !== undefined) this.ports.timers.clearTimer(this.offerTimer);
    this.offerTimer = undefined;
    for (const timer of this.retryTimers) this.ports.timers.clearTimer(timer);
    this.retryTimers.clear();
  }

  /** Notes an asset and gives its id, or undefined where the store will not keep it: players are then not shown it. */
  private async register({ key, hash, size, mime, use, source, handed }: Registration): Promise<string | undefined> {
    if (this.stopped || size <= 0 || size > ASSET_CAPS[use.kind]) return undefined;
    // The round trip before uploads begin is the resting one they are measured against.
    this.runner.limit();
    const salt = await this.ports.salt.soon();
    if (salt === null || this.stopped) return undefined;
    if (this.ids === null || !this.ids.isOf(salt)) this.ids = new AssetIds(salt);
    const id = await this.ids.of(key);
    const known = this.queue.get(id);
    if (known?.state === 'refused' || (known?.state === 'failed' && known.source !== null)) return undefined;
    // While the store takes nothing, new assets, and any not stored once nothing goes up, are not shown.
    if (this.halted !== null && known?.state !== 'stored') return undefined;
    const entry = this.queue.note({ id, hash, size, mime, kind: use.kind, rank: use.rank, map: use.map, handed, source });
    // Handed again long after its last offer: the store may have let it go, so it is offered first.
    if (handed && this.queue.stale(entry, this.ports.timers.now())) this.progress.set(id, 0);
    this.pyramids?.noted(entry);
    if (entry.handed) this.progress.set(id, entry.state === 'stored' ? 1 : this.progress.share(id) ?? 0);
    if (entry.state === 'new') this.offerSoon();
    else this.runner.pump();
    return id;
  }

  /** A reference players hold no more (an explored memory a newer one replaced): it is not uploaded if it has not gone yet, and named no more. */
  private release(ref: AssetRef): void {
    const entry = this.queue.get(ref.id);
    if (entry !== undefined && entry.state !== 'stored' && entry.state !== 'uploading') this.queue.forget(ref.id);
    this.progress.delete(ref.id);
  }

  private resume(): void {
    this.halted = null;
    this.queue.reoffer();
    this.runner.resetLatency();
    this.offerSoon();
  }

  private offerSoon(): void {
    if (this.stopped || this.offerTimer !== undefined) return;
    this.offerTimer = this.ports.timers.setTimer(() => {
      this.offerTimer = undefined;
      void this.offer();
    }, OFFER_DELAY_MS);
  }

  private async offer(): Promise<void> {
    if (this.offering || this.halted !== null || this.stopped) return this.runner.pump();
    const batch = this.queue.toOffer(this.ports.timers.now()).slice(0, MAX_OFFER);
    if (batch.length === 0) return this.runner.pump();
    this.offering = true;
    for (const entry of batch) entry.state = 'offered';
    const offered = batch.map((entry) => ({ entry, size: entry.size }));
    const answer = await this.ports.client.offer(batch.map(offeredAsset));
    this.offering = false;
    if (this.stopped) return;
    const now = this.ports.timers.now();
    if (!answer.ok) {
      for (const entry of batch) if (entry.state === 'offered') this.queue.failed(entry, now, 'new');
      if (answer.trouble === 'signed-out' || answer.trouble === 'forbidden') this.halt(answer.trouble);
      return this.runner.pump();
    }
    this.withdraw(answerOffer(offered, answer.value, now, {
      queue: this.queue,
      stored: (entry) => this.stored(entry),
      restricted: () => this.halt('restricted'),
      mapTooLarge: () => this.tell('too-large'),
      noTiles: () => (this.noTiles = true),
      settle: (entry) => void this.ports.client.offer([offeredAsset(entry)]),
      remove: (id) => void this.ports.client.remove?.(id),
      retryLater: (entry) => this.retryLater(entry, now),
    }));
    if (this.queue.toOffer(now).length > 0) this.offerSoon();
    this.runner.pump();
  }

  /** Offers an asset again once the store has had a while to make room for it, at the next welcome or sign-in too. */
  private retryLater(entry: QueueEntry, now: number): void {
    entry.quotaRetries += 1;
    const wait = roomRetryMs(entry.quotaRetries);
    entry.retryAt = now + wait;
    const timer = this.ports.timers.setTimer(() => {
      this.retryTimers.delete(timer);
      this.offerSoon();
    }, wait);
    this.retryTimers.add(timer);
  }

  private stored(entry: QueueEntry): void {
    this.queue.stored(entry);
    if (entry.handed) this.progress.set(entry.id, 1);
  }

  /** The store takes nothing more: every asset players were handed that is not stored is taken from them. */
  private halt(reason: Halt): void {
    this.halted = reason;
    if (reason === 'signed-out') this.ports.signedOutByServer();
    if (reason === 'restricted') this.tell(reason);
    this.withdraw([...this.queue.all()].filter((entry) => entry.state !== 'stored'));
  }

  /** Tells the GM once per table. */
  private tell(reason: OfferRefusal | 'failed'): void {
    const key = REFUSAL_TEXTS[reason];
    if (key === undefined || this.told.has(reason)) return;
    this.told.add(reason);
    this.ports.notify(t(key));
  }

  /** Players were handed ids the store will not keep: their shares are named no more, and what handed them hands them again. */
  private withdraw(entries: readonly QueueEntry[]): void {
    const handed = entries.filter((entry) => entry.handed);
    for (const entry of handed) this.progress.delete(entry.id);
    if (handed.length > 0) this.ports.withdrawn?.();
  }

  private ended(entry: QueueEntry, end: JobEnd): void {
    // Forgotten while it went up (its pyramid failed): nothing more of it.
    if (this.queue.get(entry.id) !== entry) return;
    const now = this.ports.timers.now();
    if (end === 'stored') return this.stored(entry);
    if (end === 'waiting') {
      entry.state = 'queued';
      return this.pyramids?.rank(entry);
    }
    if (end === 'signed-out' || end === 'forbidden') {
      entry.state = 'queued';
      return this.halt(end);
    }
    // The upload's row is gone (the store let it go, or kept it too long): offered again, a pyramid from its manifest.
    if (end === 'missing') {
      entry.next = 0;
      this.pyramids?.rank(entry);
      return this.queue.failed(entry, now, 'new');
    }
    if (end === 'retry' || end === 'stopped') return this.queue.failed(entry, now, 'queued');
    // The bytes are not those offered (the file changed), or the store refused them twice.
    entry.rejected += 1;
    if (end === 'rejected' && entry.rejected < 2) return this.queue.failed(entry, now, 'queued');
    // A pyramid the cache lost is built again when what names it hands it again.
    if (end === 'changed' && entry.kind === 'tiles') this.queue.forget(entry.id);
    else entry.state = 'failed';
    this.tell('failed');
    this.withdraw([entry]);
  }
}
