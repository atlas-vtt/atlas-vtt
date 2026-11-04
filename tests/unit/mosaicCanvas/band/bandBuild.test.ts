// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { BandBuild, bandPasses } from '../../../../src/app/pixi/mosaicCanvas/band/bandBuild';
import { halveRows } from '../../../../src/app/pixi/mosaicCanvas/band/halveRows';
import { MemoryTesseraBackend } from '../../../../src/app/pixi/mosaicCanvas/memoryTesseraBackend';
import { pyramidOf, tesseraKey, tesseraSourceRect, type PixelRect, type Pyramid, type TesseraRef } from '../../../../src/app/pixi/mosaicCanvas/pyramid';
import type { ComposedPart, TesseraGraphics } from '../../../../src/app/pixi/mosaicCanvas/tesseraGraphics';
import type { TesseraEvent } from '../../../../src/app/pixi/mosaicCanvas/tesseraProtocol';
import { TesseraStore } from '../../../../src/app/pixi/mosaicCanvas/tesseraStore';
import { useReadableBlobs } from '../fakeTesseraGraphics';
import { fakeBandDecoder, reducedImage, wholeImage } from './fakeBandDecoder';

/** A bitmap that keeps its pixels, so a tessera's bytes can be checked. */
class PixelBitmap implements ImageBitmap {
  closed = false;
  constructor(readonly width: number, readonly height: number, readonly data: Uint8ClampedArray) {}
  close(): void {
    this.closed = true;
  }
}

const crop = (source: PixelBitmap, rect: PixelRect): Uint8ClampedArray => {
  const out = new Uint8ClampedArray(rect.width * rect.height * 4);
  for (let y = 0; y < rect.height; y++) {
    out.set(source.data.subarray(((rect.y + y) * source.width + rect.x) * 4, ((rect.y + y) * source.width + rect.x + rect.width) * 4), y * rect.width * 4);
  }
  return out;
};

/** Graphics whose "WebP" is the raw RGBA of the rect, so tests read tesserae back exactly. */
class PixelGraphics implements TesseraGraphics {
  decode(blob: Blob): Promise<ImageBitmap> {
    return blob.arrayBuffer().then((buffer) => {
      const view = new DataView(buffer);
      return new PixelBitmap(view.getUint32(0), view.getUint32(4), new Uint8ClampedArray(buffer, 8));
    });
  }
  resize(): Promise<ImageBitmap> {
    throw new Error('not needed');
  }
  crop(source: ImageBitmap, rect: PixelRect): Promise<ImageBitmap> {
    return Promise.resolve(new PixelBitmap(rect.width, rect.height, crop(source as PixelBitmap, rect)));
  }
  fromPixels(data: Uint8ClampedArray, width: number, height: number): Promise<ImageBitmap> {
    return Promise.resolve(new PixelBitmap(width, height, data.slice()));
  }
  encodeTessera(source: ImageBitmap, rect: PixelRect): Promise<Blob> {
    const header = new DataView(new ArrayBuffer(8));
    header.setUint32(0, rect.width);
    header.setUint32(4, rect.height);
    return Promise.resolve(new Blob([header, crop(source as PixelBitmap, rect)], { type: 'image/webp' }));
  }
  compose(_width: number, _height: number, _parts: readonly ComposedPart[]): ImageBitmap {
    throw new Error('not needed');
  }
  opaquePixels(): Uint8Array {
    throw new Error('not needed');
  }
  alphaBytes(): Uint8Array {
    throw new Error('not needed');
  }
}

