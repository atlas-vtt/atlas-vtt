import type { DecodedLevels } from './decodedLevels';
import { tileKey, tileSourceRect, type Pyramid, type TileRef } from './pyramid';
import type { TileGraphics } from './tileGraphics';
import type { TileEvent } from './tileProtocol';
import type { StoredTile, TileStore } from './tileStore';

/**
 * Writes a map's pyramid into the tile cache in the background (decisions 6,
 * 7 and 10 of the tiled map images plan): every tile cut from its decoded
 * level and encoded as WebP, coarsest level first so a reopen soon has its
 * overview, in batches, yielding before each tile so requests for the open
 * map are answered first. Tiles already stored are skipped, so a build left by
 * a crash or a reload resumes. Each level is released once its tiles are
 * written.
 */

/** Tiles per write transaction. */
export const TILE_BATCH = 16;

/**
 * `complete`: every tile written and the pyramid marked complete, every level released.
 * `stopped`: asked to stop (another build needed the memory).
 * `lost`: the pyramid left the cache meanwhile (its storage was wiped; a pinned pyramid is never cleared or evicted).
 * `failed`: encoding or writing threw.
 */
export type BuildOutcome = 'complete' | 'stopped' | 'lost' | 'failed';

export interface BuildDeps {
  store: TileStore;
  graphics: TileGraphics;
  /** Resolves once pending requests had their turn. */
  yieldToRequests: () => Promise<void>;
  emit: (event: TileEvent) => void;
}

/** Every tile of the pyramid, coarsest level first, row by row. */
export function buildOrder(pyramid: Pyramid): TileRef[][] {
  const levels: TileRef[][] = [];
  for (let level = pyramid.levels.length - 1; level >= 0; level--) {
    const { cols, rows } = pyramid.levels[level]!;
    const tiles: TileRef[] = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) tiles.push({ level, col, row });
    }
    levels.push(tiles);
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

  /** Ends the build before its next tile; what was written stays and a later build resumes from it. */
  stop(): void {
    this.stopRequested = true;
  }

  async run(): Promise<BuildOutcome> {
    const { store } = this.deps;
    store.pin(this.hash);
    try {
      await store.beginPyramid({ hash: this.hash, width: this.pyramid.width, height: this.pyramid.height, decodedScale: 1 });
      const existing = await store.existingTiles(this.hash);
      const order = buildOrder(this.pyramid);
      this.total = order.reduce((sum, tiles) => sum + tiles.length, 0);
      this.done = order.reduce((sum, tiles) => sum + tiles.filter((tile) => existing.has(tileKey(tile))).length, 0);
      for (const tiles of order) {
        const outcome = await this.writeLevel(tiles.filter((tile) => !existing.has(tileKey(tile))));
        if (outcome) return outcome;
        this.levels.release(tiles[0]!.level);
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

  /** Writes one level's missing tiles; answers how the build ended, or null to go on. */
  private async writeLevel(tiles: readonly TileRef[]): Promise<BuildOutcome | null> {
    let batch: StoredTile[] = [];
    for (const ref of tiles) {
      await this.deps.yieldToRequests();
      if (this.stopRequested) return 'stopped';
      const bytes = await this.levels.use(ref.level, (bitmap) => this.deps.graphics.encodeTile(bitmap, tileSourceRect(this.pyramid, ref)));
      if (!bytes) return 'stopped';
      batch.push({ ref, bytes });
      if (batch.length >= TILE_BATCH) {
        if (!(await this.write(batch))) return 'lost';
        batch = [];
      }
    }
    return (await this.write(batch)) ? null : 'lost';
  }

  private async write(batch: StoredTile[]): Promise<boolean> {
    if (batch.length === 0) return true;
    if (!(await this.deps.store.writeTiles(this.hash, batch))) return false;
    this.done += batch.length;
    this.deps.emit({ type: 'progress', hash: this.hash, done: this.done, total: this.total });
    return true;
  }
}
