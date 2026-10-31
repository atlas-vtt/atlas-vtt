import { ASSET_CAPS } from '../../protocol/index.ts';
import type { StoredTesseraSize } from '../../../pixi/mosaicCanvas/tesseraBlobs';
import { pyramidTesserae } from '../../../pixi/mosaicCanvas/tesseraBlobs';
import { imageDimensions } from '../../../imageProcessing/imageDimensions';
import { pyramidOf, TESSERA_SPEC, tesseraSourceRect, tesseraWorldRect, type Pyramid } from '../../../pixi/mosaicCanvas/pyramid';

/** The most a batch of tiles carries: below the store's 8 MiB body, with room for the form's headers. */
export const BATCH_BYTES = 7.5 * 1024 * 1024;
/** The most tiles one batch carries. */
export const BATCH_TILES = 32;
/**
 * The most a tile can take as lossless WebP, by its pixels: its raw RGBA and a margin for the
 * entropy coding of noise, plus the container. A pyramid is offered at the sum before it is cut.
 */
const TILE_BYTES_PER_PIXEL = 4 * 1.03;
const TILE_BYTES_HEADER = 1024;
/** The most a manifest takes. */
const MANIFEST_BYTES = 256;

/** Where players look on the map, as shares of its width and height (0 to 1). */
export interface MapFocus {
  readonly x: number;
  readonly y: number;
}

export const MAP_CENTRE: MapFocus = { x: 0.5, y: 0.5 };

/** One request of a pyramid's upload: its tiles, and whether it carries the manifest. */
export interface TileBatch {
  readonly tiles: readonly StoredTesseraSize[];
  readonly manifest: boolean;
  /** Whether it belongs to the overview level, which goes before anything else of the map. */
  readonly overview: boolean;
}

/** The order levels go up in (ASD-41): the overview, then the others from coarse to fine, as a page expects them. */
export function levelOrder(pyramid: Pyramid): number[] {
  const rest = pyramid.levels.map((level) => level.index).filter((index) => index !== pyramid.overview).reverse();
  return [pyramid.overview, ...rest];
}

/** Every tile of a pyramid, all levels together. */
export const tileCount = (pyramid: Pyramid): number => pyramid.levels.reduce((sum, level) => sum + level.cols * level.rows, 0);

/** The pyramid of an image as its header gives its size, read without decoding; null where the header cannot be read (SVG, AVIF). */
export async function headerPyramid(bytes: Uint8Array<ArrayBuffer>): Promise<Pyramid | null> {
  const size = await imageDimensions(new Blob([bytes]));
  if (size === null) return null;
  try {
    return pyramidOf(size.width, size.height);
  } catch {
    return null;
  }
}

/** `manifest.json`: width, height, spec, levels and tile count, which a page reads the pyramid by. */
export function manifestOf(pyramid: Pyramid): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify({ width: pyramid.width, height: pyramid.height, spec: TESSERA_SPEC, levels: pyramid.levels.length, count: tileCount(pyramid) })).slice();
}

/**
 * The most the store can be asked to keep of a pyramid before it is cut (the store refuses tiles past
 * the size offered and, once the pyramid is stored, keeps its true size): every tile at its bound and
 * the manifest, within what the store keeps under one id.
 */
export function pyramidBound(pyramid: Pyramid): number {
  const tiles = pyramidTesserae(pyramid).reduce((sum, ref) => {
    const rect = tesseraSourceRect(pyramid, ref);
    return sum + Math.ceil(rect.width * rect.height * TILE_BYTES_PER_PIXEL) + TILE_BYTES_HEADER;
  }, 0);
  return Math.min(ASSET_CAPS.tiles, tiles + MANIFEST_BYTES);
}

/** A tile's distance from the focus, in shares of the map. */
function distance(pyramid: Pyramid, tile: StoredTesseraSize, focus: MapFocus): number {
  const rect = tesseraWorldRect(pyramid, tile);
  return Math.hypot((rect.x + rect.width / 2) / pyramid.width - focus.x, (rect.y + rect.height / 2) / pyramid.height - focus.y);
}

/**
 * The batches of one level's upload: its tiles nearest `focus` first, in batches of at most
 * `BATCH_TILES` tiles and `BATCH_BYTES` bytes; the first carries the manifest where `manifest` names
 * its bytes (the pyramid's first level to go up, the overview).
 */
export function planLevel(pyramid: Pyramid, tiles: readonly StoredTesseraSize[], focus: MapFocus, manifest: Uint8Array | null): TileBatch[] {
  const overview = tiles[0]?.level === pyramid.overview;
  const sorted = tiles.map((tile) => ({ tile, away: distance(pyramid, tile, focus) })).sort((a, b) => a.away - b.away);
  const batches: TileBatch[] = [];
  let current: StoredTesseraSize[] = [];
  let size = manifest?.length ?? 0;
  const close = (): void => {
    batches.push({ tiles: current, manifest: manifest !== null && batches.length === 0, overview });
    current = [];
    size = 0;
  };
  for (const { tile } of sorted) {
    if (current.length > 0 && (current.length >= BATCH_TILES || size + tile.bytes > BATCH_BYTES)) close();
    current.push(tile);
    size += tile.bytes;
  }
  if (current.length > 0 || batches.length === 0) close();
  return batches;
}