/** Every level as the build should hold it: levels 0 to 2 halved from the whole image, the rest halved from the reduced one. */
function expectedLevels(pyramid: Pyramid, width: number, height: number): Map<number, Uint8ClampedArray> {
  const levels = new Map<number, Uint8ClampedArray>();
  const halve = (from: number, data: Uint8ClampedArray, until: number): void => {
    levels.set(from, data);
    let current = data;
    for (let index = from + 1; index <= until; index++) {
      const finer = pyramid.levels[index - 1]!;
      const level = pyramid.levels[index]!;
      const next = new Uint8ClampedArray(level.width * level.height * 4);
      const stride = finer.width * 4;
      for (let y = 0; y < level.height; y++) {
        const above = current.subarray(2 * y * stride, (2 * y + 1) * stride);
        const below = 2 * y + 1 < finer.height ? current.subarray((2 * y + 1) * stride, (2 * y + 2) * stride) : null;
        halveRows(above, below, finer.width, next.subarray(y * level.width * 4, (y + 1) * level.width * 4));
      }
      levels.set(index, next);
      current = next;
    }
  };
  const [first, second] = bandPasses(pyramid);
  if (second) {
    halve(first!.baseLevel, reducedImage(width, height), first!.lastLevel);
    halve(0, wholeImage(width, height), second.lastLevel);
  } else {
    halve(0, wholeImage(width, height), first!.lastLevel);
  }
  return levels;
}

interface Bench {
  store: TesseraStore;
  events: TesseraEvent[];
  build: (decoder: ReturnType<typeof fakeBandDecoder>, pyramid: Pyramid) => BandBuild;
  tessera: (ref: TesseraRef) => Promise<Uint8ClampedArray>;
}

const HASH = 'a'.repeat(64);

/** Whether two pixel buffers hold the same bytes; a deep equality over a megabyte of pixels is what made these tests slow. */
function samePixels(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  return a.length === b.length && Buffer.from(a.buffer, a.byteOffset, a.length).equals(Buffer.from(b.buffer, b.byteOffset, b.length));
}

function bench(backend = new MemoryTesseraBackend()): Bench {
  const store = new TesseraStore({ backend, estimateQuota: () => Promise.resolve(null) });
  const graphics = new PixelGraphics();
  const events: TesseraEvent[] = [];
  return {
    store,
    events,
    build: (decoder, pyramid) => new BandBuild(HASH, pyramid, new Uint8Array(16), decoder, { store, graphics, yieldToRequests: () => Promise.resolve(), emit: (event) => { events.push(event); } }),
    tessera: async (ref) => {
      const blob = await store.getTessera(HASH, ref);
      if (!blob) throw new Error(`no tessera ${tesseraKey(ref)}`);
      return (await graphics.decode(blob) as PixelBitmap).data;
    },
  };
}

