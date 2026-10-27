import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { imageDimensions, imageHeader } from '../../src/app/imageProcessing/imageDimensions';
import { IMAGE_PRESETS, disposeImageProcessing, optimizeImage } from '../../src/app/imageProcessing/imageProcessing';
import { importUvttFile, type UvttImportDeps, type UvttImported } from '../../src/app/import/uvtt/importUvttFile';
import { importUvttFloors, type UvttFloorsImported } from '../../src/app/import/uvtt/importUvttFloors';
import { floorNaming } from '../../src/app/import/uvtt/uvttFloorNames';
import { readUvttSource, type UvttSource } from '../../src/app/import/uvtt/uvttSource';
import { levelAlignmentsOf, levelImagePlacement } from '../../src/app/levels/levelAlignment';
import type { SceneLevel } from '../../src/app/types/sceneLevelTypes';
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

/**
 * A map of `cells` at `pixelsPerCell`, painted on a canvas and encoded as `type`, with one wall line
 * and a light; `origin` is the cell its image begins at, as a floor of several states it.
 */
async function mapFile(cells: { x: number; y: number }, pixelsPerCell: number, type: string, { origin = { x: 0, y: 0 }, name = 'Crypt.dd2vtt' } = {}): Promise<File> {
  const canvas = new OffscreenCanvas(cells.x * pixelsPerCell, cells.y * pixelsPerCell);
  const context = canvas.getContext('2d')!;
  context.fillStyle = '#b0a48e';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#18161a';
  context.fillRect(pixelsPerCell, pixelsPerCell - 4, canvas.width - 2 * pixelsPerCell, 8);
  const image = await base64Of(await canvas.convertToBlob({ type, quality: 0.9 }));
  return new File([JSON.stringify({
    format: 0.3,
    resolution: { map_origin: origin, map_size: cells, pixels_per_grid: pixelsPerCell },
    line_of_sight: [[{ x: origin.x + 1, y: origin.y + 1 }, { x: origin.x + cells.x - 1, y: origin.y + 1 }]],
    portals: [],
    environment: { baked_lighting: false, ambient_light: 'ff808080' },
    lights: [{ position: { x: origin.x + 2, y: origin.y + 2 }, range: 4, intensity: 1, color: 'ffeccd8b', shadows: true }],
    image,
  })], name);
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
  it.each([
    ['image/png', 'png', 'png'],
    ['image/webp', 'webp', 'webp'],
    ['image/jpeg', 'jpeg', 'jpg'],
  ] as const)('keeps a %s map as it is, with a thumbnail, and puts the wall on it', async (type, format, extension) => {
    const b = await bench();

    const result = arrived(await importUvttFile(b.deps, await mapFile({ x: 10, y: 8 }, 100, type), COLLECTION));

    const scene = sceneOf(b, result);
    const saved = new Blob([b.binaries.get(scene.background)!]);
    expect(scene.background.endsWith(`.${extension}`)).toBe(true);
    expect((await imageHeader(saved))?.format).toBe(format);
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

interface FloorsScene {
  background: string;
  grid: { size: number };
  levels: SceneLevel[];
  objects: { walls: Record<string, { p1: { x: number; y: number }; levels: string[] }>; lights: Record<string, { x: number; y: number; levels: string[] }> };
}

async function importFloors(b: Bench, files: File[]): Promise<{ result: UvttFloorsImported; scene: FloorsScene }> {
  const sources: UvttSource[] = [];
  for (const file of files) {
    const source = await readUvttSource(file);
    if ('ok' in source) throw new Error(source.problem);
    sources.push(source);
  }
  const naming = floorNaming(sources);
  const result = await importUvttFloors(b.deps, naming.floors.map(({ file, name }) => ({ source: file, name })), naming.sceneName, COLLECTION);
  if (!result.ok) throw new Error(`Refused: ${result.problem}`);
  return { result, scene: (JSON.parse(b.vault.files.get(result.scenePath)!) as { state: FloorsScene }).state };
}

/** Where a level's image shows the image pixel `pixel`, in world pixels. */
function worldOf(scene: FloorsScene, level: SceneLevel, pixel: { x: number; y: number }): { x: number; y: number } {
  const placement = levelImagePlacement({ levels: scene.levels, grid: null, levelAlignments: levelAlignmentsOf(scene.levels) }, level.id);
  return { x: (placement.offset?.x ?? 0) + pixel.x * placement.x, y: (placement.offset?.y ?? 0) + pixel.y * placement.y };
}

describe('importing Universal VTT floors with the image workers', () => {
  it('saves each floor\'s image and places a smaller upper floor by its origin, its wall on its art', async () => {
    const b = await bench();
    const ground = await mapFile({ x: 20, y: 16 }, 100, 'image/png', { name: 'Keep_0.dd2vtt' });
    const tower = await mapFile({ x: 8, y: 6 }, 100, 'image/webp', { origin: { x: 6, y: 5 }, name: 'Keep_1.dd2vtt' });

    const { result, scene } = await importFloors(b, [tower, ground]);

    expect(result).toMatchObject({ name: 'Keep', levels: 2, scaledDown: [] });
    const [first, second] = scene.levels;
    expect(scene.background).toBe(first!.background);
    expect(await imageDimensions(new Blob([b.binaries.get(first!.background!)!]))).toEqual({ width: 2000, height: 1600 });
    expect(await imageDimensions(new Blob([b.binaries.get(second!.background!)!]))).toEqual({ width: 800, height: 600 });
    expect((await imageHeader(new Blob([b.binaries.get(second!.background!)!])))?.format).toBe('webp');
    expect(scene.grid.size).toBe(100);
    // The tower's wall is painted 100 pixels into its own image, which the scene draws 600, 500 further in
    const towerWall = Object.values(scene.objects.walls).find((wall) => wall.levels[0] === second!.id)!;
    expect(towerWall.p1).toEqual(worldOf(scene, second!, { x: 100, y: 100 }));
    expect(towerWall.p1).toEqual({ x: 700, y: 600 });
    const thumbnails = [...b.binaries.keys()].filter((path) => path.includes('/thumbnails/'));
    expect(thumbnails).toHaveLength(2);
  });

  it('fits a floor whose image was larger than a map keeps to the scene\'s grid, its wall on its art', async () => {
    const b = await bench();
    const cellar = await mapFile({ x: 10, y: 8 }, 100, 'image/jpeg', { name: 'Hall-_00.dd2vtt' });
    const hall = await mapFile({ x: 200, y: 90 }, 100, 'image/jpeg', { name: 'Hall-_01.dd2vtt' });

    const { result, scene } = await importFloors(b, [cellar, hall]);

    expect(result.scaledDown).toEqual(['Hall-_01.dd2vtt']);
    const upper = scene.levels[1]!;
    expect(await imageDimensions(new Blob([b.binaries.get(upper.background!)!]))).toEqual({ width: 16383, height: 7372 });
    expect(scene.grid.size).toBe(100);
    expect(upper.alignment).toEqual({ offset: { x: 0, y: 0 }, scale: 100 / (16383 / 200), stretch: { x: 1, y: 1 } });
    // Its wall begins a cell into its art, which the saved image holds at 16383 / 200 pixels a cell
    const wall = Object.values(scene.objects.walls).find((candidate) => candidate.levels[0] === upper.id)!;
    const onArt = worldOf(scene, upper, { x: 16383 / 200, y: 16383 / 200 });
    expect(wall.p1.x).toBeCloseTo(onArt.x, 6);
    expect(wall.p1.y).toBeCloseTo(onArt.y, 6);
  });
});
