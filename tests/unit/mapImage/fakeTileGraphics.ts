import { Blob as NodeBlob } from 'node:buffer';
import { afterEach, beforeEach, vi } from 'vitest';
import type { PixelRect } from '../../../src/app/pixi/mapImage/pyramid';
import type { ComposedPart, TileGraphics } from '../../../src/app/pixi/mapImage/tileGraphics';
import { MemoryTileBackend } from '../../../src/app/pixi/mapImage/memoryTileBackend';
import { TileDecoderCore } from '../../../src/app/pixi/mapImage/tileDecoderCore';
import type { TileEvent } from '../../../src/app/pixi/mapImage/tileProtocol';
import { TileStore } from '../../../src/app/pixi/mapImage/tileStore';
import { sha256 } from '../../../src/app/utils/hashing';

/** jsdom's `Blob` cannot be read; Node's takes its place for the test file's tests. */
export function useReadableBlobs(): void {
  beforeEach(() => vi.stubGlobal('Blob', NodeBlob));
  afterEach(() => vi.unstubAllGlobals());
}

/** Where a fake bitmap came from, so tests can tell a crop from a cached tile. */
export type BitmapOrigin = 'source' | 'resized' | 'crop' | 'cache' | 'composed';

export class FakeBitmap implements ImageBitmap {
  closed = false;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly origin: BitmapOrigin,
  ) {}

  close(): void {
    this.closed = true;
  }
}

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
/** Byte after the IHDR size that makes the fake decoder fail. */
const BROKEN_MARK = 0xba;

/** Bytes whose PNG header says `width` × `height`; the fake decoder reads that size back. */
export function fakePng(width: number, height: number, { broken = false, salt = 0 } = {}): ArrayBuffer {
  const bytes = new Uint8Array(32);
  bytes.set(PNG_SIGNATURE, 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, width);
  view.setUint32(20, height);
  bytes[24] = broken ? BROKEN_MARK : 8;
  view.setUint32(28, salt);
  return bytes.buffer;
}

export interface EncodeCall {
  source: FakeBitmap;
  rect: PixelRect;
}

function asFake(bitmap: ImageBitmap): FakeBitmap {
  if (!(bitmap instanceof FakeBitmap)) throw new Error('Not a fake bitmap');
  if (bitmap.closed) throw new Error(`Read a closed ${bitmap.origin} bitmap`);
  return bitmap;
}

/** `TileGraphics` without pixels: sizes and origins only, every bitmap recorded. */
export class FakeTileGraphics implements TileGraphics {
  readonly bitmaps: FakeBitmap[] = [];
  readonly decodes: Blob[] = [];
  readonly resizes: Array<{ width: number; height: number }> = [];
  readonly encodes: EncodeCall[] = [];
  readonly composes: Array<{ width: number; height: number; parts: number }> = [];
  /** Awaited before every crop, so a test can hold one. */
  cropGate: () => Promise<void> = () => Promise.resolve();

  async decode(blob: Blob): Promise<ImageBitmap> {
    this.decodes.push(blob);
    if (blob.type === 'image/webp') {
      const { width, height } = JSON.parse(await blob.text()) as { width: number; height: number };
      return this.make(width, height, 'cache');
    }
    const view = new DataView(await blob.arrayBuffer());
    if (view.getUint8(24) === BROKEN_MARK) throw new Error('Corrupt image');
    return this.make(view.getUint32(16), view.getUint32(20), 'source');
  }

  resize(source: ImageBitmap, width: number, height: number): Promise<ImageBitmap> {
    asFake(source);
    this.resizes.push({ width, height });
    return Promise.resolve(this.make(width, height, 'resized'));
  }

  async crop(source: ImageBitmap, rect: PixelRect): Promise<ImageBitmap> {
    await this.cropGate();
    asFake(source);
    return this.make(rect.width, rect.height, 'crop');
  }

  encodeTile(source: ImageBitmap, rect: PixelRect): Promise<Blob> {
    this.encodes.push({ source: asFake(source), rect });
    return Promise.resolve(new Blob([JSON.stringify({ width: rect.width, height: rect.height })], { type: 'image/webp' }));
  }

  compose(width: number, height: number, parts: readonly ComposedPart[]): ImageBitmap {
    for (const part of parts) asFake(part.source);
    this.composes.push({ width, height, parts: parts.length });
    return this.make(width, height, 'composed');
  }

  private make(width: number, height: number, origin: BitmapOrigin): FakeBitmap {
    const bitmap = new FakeBitmap(width, height, origin);
    this.bitmaps.push(bitmap);
    return bitmap;
  }
}

export interface CoreHarness {
  core: TileDecoderCore;
  graphics: FakeTileGraphics;
  store: TileStore;
  backend: MemoryTileBackend;
  events: TileEvent[];
  /** Resolves on the next `complete` event of `hash`. */
  completed: (hash: string) => Promise<void>;
}

export function nextTask(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

export interface CoreHarnessOptions {
  decodedBudget?: number;
  backend?: MemoryTileBackend;
  /** Also receives every event the core emits. */
  forward?: (event: TileEvent) => void;
}

export function coreHarness(options: CoreHarnessOptions = {}): CoreHarness {
  const backend = options.backend ?? new MemoryTileBackend();
  const store = new TileStore({ backend, estimateQuota: () => Promise.resolve(null) });
  const graphics = new FakeTileGraphics();
  const events: TileEvent[] = [];
  const waiters: Array<{ hash: string; resolve: () => void }> = [];
  const core = new TileDecoderCore({
    store,
    graphics,
    sha256,
    yieldToMessages: nextTask,
    emit: (event) => {
      events.push(event);
      options.forward?.(event);
      if (event.type !== 'complete') return;
      for (const waiter of waiters.filter((w) => w.hash === event.hash)) waiter.resolve();
    },
    ...(options.decodedBudget === undefined ? {} : { decodedBudget: options.decodedBudget }),
  });
  const completed = (hash: string): Promise<void> => new Promise((resolve) => {
    if (events.some((event) => event.type === 'complete' && event.hash === hash)) resolve();
    else waiters.push({ hash, resolve });
  });
  return { core, graphics, store, backend, events, completed };
}
