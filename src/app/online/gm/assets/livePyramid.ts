import { pyramidOf, type Pyramid } from '../../../pixi/mosaicCanvas/pyramid';
import type { StoredLevel } from '../../../pixi/mosaicCanvas/tesseraBlobs';
import { TesseraLevelError } from '../../../pixi/mosaicCanvas/tesseraErrors';
import type { Timers } from '../companionTimers.ts';
import { pyramidRank, type MapStanding } from './assetUses.ts';
import { levelOrder, manifestOf, planLevel, pyramidBound, tileCount, type MapFocus, type TileBatch } from './pyramidPlan.ts';
import { retryMs } from './uploadPace.ts';

/** How often in a row a wait for a level may be lost with a stopped worker before the pyramid is given up. */
export const MAX_LEVEL_TRIES = 6;

export interface LivePyramidPorts {
  /** A level once all its tiles are stored; rejects once `signal` aborts or the worker stops, with `TesseraLevelError` for a level it cannot answer for. */
  level(hash: string, level: number, signal: AbortSignal): Promise<StoredLevel>;
  /** Asks for the pyramid to be built, in its turn; `drop` takes the wish back. */
  want(pyramid: LivePyramid): void;
  drop(pyramid: LivePyramid): void;
  /** Where players look on the map. */
  focus(): MapFocus;
  /** A level of it can go up now. */
  ready(pyramid: LivePyramid): void;
  /** No pyramid pages can draw comes of it. */
  failed(pyramid: LivePyramid): void;
  readonly timers: Timers;
}

/**
 * A map's pyramid on its way into the store while this device may still be cutting it. Its shape
 * (levels, tile count, the most it can take) follows from the image's size, so it is offered before
 * a tile exists; each level is planned once the cache holds all its tiles (the build stores the
 * coarsest first), in the order a page expects them: the overview, then the others from coarse to
 * fine. The first level stored tells the pyramid's true size (an EXIF turn swaps the sides): another
 * shape, or one built at a reduced decoded scale, is no pyramid pages can draw, and it fails.
 */
export class LivePyramid {
  readonly levels: number;
  readonly count: number;
  /** What the store is asked to keep of it at most (`pyramidBound`). */
  readonly bytes: number;
  /** Who looks at its map; its rank and its turn to be built follow it. */
  standing: MapStanding = 'staged';
  private readonly order: number[];
  private readonly planned: TileBatch[] = [];
  private plannedLevels = 0;
  private overviewBatches = 0;
  private pyramid: Pyramid | null = null;
  private manifestBytes: Uint8Array<ArrayBuffer> | null = null;
  /** Its manifest's and every planned tile's bytes. */
  private plannedBytes = 0;
  private waiting: AbortController | null = null;
  private waitFailures = 0;
  private active = false;
  private dead = false;

  constructor(readonly hash: string, readonly path: string, private readonly shape: Pyramid, private readonly ports: LivePyramidPorts) {
    this.levels = shape.levels.length;
    this.count = tileCount(shape);
    this.bytes = pyramidBound(shape);
    this.order = levelOrder(shape);
  }

  /** `manifest.json`, once the first level told the pyramid's true size. */
  get manifest(): Uint8Array<ArrayBuffer> | null {
    return this.manifestBytes;
  }

  /** What the store keeps of it, once every level is planned: the manifest and every tile's stored bytes. */
  get realBytes(): number | null {
    return this.plannedLevels === this.order.length ? this.plannedBytes : null;
  }

  /** Whether it failed: nothing of it goes up any more. */
  get failed(): boolean {
    return this.dead;
  }

  /** Has it built where needed and waits for its levels; again after `stop`. */
  start(): void {
    if (this.active || this.dead) return;
    this.active = true;
    if (this.plannedLevels < this.order.length) {
      this.ports.want(this);
      this.waitNext();
    }
  }

  /** Stops waiting for its levels and wanting its build (it is stored, or players hold it no more). */
  stop(): void {
    this.active = false;
    this.waiting?.abort();
    this.waiting = null;
    this.ports.drop(this);
  }

  /** Gives it up: no pyramid pages can draw comes of it. */
  fail(): void {
    if (this.dead) return;
    this.dead = true;
    this.stop();
    this.ports.failed(this);
  }

  batch(next: number): TileBatch | undefined {
    return this.planned[next];
  }

  /** Whether the batch `next` can go now (its level is stored), or every batch went. */
  readyAt(next: number): boolean {
    return next < this.planned.length || this.done(next);
  }

  /** Whether every batch before `next` is every batch of it. */
  done(next: number): boolean {
    return this.plannedLevels === this.order.length && next >= this.planned.length;
  }

  /** Its rank once the batches before `next` went: by its standing, and whether its overview went. */
  rankAt(next: number): number {
    return pyramidRank(this.standing, this.plannedLevels > 0 && next >= this.overviewBatches);
  }

  private waitNext(): void {
    const level = this.order[this.plannedLevels];
    if (level === undefined || !this.active || this.waiting !== null) return;
    const waiting = new AbortController();
    this.waiting = waiting;
    this.ports.level(this.hash, level, waiting.signal).then((stored) => {
      if (this.waiting !== waiting) return;
      this.waiting = null;
      this.waitFailures = 0;
      this.take(stored);
    }, (error: unknown) => {
      if (this.waiting !== waiting) return;
      this.waiting = null;
      // A level the cached pyramid does not have: no answer will ever come.
      if (error instanceof TesseraLevelError) return this.fail();
      // The worker stopped and forgot the wait: built and waited for again.
      if ((this.waitFailures += 1) >= MAX_LEVEL_TRIES) return this.fail();
      this.ports.timers.setTimer(() => {
        if (!this.active) return;
        this.ports.want(this);
        this.waitNext();
      }, retryMs(this.waitFailures));
    });
  }

  private take(stored: StoredLevel): void {
    if (this.pyramid === null) {
      const real = this.drawable(stored);
      if (real === null) return this.fail();
      this.pyramid = real;
      this.manifestBytes = manifestOf(real);
      this.plannedBytes = this.manifestBytes.length;
    }
    const level = this.pyramid.levels[stored.level];
    if (level === undefined || stored.tesserae.length !== level.cols * level.rows) return this.fail();
    const batches = planLevel(this.pyramid, stored.tesserae, this.ports.focus(), this.plannedLevels === 0 ? this.manifestBytes : null);
    this.planned.push(...batches);
    this.plannedBytes += stored.tesserae.reduce((sum, tile) => sum + tile.bytes, 0);
    if (this.plannedLevels === 0) this.overviewBatches = batches.length;
    this.plannedLevels += 1;
    if (this.plannedLevels === this.order.length) this.ports.drop(this);
    this.ports.ready(this);
    this.waitNext();
  }

  /** The pyramid the cache holds, where it is the one offered: full size, the same levels and tiles. */
  private drawable(stored: StoredLevel): Pyramid | null {
    if (stored.decodedScale !== 1) return null;
    try {
      const real = pyramidOf(stored.width, stored.height);
      return real.levels.length === this.levels && tileCount(real) === this.count && real.overview === this.shape.overview ? real : null;
    } catch {
      return null;
    }
  }
}
