import type { DecodedLevels } from './decodedLevels';
import { tesseraKey, tesseraSourceRect, type Pyramid, type TesseraRef } from './pyramid';
import type { TesseraGraphics } from './tesseraGraphics';
import type { TesseraEvent } from './tesseraProtocol';
import type { StoredTessera, TesseraStore } from './tesseraStore';

/**
 * Writes a map's pyramid into the tessera cache in the background (decisions 6,
 * 7 and 10 of the tiled map images plan): every tessera cut from its decoded
 * level and encoded as WebP, coarsest level first so a reopen soon has its
 * overview, in batches, yielding before each tessera so requests for the open
 * map are answered first. Tesserae already stored are skipped, so a build left by
 * a crash or a reload resumes. Each level is released once its tesserae are
 * written.
 */

/** Tesserae per write transaction. */
export const TESSERA_BATCH = 16;

/**
 * `complete`: every tessera written and the pyramid marked complete, every level released.
 * `stopped`: asked to stop (another build needed the memory).
 * `lost`: the pyramid left the cache meanwhile (its storage was wiped; a pinned pyramid is never cleared or evicted).
 * `failed`: encoding or writing threw.
 */
export type BuildOutcome = 'complete' | 'stopped' | 'lost' | 'failed';

export interface BuildDeps {
  store: TesseraStore;
  graphics: TesseraGraphics;
  /** Resolves once pending requests had their turn. */
  yieldToRequests: () => Promise<void>;
  emit: (event: TesseraEvent) => void;
}

/** Every tessera of the pyramid, coarsest level first, row by row. */
export function buildOrder(pyramid: Pyramid): TesseraRef[][] {
  const levels: TesseraRef[][] = [];
  for (let level = pyramid.levels.length - 1; level >= 0; level--) {
    const { cols, rows } = pyramid.levels[level]!;
    const tesserae: TesseraRef[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) tesserae.push({ level, col, row });
    }
    levels.push(tesserae);
  }
  return levels;
}

export class PyramidBuild {
  private stopRequested = false;
  private done = 0;
  private total = 0;

  constructor(
    private readonly hash: string,
    private readonly pyramid: Pyramid,
    private readonly levels: DecodedLevels,
    private readonly deps: BuildDeps,
  ) {}

  /** Ends the build before its next tessera; what was written stays and a later build resumes from it. */
  stop(): void {
    this.stopRequested = true;
  }

  async run(): Promise<BuildOutcome> {
    const { store } = this.deps;
    store.pin(this.hash);
    try {
      await store.beginPyramid({ hash: this.hash, width: this.pyramid.width, height: this.pyramid.height, decodedScale: 1 });
      const existing = await store.existingTesserae(this.hash);
      const order = buildOrder(this.pyramid);
      this.total = order.reduce((sum, tesserae) => sum + tesserae.length, 0);
      this.done = order.reduce((sum, tesserae) => sum + tesserae.filter((tessera) => existing.has(tesseraKey(tessera))).length, 0);
      for (const tesserae of order) {
        const outcome = await this.writeLevel(tesserae.filter((tessera) => !existing.has(tesseraKey(tessera))));
        if (outcome) return outcome;
        this.levels.release(tesserae[0]!.level);
      }
      if (!(await store.markComplete(this.hash))) return 'lost';
      this.deps.emit({ type: 'complete', hash: this.hash });
      return 'complete';
    } catch (error) {
      this.deps.emit({ type: 'build-failed', hash: this.hash, message: error instanceof Error ? error.message : String(error) });
      return 'failed';
    } finally {
      store.unpin(this.hash);
    }
  }

  /** Writes one level's missing tesserae; answers how the build ended, or null to go on. */
  private async writeLevel(tesserae: readonly TesseraRef[]): Promise<BuildOutcome | null> {
    let batch: StoredTessera[] = [];
    for (const ref of tesserae) {
      await this.deps.yieldToRequests();
      if (this.stopRequested) return 'stopped';
      const bytes = await this.levels.use(ref.level, (bitmap) => this.deps.graphics.encodeTessera(bitmap, tesseraSourceRect(this.pyramid, ref)));
      if (!bytes) return 'stopped';
      batch.push({ ref, bytes });
      if (batch.length >= TESSERA_BATCH) {
        if (!(await this.write(batch))) return 'lost';
        batch = [];
      }
    }
    return (await this.write(batch)) ? null : 'lost';
  }

  private async write(batch: StoredTessera[]): Promise<boolean> {
    if (batch.length === 0) return true;
    if (!(await this.deps.store.writeTesserae(this.hash, batch))) return false;
    this.done += batch.length;
    this.deps.emit({ type: 'progress', hash: this.hash, done: this.done, total: this.total });
    return true;
  }
}
