import { describe, expect, it } from 'vitest';
import { grayJpeg } from '../../src/app/imageProcessing/__tests__/grayJpeg';
import { DECODED_MAX_PIXELS } from '../../src/app/imageProcessing/decodeLimits';
import { MemoryTesseraBackend } from '../../src/app/pixi/mosaicCanvas/memoryTesseraBackend';
import { pyramidOf, tesseraContentFrame, tesseraWorldRect, type TesseraRef } from '../../src/app/pixi/mosaicCanvas/pyramid';
import { TesseraDecoderCore } from '../../src/app/pixi/mosaicCanvas/tesseraDecoderCore';
import { browserGraphicsPrimitives, createTesseraGraphics } from '../../src/app/pixi/mosaicCanvas/tesseraGraphics';
import type { TesseraEvent } from '../../src/app/pixi/mosaicCanvas/tesseraProtocol';
import { TesseraStore } from '../../src/app/pixi/mosaicCanvas/tesseraStore';
import { sha256 } from '../../src/app/utils/hashing';

/**
 * Maps the browser cannot decode (2^28 pixels or more) tiled by the real tessera core through the band
 * decoders, in the browser: a 400 megapixel JPEG and a PNG painted on a canvas, whose tesserae must hold
 * the very pixels painted.
 */

function harness(): { core: TesseraDecoderCore; store: TesseraStore; events: TesseraEvent[] } {
  const store = new TesseraStore({ backend: new MemoryTesseraBackend(), estimateQuota: () => Promise.resolve(null) });
  const events: TesseraEvent[] = [];
  const core = new TesseraDecoderCore({
    store,
    graphics: createTesseraGraphics(browserGraphicsPrimitives()),
    sha256,
    yieldToMessages: () => new Promise((resolve) => setTimeout(resolve, 0)),
    emit: (event) => { events.push(event); },
  });
  return { core, store, events };
}

async function pixelsOf(bitmap: ImageBitmap): Promise<Uint8ClampedArray> {
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d')!;
  context.drawImage(bitmap, 0, 0);
  return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
}

describe('maps read in bands by the tessera core', () => {
  it('tesserae a 400 megapixel JPEG without ever decoding it whole, the overview first', async () => {
    const [width, height] = [20000, 20000];
    const { core, store, events } = harness();
    const bytes = await grayJpeg(width, height).arrayBuffer();
    const started = performance.now();

    const opened = await core.open({ path: 'huge.jpg', size: bytes.byteLength, mtime: 1 }, bytes);
    if (opened.kind !== 'opened') throw new Error(JSON.stringify(opened));
    expect(opened.opened.pyramid).toEqual(pyramidOf(width, height));
    const overview = await core.overview(1, opened.opened.handle, 2048);
    const overviewMs = performance.now() - started;
    expect(overview && Math.max(overview.width, overview.height)).toBe(2048);
    const overviewPixels = await pixelsOf(overview!);
    expect(overviewPixels[(1024 * 2048 + 1024) * 4]).toBeGreaterThan(120);
    expect(overviewPixels[(1024 * 2048 + 1024) * 4]).toBeLessThan(136);
    overview!.close();

    await new Promise<void>((resolve) => { const look = (): void => { if (events.some((e) => e.type === 'complete')) resolve(); else setTimeout(look, 200); }; look(); });
    const totalMs = performance.now() - started;
    const tesserae = await store.existingTesserae(opened.opened.hash);
    expect(tesserae.size).toBe(pyramidOf(width, height).levels.reduce((sum, level) => sum + level.cols * level.rows, 0));
    const corner: TesseraRef = { level: 0, col: 39, row: 39 };
    const tessera = await core.tessera(2, opened.opened.handle, corner);
    expect({ width: tessera!.width, height: tessera!.height }).toEqual({ width: tesseraWorldRect(opened.opened.pyramid, corner).width + 1, height: tesseraWorldRect(opened.opened.pyramid, corner).height + 1 });
    const tilePixels = await pixelsOf(tessera!);
    expect(tilePixels[0]).toBeGreaterThan(120);
    expect(tilePixels[0]).toBeLessThan(136);
    tessera!.close();
    core.close(opened.opened.handle);
    console.log(`[bandMaps] 400 MP JPEG: overview after ${Math.round(overviewMs)} ms, every tessera after ${Math.round(totalMs)} ms`);
    expect(events.filter((e) => e.type === 'build-failed')).toEqual([]);
  }, 600_000);

  it('tesserae a PNG of 2^28 pixels with the very pixels painted on it', async () => {
    const side = 16384;
    expect(side * side).toBe(DECODED_MAX_PIXELS);
    const canvas = new OffscreenCanvas(side, side);
    const context = canvas.getContext('2d')!;
    const gradient = context.createLinearGradient(0, 0, side, side);
    gradient.addColorStop(0, '#2eb9b8');
    gradient.addColorStop(1, '#8a2a1c');
    context.fillStyle = gradient;
    context.fillRect(0, 0, side, side);
    context.fillStyle = '#ffe600';
    for (let x = 5; x < side; x += 997) context.fillRect(x, 0, 1, side);
    const sample = (x: number, y: number): number[] => [...context.getImageData(x, y, 1, 1).data];
    const expected = { origin: sample(0, 0), line: sample(5, 7000), far: sample(side - 1, side - 1), middle: sample(8191, 8192) };
    const bytes = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
    canvas.width = 0;
    canvas.height = 0;
    const { core, events } = harness();

    const opened = await core.open({ path: 'painted.png', size: bytes.byteLength, mtime: 1 }, bytes);
    if (opened.kind !== 'opened') throw new Error(JSON.stringify(opened));
    const pyramid = opened.opened.pyramid;
    const at = async (x: number, y: number): Promise<number[]> => {
      const ref = { level: 0, col: Math.floor(x / 510), row: Math.floor(y / 510) };
      const tessera = await core.tessera(x * 7 + y, opened.opened.handle, ref);
      const frame = tesseraContentFrame(pyramid, ref);
      const pixels = await pixelsOf(tessera!);
      const px = (y - ref.row * 510 + frame.y) * tessera!.width + (x - ref.col * 510 + frame.x);
      tessera!.close();
      return [...pixels.subarray(px * 4, px * 4 + 4)];
    };

    expect(await at(0, 0)).toEqual(expected.origin);
    expect(await at(5, 7000)).toEqual(expected.line);
    expect(await at(side - 1, side - 1)).toEqual(expected.far);
    expect(await at(8191, 8192)).toEqual(expected.middle);
    await new Promise<void>((resolve) => { const look = (): void => { if (events.some((e) => e.type === 'complete')) resolve(); else setTimeout(look, 200); }; look(); });
    expect(events.filter((e) => e.type === 'build-failed')).toEqual([]);
    core.close(opened.opened.handle);
  }, 600_000);
});