describe('a pyramid built from bands', () => {
  useReadableBlobs();

  it('plans an eighth pass for the coarse levels and a full pass for the three finest, or one pass for a small map', () => {
    expect(bandPasses(pyramidOf(4100, 3000))).toEqual([{ reduce: 8, baseLevel: 3, lastLevel: 4 }, { reduce: 1, baseLevel: 0, lastLevel: 2 }]);
    expect(bandPasses(pyramidOf(1000, 700))).toEqual([{ reduce: 1, baseLevel: 0, lastLevel: 1 }]);
  });

  it('writes every tessera of every level with the very pixels of the whole image, the coarse levels from the eighth', async () => {
    // 2,100 wide for the eighth pass, 600 high for two tessera rows: enough for every path, small enough for a CI runner.
    const [width, height] = [2100, 600];
    const pyramid = pyramidOf(width, height);
    const b = bench();
    const decoder = fakeBandDecoder({ width, height, bandRows: 53 });

    expect(await b.build(decoder, pyramid).run()).toBe('complete');

    expect(decoder.decodes).toEqual([8, 1]);
    expect((await b.store.readManifest(HASH))?.complete).toBe(true);
    const levels = expectedLevels(pyramid, width, height);
    for (const level of pyramid.levels) {
      for (let row = 0; row < level.rows; row++) {
        for (let col = 0; col < level.cols; col++) {
          const ref = { level: level.index, col, row };
          const rect = tesseraSourceRect(pyramid, ref);
          const expected = crop(new PixelBitmap(level.width, level.height, levels.get(level.index)!), rect);
          expect(samePixels(await b.tessera(ref), expected), tesseraKey(ref)).toBe(true);
        }
      }
    }
    const complete = b.events.filter((event) => event.type === 'complete');
    expect(complete).toHaveLength(1);
  }, 60_000);

  it('stores the coarse levels before any fine tessera, so the overview shows while the full pass runs', async () => {
    const [width, height] = [2100, 600];
    const pyramid = pyramidOf(width, height);
    const b = bench();
    const firstFine: number[] = [];
    const decoder = fakeBandDecoder({ width, height, beforeBand: (y, reduce) => { if (reduce === 1 && y === 0) firstFine.push(b.events.filter((e) => e.type === 'progress').length); } });

    await b.build(decoder, pyramid).run();

    const coarseTesserae = pyramid.levels.slice(3).reduce((sum, level) => sum + level.cols * level.rows, 0);
    const progress = b.events.filter((event): event is Extract<TesseraEvent, { type: 'progress' }> => event.type === 'progress');
    expect(progress[firstFine[0]! - 1]?.done).toBe(coarseTesserae);
  });

  it('answers a request for a tessera once the build reaches it, and rejects the rest when it stops', async () => {
    // 600 × 1100: one pass, three tessera rows at level 0; stopping at row 700 leaves the first written and the second not.
    const [width, height] = [600, 1100];
    const pyramid = pyramidOf(width, height);
    expect(bandPasses(pyramid)).toHaveLength(1);
    const b = bench();
    let stopAt: (() => void) | null = null;
    const decoder = fakeBandDecoder({ width, height, bandRows: 100, beforeBand: (y) => { if (y === 700) stopAt?.(); } });
    const build = b.build(decoder, pyramid);
    stopAt = () => build.stop();
    const early = build.whenStored({ level: 0, col: 0, row: 0 });
    const late = build.whenStored({ level: 0, col: 0, row: 1 });
    late.catch(() => undefined);

    expect(await build.run()).toBe('stopped');

    await expect(early).resolves.toBeUndefined();
    await expect(late).rejects.toThrow(/stopped/);
    await expect(build.whenStored({ level: 0, col: 0, row: 0 })).resolves.toBeUndefined();
    await expect(build.whenStored({ level: 0, col: 0, row: 2 })).rejects.toThrow(/stopped/);
  });

  it('resumes from what an earlier build wrote, decoding only the pass with tesserae missing', async () => {
    // 4,100 wide for the eighth pass; 1,100 high: three tessera rows, the stop at row 1,000 leaves the first written and the rest not.
    const [width, height] = [4100, 1100];
    const pyramid = pyramidOf(width, height);
    const backend = new MemoryTesseraBackend();
    const first = bench(backend);
    const stopping = fakeBandDecoder({ width, height, bandRows: 500, beforeBand: (y, reduce) => { if (reduce === 1 && y === 1000) stoppable.stop(); } });
    const stoppable = first.build(stopping, pyramid);
    expect(await stoppable.run()).toBe('stopped');
    const written = (await first.store.existingTesserae(HASH)).size;
    expect(written).toBeGreaterThan(0);

    const second = bench(backend);
    const resuming = fakeBandDecoder({ width, height, bandRows: 500 });
    expect(await second.build(resuming, pyramid).run()).toBe('complete');

    // The eighth pass was complete already, so only the full pass ran again.
    expect(resuming.decodes).toEqual([1]);
    const total = pyramid.levels.reduce((sum, level) => sum + level.cols * level.rows, 0);
    expect((await second.store.existingTesserae(HASH)).size).toBe(total);
    const levels = expectedLevels(pyramid, width, height);
    const ref = { level: 0, col: 3, row: 2 };
    expect(samePixels(await second.tessera(ref), crop(new PixelBitmap(pyramid.levels[0]!.width, pyramid.levels[0]!.height, levels.get(0)!), tesseraSourceRect(pyramid, ref)))).toBe(true);
  }, 60_000);
});
