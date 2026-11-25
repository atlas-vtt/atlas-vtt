import type { ExploredShapes } from '../../../../src/app/vision/exploredShapes';
import type { MapBounds, Polygon } from '../../../../src/app/vision/visibility';
import type { MemoryFiles } from '../../../../src/app/online/gm/memory/KeptMemories.ts';
import type { LiveMemories, MemoryFloor, MemoryImages, MemoryPng, MemoryPorts, MemoryRaster, MemoryStore } from '../../../../src/app/online/gm/memory/memoryPorts.ts';

/** World pixels a cell of the stand-in memory spans: coarse, so a test reads which rooms it holds. */
export const CELL = 100;

/** What the stand-in PNG of a memory starts with after a PNG's header (which gives its size as its cells in one row); its coverage follows, a byte per cell, row by row. */
const MAGIC = [0x4d, 0x45, 0x4d, 0x4f];
const HEADER = 24;

/** A stand-in memory PNG holding `coverage`. */
export function fakePng(coverage: Uint8Array): MemoryPng {
  const png = new Uint8Array(HEADER + MAGIC.length + coverage.length);
  png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 0);
  new DataView(png.buffer).setUint32(16, coverage.length);
  new DataView(png.buffer).setUint32(20, 1);
  png.set(MAGIC, HEADER);
  png.set(coverage, HEADER + MAGIC.length);
  return png;
}

/** The coverage a stand-in memory PNG holds; null for anything else. */
export function fakeCoverage(png: Uint8Array): Uint8Array | null {
  return MAGIC.every((byte, index) => png[HEADER + index] === byte) ? png.slice(HEADER + MAGIC.length) : null;
}

/** The cells of a map of `bounds`: how many across and down. */
export function cellsOf(bounds: MapBounds): { readonly columns: number; readonly rows: number } {
  return { columns: Math.ceil(bounds.width / CELL), rows: Math.ceil(bounds.height / CELL) };
}

function contains(polygon: Polygon, x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > y) !== (b.y > y) && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Stands in for the GPU memory texture: a cell is remembered where its middle lies in the shapes' polygons, inside their clip. */
class FakeRaster implements MemoryRaster {
  coverage: Uint8Array;

  constructor(private readonly bounds: MapBounds) {
    const { columns, rows } = cellsOf(bounds);
    this.coverage = new Uint8Array(columns * rows);
  }

  add(shapes: ExploredShapes): void {
    const { columns } = cellsOf(this.bounds);
    for (let index = 0; index < this.coverage.length; index += 1) {
      const x = (index % columns) * CELL + CELL / 2;
      const y = Math.floor(index / columns) * CELL + CELL / 2;
      const inClip = shapes.clip === null || shapes.clip.some((polygon) => contains(polygon, x, y));
      if (inClip && shapes.polygons.some((polygon) => contains(polygon, x, y))) this.coverage[index] = 255;
    }
  }

  merge(png: MemoryPng): Promise<void> {
    const coverage = fakeCoverage(png);
    if (coverage === null || coverage.length !== this.coverage.length) return Promise.reject(new Error('not a memory of this map'));
    for (let index = 0; index < coverage.length; index += 1) this.coverage[index] = Math.max(this.coverage[index]!, coverage[index]!);
    return Promise.resolve();
  }

  replace(png: MemoryPng | null): Promise<void> {
    this.coverage = png === null ? new Uint8Array(this.coverage.length) : fakeCoverage(png) ?? new Uint8Array(this.coverage.length);
    return Promise.resolve();
  }

  encode(): Promise<MemoryPng | null> {
    return Promise.resolve(fakePng(this.coverage));
  }

  destroy(): void {
    this.coverage = new Uint8Array(0);
  }
}

/** Players' memories kept in memory, by floor and player, counting the writes. */
export class FakeMemoryStore implements MemoryStore {
  readonly files = new Map<string, MemoryPng>();
  writes = 0;

