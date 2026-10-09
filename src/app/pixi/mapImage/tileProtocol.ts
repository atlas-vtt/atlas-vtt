import type { Pyramid, TileRef } from './pyramid';

/**
 * Messages between `TileDecoderClient` (main thread) and the tile worker
 * (`tileWorker.ts`, or the same core run in-thread where no worker starts).
 * Bytes and bitmaps move as transferables, never as copies.
 */

/** What identifies a file's content without reading it: an unchanged file keeps its hash. */
export interface FileIdentity {
  path: string;
  size: number;
  mtime: number;
}

/** Why a map image cannot be opened; reported once per open, never per tile. */
export type OpenFailure =
  | { kind: 'decode-failed'; message: string }
  | { kind: 'too-large'; width: number; height: number; maxSide: number; maxPixels: number }
  | { kind: 'failed'; message: string };

export interface OpenedPyramid {
  handle: number;
  hash: string;
  pyramid: Pyramid;
}

export type TileRequest =
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
  | { type: 'tile'; id: number; handle: number; ref: TileRef }
  | { type: 'overview'; id: number; handle: number; maxSide: number }
  /** Drops a tile or overview request; nothing is answered for it. */
  | { type: 'cancel'; id: number }
  /** Ends an open; its pending requests are cancelled. */
  | { type: 'close'; handle: number }
  | { type: 'cache-size'; id: number }
  | { type: 'clear-cache'; id: number };

export type TileReply =
  | { type: 'opened'; id: number; opened: OpenedPyramid }
  | { type: 'need-bytes'; id: number }
  | { type: 'open-failed'; id: number; failure: OpenFailure }
  /** A prebuild ended: `complete` is false when it gave way to an open or could not write the cache. */
  | { type: 'prebuilt'; id: number; hash: string; complete: boolean }
  | { type: 'bitmap'; id: number; bitmap: ImageBitmap }
  | { type: 'cache-size'; id: number; bytes: number }
  /** The cache was cleared except for the pyramids in use; `bytes` is what they still take. */
  | { type: 'cleared'; id: number; bytes: number }
  /** A tile or overview request that could not be answered (an unknown handle, a tile missing from a cleared cache). */
  | { type: 'error'; id: number; message: string };

/** Unrequested news from the worker. */
export type TileEvent =
  | { type: 'progress'; hash: string; done: number; total: number }
  | { type: 'complete'; hash: string }
  /** A build stopped writing the cache (storage full, encoding unsupported); the open map keeps showing. */
  | { type: 'build-failed'; hash: string; message: string };

export type TileMessage = TileReply | TileEvent;

export function isTileEvent(message: TileMessage): message is TileEvent {
  return message.type === 'progress' || message.type === 'complete' || message.type === 'build-failed';
}
