import { visibleTiles } from './levelOfDetail';
import type { TileSource } from './tileRequests';
import { tileTextureKey, type TileTextureCache } from './tileTextureCache';

/** Maps left whose overview tiles stay on the GPU, so switching back to one shows it at once. */
export const RESIDENT_MAPS = 3;

/** The pyramids of the maps a view left most recently, whose overview tiles stay pinned in its texture cache. */
export class ResidentOverviews {
  /** Most recently left first. */
  private sources: TileSource[] = [];

  constructor(private readonly cache: TileTextureCache) {}

  /** Keeps a map's overview as the most recent; the oldest beyond `RESIDENT_MAPS` leave the cache. */
  keep(source: TileSource): void {
    this.sources = [source, ...this.sources.filter(other => other.key !== source.key)];
    for (const dropped of this.sources.splice(RESIDENT_MAPS)) this.cache.deletePyramid(dropped.key);
    // Pinned before the map's layer lets go of them, so the budget cannot take them in between.
    this.cache.pin(this, this.sources.flatMap(overviewKeys));
  }

  /** A map shown again holds its own tiles, so it gives up its slot. */
  release(key: string): void {
    this.sources = this.sources.filter(source => source.key !== key);
  }

  clear(): void {
    this.sources = [];
    this.cache.unpin(this);
  }
}

/** The texture keys of a pyramid's overview tiles. */
function overviewKeys({ key, pyramid }: TileSource): string[] {
  const whole = { x: 0, y: 0, width: pyramid.width, height: pyramid.height };
  return visibleTiles(pyramid, pyramid.overview, whole, 0).map(ref => tileTextureKey(key, ref));
}
