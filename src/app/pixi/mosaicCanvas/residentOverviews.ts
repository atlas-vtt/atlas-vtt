import { visibleTesserae } from './levelOfDetail';
import type { TesseraSource } from './tesseraRequests';
import { tesseraTextureKey, type TesseraTextureCache } from './tesseraTextureCache';

/** Maps left whose overview tesserae stay on the GPU, so switching back to one shows it at once. */
export const RESIDENT_MAPS = 3;

/** The pyramids of the maps a view left most recently, whose overview tesserae stay pinned in its texture cache. */
export class ResidentOverviews {
  /** Most recently left first. */
  private sources: TesseraSource[] = [];

  constructor(private readonly cache: TesseraTextureCache) {}

  /** Keeps a map's overview as the most recent; the oldest beyond `RESIDENT_MAPS` leave the cache. */
  keep(source: TesseraSource): void {
    this.sources = [source, ...this.sources.filter(other => other.key !== source.key)];
    for (const dropped of this.sources.splice(RESIDENT_MAPS)) this.cache.deletePyramid(dropped.key);
    // Pinned before the map's layer lets go of them, so the budget cannot take them in between.
    this.cache.pin(this, this.sources.flatMap(overviewKeys));
  }

  /** A map shown again holds its own tesserae, so it gives up its slot. */
  release(key: string): void {
    this.sources = this.sources.filter(source => source.key !== key);
  }

  clear(): void {
    this.sources = [];
    this.cache.unpin(this);
  }
}

/** The texture keys of a pyramid's overview tesserae. */
function overviewKeys({ key, pyramid }: TesseraSource): string[] {
  const whole = { x: 0, y: 0, width: pyramid.width, height: pyramid.height };
  return visibleTesserae(pyramid, pyramid.overview, whole, 0).map(ref => tesseraTextureKey(key, ref));
}
