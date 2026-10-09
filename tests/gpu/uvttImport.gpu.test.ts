import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageDimensions } from '../../src/app/imageProcessing/imageDimensions';
import { IMAGE_PRESETS, disposeImageProcessing, optimizeImage } from '../../src/app/imageProcessing/imageProcessing';
import { importUvttFile, type UvttImportDeps, type UvttImported } from '../../src/app/import/uvtt/importUvttFile';
import { AssetService } from '../../src/app/services/AssetService';
import { AssetThumbnailService, THUMBNAIL_SPEC } from '../../src/app/services/AssetThumbnailService';
import { createInMemoryApp, interceptWrites, type InMemoryApp } from '../mocks/inMemoryVault';

/**
 * The import with the real image workers, in a real browser: the unit tests stand in for them.
 * What matters here is what only a decoder and an encoder can tell: the size of the saved image,
 * which decides where every wall lies.
 */

const COLLECTION = 'Dungeons';

interface Bench {
  vault: InMemoryApp;
  deps: UvttImportDeps;
  /** The bytes of every binary file written, by path: the in-memory vault keeps them as text. */
  binaries: Map<string, ArrayBuffer>;
}

async function bench(): Promise<Bench> {
  const vault = createInMemoryApp();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection(COLLECTION);
  const binaries = new Map<string, ArrayBuffer>();
  const keep = (path: string, content: unknown): void => { if (content instanceof ArrayBuffer) binaries.set(path, content); };
  interceptWrites(vault.app.vault, 'createBinary', keep);
  interceptWrites(vault.app.vault.adapter, 'writeBinary', keep);
  return {
    vault,
    binaries,
    deps: {
      app: vault.app,
      assetService: assets,
      convertImage: (image) => optimizeImage(image, IMAGE_PRESETS.map, { thumbnail: THUMBNAIL_SPEC }),
      thumbnails: new AssetThumbnailService(vault.app, assets),
    },
  };
}

async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000) binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

/** A map of `cells` at `pixelsPerCell`, painted on a canvas and encoded as `type`, with one wall line and a light. */
async function mapFile(cells: { x: number; y: number }, pixelsPerCell: number, type: string): Promise<File> {
  const canvas = new OffscreenCanvas(cells.x * pixelsPerCell, cells.y * pixelsPerCell);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#b0a48e';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#18161a';
  context.fillRect(pixelsPerCell, pixelsPerCell - 4, canvas.width - 2 * pixelsPerCell, 8);
  const image = await base64Of(await canvas.convertToBlob({ type, quality: 0.9 }));
  return new File([JSON.stringify({
    format: 0.3,
    resolution: { map_origin: { x: 0, y: 0 }, map_size: cells, pixels_per_grid: pixelsPerCell },
    line_of_sight: [[{ x: 1, y: 1 }, { x: cells.x - 1, y: 1 }]],
    portals: [],
    environment: { baked_lighting: false, ambient_light: 'ff808080' },
    lights: [{ position: { x: 2, y: 2 }, range: 4, intensity: 1, color: 'ffeccd8b', shadows: true }],
    image,
  })], 'Crypt.dd2vtt');
}

interface Scene { background: string; grid: { size: number }; objects: { walls: Record<string, { p1: { x: number; y: number }; p2: { x: number; y: number } }> } }

function sceneOf(b: Bench, result: UvttImported): Scene {
  return (JSON.parse(b.vault.files.get(result.scenePath)!) as { state: Scene }).state;
}

function arrived(result: Awaited<ReturnType<typeof importUvttFile>>): UvttImported {
  if (!result.ok) throw new Error(`Refused: ${result.problem}`);
  return result;
}

beforeEach(() => { AssetService.resetInstance(); });
afterAll(() => { disposeImageProcessing(); });

describe('importing a Universal VTT file with the image workers', () => {
  it.each(['image/png', 'image/webp', 'image/jpeg'])('saves a %s map as WebP of the same size, with a thumbnail, and puts the wall on it', async (type) => {
    const b = await bench();

    const result = arrived(await importUvttFile(b.deps, await mapFile({ x: 10, y: 8 }, 100, type), COLLECTION));

    const scene = sceneOf(b, result);
    const saved = new Blob([b.binaries.get(scene.background)!]);
    expect(new TextDecoder().decode((await saved.arrayBuffer()).slice(8, 12))).toBe('WEBP');
    expect(await imageDimensions(saved)).toEqual({ width: 1000, height: 800 });
    expect(scene.grid.size).toBe(100);
    expect(scene.objects.walls.wall_uvtt_1).toMatchObject({ p1: { x: 100, y: 100 }, p2: { x: 900, y: 100 } });
    const thumbnails = [...b.binaries.keys()].filter((path) => path.includes('/thumbnails/'));
    expect(thumbnails).toHaveLength(1);
    expect((await imageDimensions(new Blob([b.binaries.get(thumbnails[0]!)!])))?.width).toBeLessThanOrEqual(THUMBNAIL_SPEC.size);
    expect(result.scaledDown).toBeUndefined();
  });

  it('puts the walls on the image as it is saved when the image is larger than a map keeps', async () => {
    const b = await bench();

    const result = arrived(await importUvttFile(b.deps, await mapFile({ x: 200, y: 90 }, 100, 'image/jpeg'), COLLECTION));

    const scene = sceneOf(b, result);
    const saved = await imageDimensions(new Blob([b.binaries.get(scene.background)!]));
    expect(saved).toEqual({ width: 16383, height: 7372 });
    expect(result.scaledDown).toEqual({ from: { width: 20000, height: 9000 }, to: { width: 16383, height: 7372 } });
    const cell = 16383 / 200;
    expect(scene.grid.size).toBe(cell);
    expect(scene.objects.walls.wall_uvtt_1).toMatchObject({ p1: { x: cell, y: cell }, p2: { x: 199 * cell, y: cell } });
  });

  it('refuses a file whose image has a true header and a body no decoder reads, and leaves nothing', async () => {
    const b = await bench();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const file = JSON.parse(await (await mapFile({ x: 10, y: 8 }, 100, 'image/png')).text()) as { image: string };
    // The header (signature and IHDR, 33 bytes) is kept; what follows is no image data
    file.image = file.image.slice(0, 44) + btoa('x'.repeat(600));
    const before = [...b.vault.files.keys()].sort();

    const result = await importUvttFile(b.deps, new File([JSON.stringify(file)], 'Broken.dd2vtt'), COLLECTION);

    expect(result).toEqual({ ok: false, problem: 'The map image in the file could not be read.' });
    expect([...b.vault.files.keys()].sort()).toEqual(before);
    expect(b.binaries.size).toBe(0);
  });
});
