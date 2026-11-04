import { describe, expect, it } from 'vitest';
import { DECODED_MAX_PIXELS } from '../../src/app/imageProcessing/decodeLimits';
import { MemoryTesseraBackend } from '../../src/app/pixi/mosaicCanvas/memoryTesseraBackend';
import { TesseraDecoderCore } from '../../src/app/pixi/mosaicCanvas/tesseraDecoderCore';
import { browserGraphicsPrimitives, createTesseraGraphics } from '../../src/app/pixi/mosaicCanvas/tesseraGraphics';
import type { TesseraEvent } from '../../src/app/pixi/mosaicCanvas/tesseraProtocol';
import { TesseraStore } from '../../src/app/pixi/mosaicCanvas/tesseraStore';
import { MAX_ANALYSIS_SIDE, pictureOf, type DetectableMap } from '../../src/app/pixi/spectralEngine/detectGrid';
import { detectGridInGray, detectGridOfMap, disposeSpectralEngine } from '../../src/app/pixi/spectralEngine/spectralEngineService';
import { sha256 } from '../../src/app/utils/hashing';

/**
 * A map too large for the browser to decode, with a 64 px grid drawn on its bottom-right corner
 * alone: the whole map fit within 4096 px shows that grid 4 px wide and finds nothing, while the
 * windows read at the finest level find it where it is.
 */
describe('grid detection on a huge map', () => {
  it('finds a grid drawn on one corner of a map the browser cannot decode', async () => {
    const side = 16384;
    expect(side * side).toBe(DECODED_MAX_PIXELS);
    const canvas = new OffscreenCanvas(side, side);
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#d9cfb4';
    context.fillRect(0, 0, side, side);
    // Floor texture everywhere, so the blank paper is not the only thing the windows could choose.
    context.fillStyle = '#c7bc9f';
    for (let i = 0; i < 4000; i++) context.fillRect((i * 7919) % side, (i * 104729) % side, 40, 40);
    const cell = 64;
    const gridRect = { x: 10000, y: 10500, width: 5800, height: 5300 };
    context.fillStyle = '#2b2b2b';
    for (let x = gridRect.x + 17; x < gridRect.x + gridRect.width; x += cell) context.fillRect(x, gridRect.y, 1, gridRect.height);
    for (let y = gridRect.y + 41; y < gridRect.y + gridRect.height; y += cell) context.fillRect(gridRect.x, y, gridRect.width, 1);
    const bytes = await (await canvas.convertToBlob({ type: 'image/png' })).arrayBuffer();
    canvas.width = 0;
    canvas.height = 0;

    const store = new TesseraStore({ backend: new MemoryTesseraBackend(), estimateQuota: () => Promise.resolve(null) });
    const events: TesseraEvent[] = [];
    const core = new TesseraDecoderCore({ store, graphics: createTesseraGraphics(browserGraphicsPrimitives()), sha256, yieldToMessages: () => new Promise((resolve) => setTimeout(resolve, 0)), emit: (event) => { events.push(event); } });
    const opened = await core.open({ path: 'corner-grid.png', size: bytes.byteLength, mtime: 1 }, bytes);
    if (opened.kind !== 'opened') throw new Error(JSON.stringify(opened));
    const { handle } = opened.opened;
    let next = 100;
    const map: DetectableMap = {
      worldRect: { x: 0, y: 0, width: side, height: side },
      imageSize: { width: side, height: side },
      overview: (maxSide) => core.overview(next++, handle, maxSide),
      window: (rect, maxSide) => core.window(next++, handle, rect, maxSide),
    };
    try {
      const wholeOnly = await detectGridInGray(pictureOf(map)!);
      const found = await detectGridOfMap(map);

      expect(found.result).not.toBeNull();
      expect(found.result!.cellSize).toBeCloseTo(cell, 0);
      // A detected line indexes its pixel; the line's centre lies half a pixel further.
      expect(((found.result!.offsetX - (gridRect.x + 17 + 0.5)) % cell + cell) % cell).toBeCloseTo(0, 0);
      expect(((found.result!.offsetY - (gridRect.y + 41 + 0.5)) % cell + cell) % cell).toBeCloseTo(0, 0);
      // Seen whole, the corner's grid is a tenth of the map's edges: found, but with a tenth of the support the windows give it.
      expect(found.result!.confidence ?? 0).toBeGreaterThan(0.9);
      expect(wholeOnly.result === null || (wholeOnly.result.confidence ?? 0) < 0.3).toBe(true);
      expect(events.filter((event) => event.type === 'build-failed')).toEqual([]);
      expect(MAX_ANALYSIS_SIDE).toBe(4096);
    } finally {
      core.close(handle);
      disposeSpectralEngine();
    }
  }, 600_000);
});