  static key(floor: MemoryFloor, player: string): string {
    return `${floor.mapPath}|${floor.level ?? ''}|${player}`;
  }

  read(floor: MemoryFloor, player: string): Promise<MemoryPng | null> {
    return Promise.resolve(this.files.get(FakeMemoryStore.key(floor, player)) ?? null);
  }

  write(floor: MemoryFloor, player: string, png: MemoryPng): Promise<void> {
    this.writes += 1;
    this.files.set(FakeMemoryStore.key(floor, player), png);
    return Promise.resolve();
  }

  players(floor: MemoryFloor): Promise<readonly string[]> {
    const prefix = FakeMemoryStore.key(floor, '');
    return Promise.resolve([...this.files.keys()].flatMap((key) => (key.startsWith(prefix) ? [key.slice(prefix.length)] : [])));
  }

  remove(floor: MemoryFloor, player: string): Promise<void> {
    this.files.delete(FakeMemoryStore.key(floor, player));
    return Promise.resolve();
  }
}

/** Reads and writes the stand-in PNGs: every memory of a map is one cell grid, whatever size is asked for; shapes cover the cells whose middles they hold. */
export const FAKE_IMAGES: MemoryImages = {
  coverage: (png) => Promise.resolve(fakeCoverage(png)),
  png: (coverage) => Promise.resolve(fakePng(coverage)),
  drawn: (polygons, grid) => {
    const raster = new FakeRaster({ width: Math.round(grid.columns / grid.scale), height: Math.round(grid.rows / grid.scale) });
    raster.add({ polygons: [...polygons], clip: null });
    return Promise.resolve(raster.coverage);
  },
};

/** Memory ports over stand-ins of the GPU texture and the canvas, keeping memories in `store`; `live`: where the GM's edits by hand find them. */
export function fakeMemory(store: FakeMemoryStore, live?: LiveMemories): MemoryPorts {
  return { rasters: { create: (bounds) => new FakeRaster(bounds) }, store, images: FAKE_IMAGES, ...(live !== undefined && { live }) };
}

/** The files of `store` as the GM's edits by hand reach them, a path per floor and player. */
export function fakeFiles(store: FakeMemoryStore): MemoryFiles {
  return {
    list: (mapPath, level) => {
      const prefix = level === undefined ? `${mapPath}|` : `${mapPath}|${level ?? ''}|`;
      return Promise.resolve([...store.files.keys()].filter((key) => key.startsWith(prefix)));
    },
    read: (path) => Promise.resolve(store.files.get(path) ?? null),
    write: (path, png) => {
      store.writes += 1;
      store.files.set(path, png);
      return Promise.resolve();
    },
    remove: (path) => {
      store.files.delete(path);
      return Promise.resolve();
    },
  };
}

/** A saved memory (a data URL) of a map of `bounds` remembering the cells whose middles `covers` takes in. */
export function fakeMask(bounds: MapBounds, covers: (x: number, y: number) => boolean): string {
  const { columns, rows } = cellsOf(bounds);
  const coverage = new Uint8Array(columns * rows);
  for (let index = 0; index < coverage.length; index += 1) {
    if (covers((index % columns) * CELL + CELL / 2, Math.floor(index / columns) * CELL + CELL / 2)) coverage[index] = 255;
  }
  return `data:image/png;base64,${Buffer.from(fakePng(coverage)).toString('base64')}`;
}

/** The middles of the cells a stand-in memory remembers. */
export function rememberedCells(bounds: MapBounds, png: Uint8Array | null): { readonly x: number; readonly y: number }[] {
  const coverage = png === null ? null : fakeCoverage(png);
  if (coverage === null) return [];
  const { columns } = cellsOf(bounds);
  return [...coverage].flatMap((share, index) => (share > 0 ? [{ x: (index % columns) * CELL + CELL / 2, y: Math.floor(index / columns) * CELL + CELL / 2 }] : []));
}
