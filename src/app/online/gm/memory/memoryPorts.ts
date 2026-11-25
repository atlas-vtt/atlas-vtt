import type { ExploredShapes } from '../../../vision/exploredShapes';
import type { MapBounds, Polygon } from '../../../vision/visibility';

/** PNG bytes of an explored memory: white, its coverage as alpha, at the memory's own size (`exploredGrid`). */
export type MemoryPng = Uint8Array<ArrayBuffer>;

/** One floor of a map, whose memory each player keeps apart: the map's path and the level (null for a map of one floor). */
export interface MemoryFloor {
  readonly mapPath: string;
  readonly level: string | null;
}

/**
 * One player's memory of one floor as it is stamped: the GM's own explored memory texture
 * (`ExploredTexture`), so it records and saves exactly as the GM's memory does. Coverage only grows
 * under `add` and `merge`.
 */
export interface MemoryRaster {
  /** Stamps what the player's eyes record (`exploredShapes`). */
  add(shapes: ExploredShapes): void;
  /** Adds a saved memory: each texel keeps the larger coverage of the two. */
  merge(png: MemoryPng): Promise<void>;
  /** Replaces the memory with a saved one, or with none. */
  replace(png: MemoryPng | null): Promise<void>;
  /** The memory as a PNG; null while it cannot be read (the graphics context is lost). */
  encode(): Promise<MemoryPng | null>;
  destroy(): void;
}

/** Makes players' memory textures on the GM's graphics device. */
export interface MemoryRasters {
  /** A blank memory over a map of `bounds`; null while there is no device to draw on. */
  create(bounds: MapBounds): MemoryRaster | null;
}

/** Where players' memories are kept between tables: in the played campaign, a PNG per floor and player. */
export interface MemoryStore {
  /** A player's memory of a floor; null where none is kept or it cannot be read. */
  read(floor: MemoryFloor, player: string): Promise<MemoryPng | null>;
  write(floor: MemoryFloor, player: string, png: MemoryPng): Promise<void>;
  /** The players who keep a memory of `floor`. */
  players(floor: MemoryFloor): Promise<readonly string[]>;
  remove(floor: MemoryFloor, player: string): Promise<void>;
}

/** A memory's size in texels, and how many of them a world pixel is (`exploredGrid`). */
export interface MemoryGrid {
  readonly columns: number;
  readonly rows: number;
  readonly scale: number;
}

/** Memories as coverage, one byte per texel row by row, for taking away what the GM took from the party's. */
export interface MemoryImages {
  /** The coverage of a PNG at `width` × `height` texels; null for one that cannot be read. */
  coverage(png: MemoryPng, width: number, height: number): Promise<Uint8Array | null>;
  /** A PNG of `coverage`, `width` × `height` texels. */
  png(coverage: Uint8Array, width: number, height: number): Promise<MemoryPng>;
  /** The coverage of `polygons` (world pixels, together) on a memory of `grid`, edges smoothed. */
  drawn(polygons: readonly Polygon[], grid: MemoryGrid): Promise<Uint8Array>;
}

/** A floor's players' memories a running table holds, which the store's files of that floor must not be changed under. */
export interface MemoryHolder {
  /** The path of the map whose floor it holds; null while it holds none. */
  mapPath(): string | null;
  /** Writes every memory it holds and sends none until `done` settles, then reads them again; settles once they are written. */
  yieldTo(done: Promise<void>): Promise<void>;
}

/** The memories running tables hold, which the GM's edits by hand let go of while they change the store's files. */
export interface LiveMemories {
  /** Takes in `holder`; returns the function that lets it go. */
  hold(holder: MemoryHolder): () => void;
}

/** What players' own explored memories are kept with; without it a player remembers only what their page saw. */
export interface MemoryPorts {
  readonly rasters: MemoryRasters;
  readonly store: MemoryStore;
  readonly images: MemoryImages;
  /** Where the floor's memories are held while they are read here, so the GM's edits by hand reach them. */
  readonly live?: LiveMemories;
}
