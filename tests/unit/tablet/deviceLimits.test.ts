import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DESKTOP_BUDGETS, MOBILE_BUDGETS, type DeviceBudgets } from '../../../src/app/platform/deviceBudgets';

const { profile } = vi.hoisted(() => ({ profile: { budgets: null as unknown } }));
vi.mock('../../../src/app/platform/deviceProfile', () => ({ deviceProfile: () => profile }));

/** The image workers the pool starts; none answers, so a job that reaches one is one that was not refused. */
const workers: unknown[] = [];
vi.mock('../../../src/app/imageProcessing/imageWorker?worker&inline', () => ({
  default: class {
    constructor() { workers.push(this); }
    addEventListener(): void {}
    removeEventListener(): void {}
    postMessage(): void {}
    terminate(): void {}
  },
}));

import { holdsDecoded, sourcePixelsWithin } from '../../../src/app/imageProcessing/decodeLimits';
import { disposeImageProcessing, IMAGE_PRESETS, ImageTooLargeError, optimizeImage, renderThumbnail } from '../../../src/app/imageProcessing/imageProcessing';
import { MAX_MAP_PIXELS, MAX_MAP_SIDE, maxPxPerCell, suggestedPxPerCell } from '../../../src/app/dungeons/render/layoutSize';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { uvttLimitsFor } from '../../../src/app/import/uvtt/uvttDeviceLimits';
import { floorFilesProblem } from '../../../src/app/import/uvtt/uvttFloors';
import { readUvttSource } from '../../../src/app/import/uvtt/uvttSource';
import { UVTT_LIMITS } from '../../../src/app/import/uvtt/uvttTypes';
import { generatedMapLimits } from '../../../src/app/platform/generatedMapLimits';
import { shadowDetail, setShadowMapSize } from '../../../src/app/dice3d/stageShadow';

const MIB = 1024 ** 2;
const ascii = (value: string): number[] => [...value].map((c) => c.charCodeAt(0));
const uint32 = (value: number): number[] => [value >>> 24, (value >>> 16) & 255, (value >>> 8) & 255, value & 255];

/** The first bytes of a PNG of this size: all an import reads before it decides. */
function pngOf(width: number, height: number): Blob {
  return new Blob([new Uint8Array([0x89, ...ascii('PNG\r\n\x1a\n'), 0, 0, 0, 13, ...ascii('IHDR'), ...uint32(width), ...uint32(height), 8, 6, 0, 0, 0])], { type: 'image/png' });
}

/** The first bytes of a baseline JPEG of this size. */
function jpegOf(width: number, height: number): Blob {
  return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xc0, 0, 17, 8, height >> 8, height & 255, width >> 8, width & 255, 3, 0, 0, 0, 0, 0, 0, 0, 0])], { type: 'image/jpeg' });
}

const use = (budgets: DeviceBudgets): void => { profile.budgets = budgets; };
/** Lets the header be read and the job reach the pool, or the refusal settle. */
const settled = async (): Promise<void> => { for (let i = 0; i < 20; i++) await Promise.resolve(); await new Promise((resolve) => setTimeout(resolve, 0)); };

beforeEach(() => { workers.length = 0; });
afterEach(() => { vi.unstubAllGlobals(); });

describe('what a device holds of one decoded image', () => {
  it('is a map of 8192 × 8192 pixels on a tablet and everything the browser decodes on a desktop', () => {
    expect(sourcePixelsWithin(MOBILE_BUDGETS.imageSourceBytes)).toBe(8192 * 8192);
    expect(holdsDecoded({ width: 8192, height: 8192 }, MOBILE_BUDGETS.imageSourceBytes)).toBe(true);
    expect(holdsDecoded({ width: 8193, height: 8192 }, MOBILE_BUDGETS.imageSourceBytes)).toBe(false);
    expect(holdsDecoded({ width: 16384, height: 4096 }, MOBILE_BUDGETS.imageSourceBytes)).toBe(true);
    expect(holdsDecoded({ width: 16384, height: 16383 }, DESKTOP_BUDGETS.imageSourceBytes)).toBe(true);
  });
});

describe('a map image larger than a tablet decodes whole', () => {
  it('is refused before any worker is started, with a sentence that names the limit', async () => {
    use(MOBILE_BUDGETS);

    const refusal = await optimizeImage(pngOf(9000, 9000), IMAGE_PRESETS.map).catch((error: unknown) => error);

    expect(refusal).toBeInstanceOf(ImageTooLargeError);
    expect((refusal as Error).message).toBe('This image is 9,000 × 9,000 px, larger than this device can open: at most 67 megapixels. Export it smaller and import it again.');
    expect(workers).toHaveLength(0);
  });

  it('goes to the workers where it is as large as a tablet holds', async () => {
    use(MOBILE_BUDGETS);

    void optimizeImage(pngOf(8192, 8192), IMAGE_PRESETS.map).catch(() => undefined);
    await settled();

    expect(workers).toHaveLength(1);
    disposeImageProcessing();
  });

  it('is refused for a thumbnail too where a JPEG is decoded whole, as in WebKit', async () => {
    use(MOBILE_BUDGETS);
    vi.stubGlobal('ImageDecoder', undefined);

    await expect(renderThumbnail(jpegOf(12000, 12000), { size: 256, quality: 0.8 })).rejects.toBeInstanceOf(ImageTooLargeError);
    expect(workers).toHaveLength(0);
  });
});

