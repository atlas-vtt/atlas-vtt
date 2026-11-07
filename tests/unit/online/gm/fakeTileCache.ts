import { pyramidOf } from '../../../../src/app/pixi/mosaicCanvas/pyramid';
import type { StoredLevel } from '../../../../src/app/pixi/mosaicCanvas/tesseraBlobs';
import type { TesseraRef } from '../../../../src/app/pixi/mosaicCanvas/pyramid';
import type { BuiltPyramid } from '../../../../src/app/online/gm/assets/pyramidBuilds.ts';
import { TesseraLevelError } from '../../../../src/app/pixi/mosaicCanvas/tesseraErrors';

/*
 * This device's tile cache as the GM's publisher sees it, for tests: map images by path, each with the
 * levels of its pyramid stored so far. Builds store every level at once, or, while `manual`, only as the
 * test stores them (`storeLevel`) and end when it says (`endBuild`); waits for a level are answered as
 * levels are stored, as the tile worker answers them.
 */

export interface FakePyramid {
  readonly hash: string;
  readonly width: number;
  readonly height: number;
  readonly decodedScale: number;
  readonly tileBytes: number;
  /** The levels the cache holds whole. */
  readonly stored: Set<number>;
}

interface Wait {
  readonly hash: string;
  readonly level: number;
  readonly resolve: (level: StoredLevel) => void;
  readonly reject: (error: Error) => void;
}

export class FakeTileCache {
  readonly maps = new Map<string, FakePyramid>();
  /** The paths builds were asked for, in order. */
  readonly builds: string[] = [];
  /** The tiles read for uploads, by batch, as `level/col/row`. */
  readonly tileReads: string[][] = [];
  /** While true, builds store nothing by themselves. */
  manual = false;
  private readonly running = new Map<string, ((built: BuiltPyramid | null) => void)[]>();
  private waits: Wait[] = [];

  /** A map image at `path` whose pyramid is stored whole unless `stored` names the levels held. */
  add(path: string, hash: string, width: number, height: number, options: { decodedScale?: number; tileBytes?: number; stored?: number[] } = {}): FakePyramid {
    const decodedScale = options.decodedScale ?? 1;
    const levels = pyramidOf(width, height, decodedScale).levels.map((level) => level.index);
    const map = { hash, width, height, decodedScale, tileBytes: options.tileBytes ?? 1000, stored: new Set(options.stored ?? levels) };
    this.maps.set(path, map);
    return map;
  }

  build(path: string): Promise<BuiltPyramid | null> {
    this.builds.push(path);
    const map = this.maps.get(path);
    if (map === undefined) return Promise.resolve(null);
    if (!this.manual) {
      this.storeAll(path);
      return Promise.resolve({ hash: map.hash, complete: true, stored: this.storedTiles(map) });
    }
    return new Promise((resolve) => this.running.set(path, [...(this.running.get(path) ?? []), resolve]));
  }

  /** Whether a build of `path` is under way. */
  building(path: string): boolean {
    return (this.running.get(path)?.length ?? 0) > 0;
  }

  storeLevel(path: string, level: number): void {
    const map = this.maps.get(path);
    if (map === undefined) return;
    map.stored.add(level);
    this.wake();
  }

  storeAll(path: string): void {
    const map = this.maps.get(path);
    if (map === undefined) return;
    for (const level of pyramidOf(map.width, map.height, map.decodedScale).levels) map.stored.add(level.index);
    this.wake();
  }

  /** Ends the builds of `path`: complete (every level stored), incomplete, or failed (no pyramid can be built). */
  endBuild(path: string, end: 'complete' | 'incomplete' | 'failed' = 'complete'): void {
    const map = this.maps.get(path);
    if (end === 'complete') this.storeAll(path);
    const waiting = this.running.get(path) ?? [];
    this.running.delete(path);
    for (const resolve of waiting) resolve(end === 'failed' || map === undefined ? null : { hash: map.hash, complete: end === 'complete', stored: this.storedTiles(map) });
  }

  level(hash: string, level: number, signal: AbortSignal): Promise<StoredLevel> {
    return new Promise((resolve, reject) => {
      const wait = { hash, level, resolve, reject };
      this.waits.push(wait);
      signal.addEventListener('abort', () => {
        this.waits = this.waits.filter((candidate) => candidate !== wait);
        reject(new DOMException('cancelled', 'AbortError'));
      }, { once: true });
      this.wake();
    });
  }

  /** The worker stops: every wait for a level is lost with it (a build is asked of the next worker, which resumes it). */
  crash(): void {
    const waits = this.waits;
    this.waits = [];
    for (const wait of waits) wait.reject(new Error('The worker stopped'));
  }

  /** Waits for levels not answered yet. */
  get waiting(): number {
    return this.waits.length;
  }

  blobs(hash: string, tiles: readonly TesseraRef[]): Promise<(ArrayBuffer | null)[]> {
    this.tileReads.push(tiles.map((tile) => `${tile.level}/${tile.col}/${tile.row}`));
    const map = [...this.maps.values()].find((candidate) => candidate.hash === hash);
    return Promise.resolve(tiles.map((tile) => (map !== undefined && map.stored.has(tile.level) ? new Uint8Array(map.tileBytes).fill(7).buffer : null)));
  }

  private storedTiles(map: FakePyramid): number {
    return pyramidOf(map.width, map.height, map.decodedScale).levels.filter((level) => map.stored.has(level.index)).reduce((sum, level) => sum + level.cols * level.rows, 0);
  }

  private wake(): void {
    for (const wait of [...this.waits]) {
      const map = [...this.maps.values()].find((candidate) => candidate.hash === wait.hash);
      if (map === undefined) continue;
      const pyramid = pyramidOf(map.width, map.height, map.decodedScale);
      const level = pyramid.levels[wait.level];
      if (level === undefined) {
        this.waits = this.waits.filter((candidate) => candidate !== wait);
        wait.reject(new TesseraLevelError(`Level ${wait.level} is outside the pyramid`));
        continue;
      }
      if (!map.stored.has(wait.level)) continue;
      this.waits = this.waits.filter((candidate) => candidate !== wait);
      const tiles = [];
      for (let row = 0; row < level.rows; row += 1) for (let col = 0; col < level.cols; col += 1) tiles.push({ level: wait.level, col, row, bytes: map.tileBytes });
      wait.resolve({ width: map.width, height: map.height, decodedScale: map.decodedScale, level: wait.level, tesserae: tiles });
    }
  }
}

/** The bytes of a PNG whose header says `width` × `height`, each `seed` another image. */
export function pngOf(width: number, height: number, seed = 1): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(64);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = 8;
  bytes[25] = 6;
  view.setUint32(40, seed);
  return bytes;
}
