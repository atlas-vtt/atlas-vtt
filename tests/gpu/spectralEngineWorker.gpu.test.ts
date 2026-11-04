import { afterAll, describe, expect, it } from 'vitest';
import { detectGridInMapGray } from '../../src/app/pixi/spectralEngine/detectGrid';
import type { MapGray } from '../../src/app/pixi/spectralEngine/detectGrid';
import type { DetectionEvent } from '../../src/app/pixi/spectralEngine/detectionJob';
import { detectGridInGray, disposeSpectralEngine } from '../../src/app/pixi/spectralEngine/spectralEngineService';

/**
 * Grid detection runs in a worker of its own, so the window keeps painting while a grid is looked
 * for and what the detection finds can be shown as it is found. This runs the real worker.
 */

/** A noisy map of `side` px with a square grid of `cell` px drawn two pixels wide. */
function squareMap(side: number, cell: number, offset: number): MapGray {
  const data = new Float32Array(side * side);
  let state = 5;
  for (let i = 0; i < data.length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    data[i] = 150 + (state / 0x100000000) * 50;
  }
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      if ((x - offset + cell) % cell < 2 || (y - offset + cell) % cell < 2) data[y * side + x] = 40;
    }
  }
  return { image: { width: side, height: side, data }, size: { width: side, height: side } };
}

describe('grid detection worker', () => {
  afterAll(disposeSpectralEngine);

  it('finds the grid a detection on the main thread finds, and reports on the way while frames go on', async () => {
    const gray = squareMap(3072, 96, 17);
    const events: DetectionEvent[] = [];
    let frames = 0;
    let counting = true;
    const count = (): void => {
      frames++;
      if (counting) requestAnimationFrame(count);
    };
    requestAnimationFrame(count);

    const started = performance.now();
    const { result, hits } = await detectGridInGray(gray, { onEvent: (event) => events.push(event) });
    const took = performance.now() - started;
    counting = false;

    expect(result).toEqual(detectGridInMapGray(gray.image, gray.size));
    expect(result?.gridType).toBe('square');
    expect(result?.cellSize).toBeCloseTo(96, 0);
    expect(events[0]?.type).toBe('ink');
    expect(events.some((event) => event.type === 'fit')).toBe(true);
    expect(hits!.length).toBeGreaterThan(400);
    // The image was copied, not handed over: the panel fits several times on one reading of the map.
    expect(gray.image.data.length).toBe(3072 * 3072);
    // A detection on the main thread paints no frame until it ends; here they kept coming.
    expect(frames).toBeGreaterThan(took / 100);
  });

  it('ends a detection nobody waits for and answers the next', async () => {
    const gray = squareMap(3072, 96, 17);
    const asked = new AbortController();
    const stale = detectGridInGray(gray, { signal: asked.signal });
    const started = performance.now();
    window.setTimeout(() => asked.abort(), 20);
    await expect(stale).rejects.toMatchObject({ name: 'AbortError' });
    expect(performance.now() - started).toBeLessThan(200);

    const small = squareMap(512, 64, 9);
    expect((await detectGridInGray(small)).result?.cellSize).toBeCloseTo(64, 0);
  });

  it('reads the pixels of a map itself from its picture, and tells of every grid it tries', async () => {
    const gray = squareMap(1024, 64, 9);
    // The picture the app would hand over: the map drawn, as a bitmap of its own each time it is asked for.
    const canvas = new OffscreenCanvas(1024, 1024);
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(1024, 1024);
    for (let i = 0; i < gray.image.data.length; i++) pixels.data.set([gray.image.data[i]!, gray.image.data[i]!, gray.image.data[i]!, 255], i * 4);
    context.putImageData(pixels, 0, 0);
    let asked = 0;
    const picture = { size: gray.size, bitmap: () => (asked++, createImageBitmap(canvas)) };

    const events: DetectionEvent[] = [];
    const first = await detectGridInGray(picture, { onEvent: (event) => events.push(event) });
    expect(first.result?.gridType).toBe('square');
    expect(first.result?.cellSize).toBeCloseTo(64, 0);
    const tried = events.flatMap((event) => (event.type === 'trial' ? [event.trial] : []));
    expect(tried.length).toBeGreaterThan(0);
    // The grid found was tried before it was found.
    const firstFit = events.findIndex((event) => event.type === 'fit');
    expect(events.slice(0, firstFit).some((event) => event.type === 'trial')).toBe(true);

    // The worker keeps what it read: asking again about the same picture fetches no other.
    await detectGridInGray(picture, { candidates: [first.result!] });
    expect(asked).toBe(1);
  });
});

