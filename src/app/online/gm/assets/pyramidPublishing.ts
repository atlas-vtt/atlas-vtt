import type { Pyramid } from '../../../pixi/mosaicCanvas/pyramid';
import type { StoredLevel } from '../../../pixi/mosaicCanvas/tesseraBlobs';
import type { Timers } from '../companionTimers.ts';
import { imageMimeType } from '../assetServe.ts';
import { ASSET_RANKS, pyramidRank, type FloorMaps, type MapStanding } from './assetUses.ts';
import type { AssetRefs } from './assetRefs.ts';
import { LivePyramid } from './livePyramid.ts';
import { PyramidBuilds, type BuiltPyramid } from './pyramidBuilds.ts';
import { MAP_CENTRE, type MapFocus } from './pyramidPlan.ts';
import type { TileBlobs } from './pyramidUpload.ts';
import { entryPyramid, type QueueEntry } from './uploadQueue.ts';

/** This device's map pyramids as the publisher reads them. */
export interface PyramidSource {
  /** Builds the pyramid of the map image at a path where the cache lacks it, resolving once the build ended; null where none can be built. */
  build(path: string): Promise<BuiltPyramid | null>;
  /** A level once all its tiles are stored; rejects once `signal` aborts or the worker stops. */
  level(hash: string, level: number, signal: AbortSignal): Promise<StoredLevel>;
  readonly blobs: TileBlobs;
  /** Where players look on the shared map now, as shares of it; null: its centre. */
  focus?(): MapFocus | null;
}

export interface PyramidPublishingPorts {
  readonly source: PyramidSource;
  readonly timers: Timers;
  /** The publisher's queue as it is now. */
  entries(): Iterable<QueueEntry>;
  /** A level of a pyramid can go up, or ranks changed: the queue looks again. */
  ready(): void;
  /** Offers maps nobody is handed yet (`AssetRefs.stage`). */
  stage: AssetRefs['stage'];
  /** No pyramid pages can draw comes of this entry: it is forgotten, and what names its map hands it again as an image. */
  withdraw(entry: QueueEntry): void;
  /** Offers the entry's pyramid again at its size now, so the store keeps no more room for it. */
  settle(entry: QueueEntry): void;
  /** Offers what waits to be offered, soon. */
  offerSoon(): void;
}

/**
 * The map pyramids of one table's publisher: each made when a map is handed or offered (`make`), built
 * in the order of who looks at it (`PyramidBuilds`), ranked by its floor's standing (`floorMaps`: the
 * presented floor, floors players stand on, the shared scene's other floors; maps of no floor of it are
 * staged) and by whether its overview went, and given up for good where it failed.
 */
export class PyramidPublishing {
  private readonly builds: PyramidBuilds;
  /** Images whose pyramid failed: their maps go as images. */
  private readonly undrawable = new Set<string>();
  private standings = new Map<string, MapStanding>();
  /** The maps of floors nobody stands on that were offered once. */
  private readonly offered = new Set<string>();

  constructor(private readonly ports: PyramidPublishingPorts) {
    this.builds = new PyramidBuilds({ build: (path) => ports.source.build(path), timers: ports.timers });
  }

  /** Whether the image's pyramid may be tried: none of it failed. */
  drawable(hash: string): boolean {
    return !this.undrawable.has(hash);
  }

  /** A pyramid of the image at `path`, of the shape its header gives; nothing runs before it is started. */
  make(hash: string, path: string, shape: Pyramid): LivePyramid {
    return new LivePyramid(hash, path, shape, {
      level: (of, level, signal) => this.ports.source.level(of, level, signal),
      want: (pyramid) => this.builds.want(pyramid),
      drop: (pyramid) => this.builds.drop(pyramid),
      focus: () => this.ports.source.focus?.() ?? MAP_CENTRE,
      ready: (pyramid) => {
        const entry = this.entryOf(pyramid);
        if (entry !== undefined && pyramid.realBytes !== null) this.sized(entry, pyramid.realBytes);
        this.ports.ready();
      },
      failed: (pyramid) => {
        this.undrawable.add(pyramid.hash);
        const entry = this.entryOf(pyramid);
        if (entry !== undefined) this.ports.withdraw(entry);
      },
      timers: this.ports.timers,
    });
  }