describe('the same map image on a desktop', () => {
  it('goes to the workers as it always did', async () => {
    vi.resetModules();
    use(DESKTOP_BUDGETS);
    const fresh = await import('../../../src/app/imageProcessing/imageProcessing');

    void fresh.optimizeImage(pngOf(9000, 9000), fresh.IMAGE_PRESETS.map).catch(() => undefined);
    await settled();

    expect(workers).toHaveLength(1);
    fresh.disposeImageProcessing();
  });
});

describe('Universal VTT limits by device', () => {
  it('are the import\'s own on a desktop', () => {
    expect(uvttLimitsFor(DESKTOP_BUDGETS)).toEqual({ fileBytes: UVTT_LIMITS.fileBytes, imagePixels: UVTT_LIMITS.imagePixels, floorsBytes: UVTT_LIMITS.floorsBytes });
    expect(UVTT_LIMITS.fileBytes).toBe(150 * MIB);
  });

  it('are a 64 MiB file, an image of 8192 × 8192 pixels and 128 MiB of floors on a tablet', () => {
    expect(uvttLimitsFor(MOBILE_BUDGETS)).toEqual({ fileBytes: 64 * MIB, imagePixels: 8192 * 8192, floorsBytes: 128 * MIB });
  });

  it('never grow past the import\'s own', () => {
    expect(uvttLimitsFor({ imageSourceBytes: Infinity, uvttFileBytes: Infinity, uvttFloorsBytes: Infinity })).toEqual(uvttLimitsFor(DESKTOP_BUDGETS));
  });

  it('refuse a file over the tablet\'s size without reading it', async () => {
    const file = { name: 'Keep.dd2vtt', size: 64 * MIB + 1, text: vi.fn() } as unknown as File;

    expect(await readUvttSource(file, uvttLimitsFor(MOBILE_BUDGETS))).toEqual({ ok: false, problem: 'The file is larger than 64 MB.' });
    expect(file.text).not.toHaveBeenCalled();
  });

  it('refuse floors that are together over the tablet\'s size', () => {
    const half = 64 * MIB;

    expect(floorFilesProblem([{ bytes: half }, { bytes: half }], uvttLimitsFor(MOBILE_BUDGETS))).toBeNull();
    expect(floorFilesProblem([{ bytes: half }, { bytes: half + 1 }], uvttLimitsFor(MOBILE_BUDGETS))).toBe('Together the files are larger than 128 MB.');
    expect(floorFilesProblem([{ bytes: half }, { bytes: half + 1 }], uvttLimitsFor(DESKTOP_BUDGETS))).toBeNull();
  });
});

describe('a generated map by device', () => {
  const model = generateDungeon({ seed: 7, tags: [], floors: 1 });

  it('keeps the generator\'s own limits on a desktop', () => {
    expect(generatedMapLimits(DESKTOP_BUDGETS)).toEqual({ maxPixels: Infinity, maxSide: Infinity });
    expect(maxPxPerCell(model, undefined, Infinity, Infinity)).toBe(maxPxPerCell(model));
    expect(suggestedPxPerCell(model, 150, undefined, 64_000_000, Infinity)).toBe(suggestedPxPerCell(model, 150, undefined, 64_000_000));
    expect(MAX_MAP_SIDE).toBe(16_383);
    expect(MAX_MAP_PIXELS).toBe(144_000_000);
  });

  it('fits one canvas a tablet draws on', async () => {
    const { mapPixelSize } = await import('../../../src/app/dungeons/render/layoutSize');
    const limits = generatedMapLimits(MOBILE_BUDGETS);
    const px = suggestedPxPerCell(model, 150, undefined, limits.maxPixels, limits.maxSide);
    const size = mapPixelSize(model, px);

    expect(limits).toEqual({ maxPixels: 4096 * 4096, maxSide: 8192 });
    expect(size.width * size.height).toBeLessThanOrEqual(4096 * 4096);
    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(8192);
    // The next whole pixel a cell would no longer fit.
    const larger = mapPixelSize(model, px + 1);
    expect(px === 150 || larger.width * larger.height > 4096 * 4096 || Math.max(larger.width, larger.height) > 8192).toBe(true);
  });

  it('is held to a shorter side where a canvas draws no larger', async () => {
    const { mapPixelSize } = await import('../../../src/app/dungeons/render/layoutSize');
    const px = suggestedPxPerCell(model, 150, undefined, undefined, 4096);
    const size = mapPixelSize(model, px);

    expect(Math.max(size.width, size.height)).toBeLessThanOrEqual(4096);
    expect(px).toBeLessThanOrEqual(suggestedPxPerCell(model, 150));
  });
});

describe('the dice\'s shadow map by device', () => {
  afterEach(() => setShadowMapSize(DESKTOP_BUDGETS.diceShadowMap));

  it('is what the dice always drew on a desktop', () => {
    setShadowMapSize(DESKTOP_BUDGETS.diceShadowMap);

    expect(shadowDetail()).toEqual({ map: 1024, taps: 12, blur: 1 });
  });

  it('has half the side, half the taps and half the blur on a tablet', () => {
    setShadowMapSize(MOBILE_BUDGETS.diceShadowMap);

    expect(shadowDetail()).toEqual({ map: 512, taps: 6, blur: 0.5 });
  });

  it('never grows past the map the dice were tuned for', () => {
    setShadowMapSize(4096);

    expect(shadowDetail().map).toBe(1024);
  });
});
