import type { BandUnsupportedReason } from '../../imageProcessing/band/bandTypes';
import type { ArtAlpha } from '../../levels/artRaster';
import type { RoofPieces } from '../../levels/roofs';
import type { PixelRect, Pyramid, TesseraRef } from './pyramid';
import type { StoredLevel, TesseraSelection } from './tesseraBlobs';

/**
 * Messages between `TesseraDecoderClient` (main thread) and the tessera worker
 * (`tesseraWorker.ts`, or the same core run in-thread where no worker starts).
 * Bytes and bitmaps move as transferables, never as copies.
 */

/** What identifies a file's content without reading it: an unchanged file keeps its hash. */
export interface FileIdentity {
  path: string;
  size: number;
  mtime: number;
}

/** Why a map image cannot be opened; reported once per open, never per tessera. */
export type OpenFailure =
  | { kind: 'decode-failed'; message: string }
  | { kind: 'too-large'; width: number; height: number; maxSide: number; maxPixels: number }
  /** Larger than the browser decodes and not an image Atlas can read in bands: `reason` says what to export instead. */
  | { kind: 'unsupported'; width: number; height: number; reason: BandUnsupportedReason }
  | { kind: 'failed'; message: string };

export interface OpenedPyramid {
  handle: number;
  hash: string;
  pyramid: Pyramid;
}

export type TesseraRequest =
  /** First message to a worker: which vault's cache to open; null keeps the cache in memory. */
  | { type: 'init'; appId: string | null }
  /**
   * Opens a map for serving (`prebuild`: builds its pyramid without serving).
   * Sent first without bytes; the worker answers `need-bytes` when the cache
   * cannot serve it, and the same id is sent again with the file's bytes.
   * `decoded` is the image decoded on the main thread, for what a worker cannot
   * decode (SVG): the pyramid is built from it, the hash is still the bytes'.
   */
  | { type: 'open' | 'prebuild'; id: number; identity: FileIdentity | null; bytes: ArrayBuffer | null; decoded?: ImageBitmap | null }
  | { type: 'tessera'; id: number; handle: number; ref: TesseraRef }
  | { type: 'overview'; id: number; handle: number; maxSide: number }
  /** A part of the map (`rect` in the image's pixels) fit within `maxSide`, from the finest level that shows it so (`windowLevel`). */
  | { type: 'window'; id: number; handle: number; rect: PixelRect; maxSide: number }
  /** Which pixels of the overview fit within `maxSide` hold art: alpha above `threshold` (of 255). */
  | { type: 'alpha-raster'; id: number; handle: number; maxSide: number; threshold: number }
  /** The pieces of a roof image (`roofPieces`) over its overview fit within `maxSide`. */
  | { type: 'roof-pieces'; id: number; handle: number; maxSide: number }
  /** Drops a tessera, overview, alpha, roof or level request; nothing is answered for it. */
  | { type: 'cancel'; id: number }
  /** Ends an open; its pending requests are answered with an `error`. */
  | { type: 'close'; handle: number }
  | { type: 'cache-size'; id: number }
  | { type: 'clear-cache'; id: number }
  /** The stored WebP bytes of a cached pyramid's tesserae, by its hash, never decoded. */
  | { type: 'tessera-blobs'; id: number; hash: string; tesserae: TesseraSelection }
  /** Answered once every tessera of a cached pyramid's level is stored, at once where it is; a build may still be cutting it. */
  | { type: 'level-ready'; id: number; hash: string; level: number };

export type TesseraReply =
  | { type: 'opened'; id: number; opened: OpenedPyramid }
  | { type: 'need-bytes'; id: number }
  | { type: 'open-failed'; id: number; failure: OpenFailure }
  /** A prebuild ended: `complete` is false when it gave way to an open or could not write the cache; `stored`: its tesserae in the cache now. */
  | { type: 'prebuilt'; id: number; hash: string; complete: boolean; stored: number }
  | { type: 'bitmap'; id: number; bitmap: ImageBitmap }
  | { type: 'alpha-raster'; id: number; raster: ArtAlpha }
  | { type: 'roof-pieces'; id: number; pieces: RoofPieces }
  | { type: 'cache-size'; id: number; bytes: number }
  /** The cache was cleared except for the pyramids in use; `bytes` is what they still take. */
  | { type: 'cleared'; id: number; bytes: number }
  /** In the order asked for; null for a tessera the cache misses. The buffers are transferred. */
  | { type: 'tessera-blobs'; id: number; blobs: (ArrayBuffer | null)[] }
  | { type: 'level-ready'; id: number; level: StoredLevel }
  /** A tessera or overview request that could not be answered (an unknown handle, a tessera missing from a cleared cache). */
  | { type: 'error'; id: number; message: string };

/** Unrequested news from the worker; `path` names the file the map was opened or prebuilt from, where one was. */
export type TesseraEvent =
  | { type: 'progress'; hash: string; done: number; total: number; path?: string }
  | { type: 'complete'; hash: string; path?: string }
  /** A build stopped writing the cache (storage full, encoding unsupported); the open map keeps showing. */
  | { type: 'build-failed'; hash: string; message: string; path?: string };

/** Sent once after `init`, when the core is up: a worker that fails before it never started. */
export interface TesseraReady {
  type: 'ready';
}

export type TesseraMessage = TesseraReply | TesseraEvent | TesseraReady;

export function isTesseraEvent(message: TesseraMessage): message is TesseraEvent {
  return message.type === 'progress' || message.type === 'complete' || message.type === 'build-failed';
}