  /**
   * A map noted in the queue (new, or asked for again): its standing (its floor's, else presented where
   * players were handed it, staged where not) and rank; a pyramid is started unless the store holds it,
   * so its levels are being cut while it is offered.
   */
  noted(entry: QueueEntry): void {
    const pyramid = entryPyramid(entry);
    const path = pyramid?.path ?? entry.map;
    if (path === undefined) return;
    const standing = this.standings.get(path) ?? (entry.handed ? 'presented' : 'staged');
    if (pyramid === null) return void (entry.rank = pyramidRank(standing, false));
    pyramid.standing = standing;
    this.rank(entry);
    if (entry.state === 'new' || entry.state === 'offered' || entry.state === 'queued' || entry.state === 'uploading') pyramid.start();
    this.builds.pump();
  }

  /** A pyramid's rank as its standing and progress say. */
  rank(entry: QueueEntry): void {
    const pyramid = entryPyramid(entry);
    if (pyramid !== null) entry.rank = pyramid.rankAt(entry.next);
  }

  /**
   * Every level of a pyramid is cut: the store is asked to keep its true size, never more, at once where
   * it holds room for it already, and one refused for its bound because the store holds part of it at
   * that size is offered again.
   */
  private sized(entry: QueueEntry, bytes: number): void {
    if (bytes >= entry.size) return;
    entry.size = bytes;
    if (entry.state === 'queued' || entry.state === 'uploading') this.ports.settle(entry);
    if (entry.state === 'refused' && entry.refusal === 'changed') {
      Object.assign(entry, { state: 'new', refusal: null });
      this.ports.offerSoon();
    }
  }

  private entryOf(pyramid: LivePyramid): QueueEntry | undefined {
    return [...this.ports.entries()].find((candidate) => entryPyramid(candidate) === pyramid);
  }

  /**
   * Who looks at which floor's map now: the pyramids of the shared scene's maps are ranked again (a
   * map no longer on any floor is staged), builds start in that order, and the maps of floors nobody
   * stands on are offered once, after everything players look at.
   */
  floorMaps(maps: FloorMaps): void {
    const next = new Map<string, MapStanding>();
    const put = (path: string, standing: MapStanding): void => void (next.has(path) || next.set(path, standing));
    if (maps.presented !== null) put(maps.presented, 'presented');
    for (const path of maps.watched) put(path, 'watched');
    for (const path of maps.rest) put(path, 'rest');
    const before = this.standings;
    this.standings = next;
    for (const entry of this.ports.entries()) {
      const pyramid = entryPyramid(entry);
      const path = pyramid?.path ?? entry.map;
      if (path === undefined || !(before.has(path) || next.has(path))) continue;
      const standing = next.get(path) ?? 'staged';
      if (pyramid === null) entry.rank = pyramidRank(standing, false);
      else {
        pyramid.standing = standing;
        this.rank(entry);
      }
    }
    this.builds.pump();
    this.ports.ready();
    const fresh = [...next].filter(([path, standing]) => standing === 'rest' && !this.offered.has(path)).map(([path]) => path);
    for (const path of fresh) this.offered.add(path);
    const rest = fresh.flatMap((path) => {
      const mime = imageMimeType(path);
      return mime === null ? [] : [{ path, mime, use: { kind: 'image' as const, rank: ASSET_RANKS.restMap }, map: true }];
    });
    if (rest.length > 0) void this.ports.stage(rest);
  }

  stop(): void {
    this.builds.stop();
    for (const entry of this.ports.entries()) entryPyramid(entry)?.stop();
  }
}
