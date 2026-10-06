// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importUvttFile, type UvttImportDeps, type UvttImportResult, type UvttImported } from '../../src/app/import/uvtt/importUvttFile';
import { parseUvtt } from '../../src/app/import/uvtt/parseUvtt';
import { uvttImportSummary } from '../../src/app/import/uvtt/runUvttImport';
import { uvttToScene } from '../../src/app/import/uvtt/uvttToScene';
import { UVTT_LIMITS } from '../../src/app/import/uvtt/uvttTypes';
import { MEMORY_BUDGET_BYTES, type ProcessedImage } from '../../src/app/imageProcessing/imageProcessing';
import { sealTolerance } from '../../src/app/lighting/lightingConstants';
import { readSceneLighting } from '../../src/app/lighting/sceneLightingOptions';
import { sealWalls } from '../../src/app/lighting/sealWalls';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { AssetThumbnailService } from '../../src/app/services/AssetThumbnailService';
import { createAtlasStorage, migrateMapFile, parseSceneFile } from '../../src/app/services/MapPersistence';
import type { GridState } from '../../src/app/types/gridTypes';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import type { CollectionGridDefaults } from '../../src/app/types/collectionSettingsTypes';
import type { SceneLighting } from '../../src/app/types/lightingTypes';
import type { WallSegment } from '../../src/app/types/wallTypes';
import { base64Of, cryptFile, cryptSetting, cryptWith, pngHeader } from '../fixtures/uvttFiles';
import { createInMemoryApp, interceptWrites, type InMemoryApp } from '../mocks/inMemoryVault';

// Wall-clock bound of the two timed tests here. Sealing an imported map's walls takes a few
// milliseconds and refusing a hostile file under half a second; joining every pair of 20,000
// crowded wall ends, which they guard against, took minutes. A machine under load stays below it.
const SLOW = 15_000;

const COLLECTION = 'Dungeons';
const SCENES = `atlas-vtt/collections/${COLLECTION}/scenes`;
const FEET = { unitType: 'feet', unitDistance: 5 } as const;

interface Bench {
  vault: InMemoryApp;
  assets: AssetService;
  deps: UvttImportDeps;
  convertImage: ReturnType<typeof vi.fn<UvttImportDeps['convertImage']>>;
}

/** What the image workers return for an image that fits a map: the image itself and a thumbnail. */
const converted = (image: Blob): ProcessedImage => ({ image, thumbnail: new Blob(['THUMB']), preview: null, sourcePreview: null });

async function bench(): Promise<Bench> {
  const vault = createInMemoryApp();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection(COLLECTION);
  const convertImage = vi.fn<UvttImportDeps['convertImage']>(async (image) => converted(image));
  const thumbnails = new AssetThumbnailService(vault.app, assets, async () => new ArrayBuffer(0));
  return { vault, assets, convertImage, deps: { app: vault.app, assetService: assets, convertImage, thumbnails } };
}

const uvttFile = (content: unknown, name = 'Crypt.dd2vtt'): File => new File([typeof content === 'string' ? content : JSON.stringify(content)], name);

function arrived(result: UvttImportResult): UvttImported {
  if (!result.ok) throw new Error(`Refused: ${result.problem}`);
  return result;
}

function problemOf(result: UvttImportResult): string {
  if (result.ok) throw new Error('The file was imported');
  return result.problem;
}

interface SceneState {
  background: string;
  grid: GridState;
  objects: { walls: Record<string, unknown>; lights: Record<string, { emission: { bright: number; dim: number }; hidden?: boolean }> };
  lighting: SceneLighting;
  tokenSettings: Record<string, unknown>;
}

const sceneState = ({ vault }: Bench, path: string): SceneState => (JSON.parse(vault.files.get(path)!) as { state: SceneState }).state;
const filesOf = ({ vault }: Bench): string[] => [...vault.files.keys()].sort();
const recordsOf = async ({ assets }: Bench): Promise<Asset[]> => assets.getAssets(COLLECTION);

beforeEach(() => { vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); AssetService.resetInstance(); });

describe('importing a Universal VTT file', () => {
  it('adds a map and a scene of the same name, with the image, its thumbnail and the file\'s walls, doors and lights', async () => {
    const b = await bench();

    const result = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    expect(result).toMatchObject({ name: 'Crypt', scenePath: `${SCENES}/Crypt.atlasmap`, counts: { walls: 10, doors: 1, lights: 1 }, lightsOff: false });
    const records = await recordsOf(b);
    const map = records.find((record) => record.type === 'map');
    const scene = records.find((record) => record.type === 'scene');
    expect(records).toHaveLength(2);
    expect(map).toMatchObject({ name: 'Crypt', tags: [], collection: COLLECTION });
    expect(scene).toMatchObject({ name: 'Crypt', tags: [], collection: COLLECTION, data: { mapPath: result.scenePath } });
    if (map?.type !== 'map' || scene?.type !== 'scene') throw new Error('Records are missing');

    expect(map.mapFilePath).toMatch(/^atlas-vtt\/assets\/Crypt_.+\.webp$/);
    expect(b.vault.files.has(map.mapFilePath)).toBe(true);
    expect(b.vault.files.get(map.thumbnailPath!)).toBe('THUMB');
    expect(JSON.parse(b.vault.files.get(map.filePath!)!)).toMatchObject({ id: map.id, name: 'Crypt', mapFilePath: map.mapFilePath });
    expect(JSON.parse(b.vault.files.get(scene.filePath!)!)).toEqual({
      mapPath: result.scenePath,
      atlasRecord: expect.objectContaining({ id: scene.id, type: 'scene', name: 'Crypt' }),
    });

    const state = sceneState(b, result.scenePath);
    expect(state.background).toBe(map.mapFilePath);
    expect(state.lighting).toEqual({ enabled: true, ambient: 0.5 });
    expect(Object.keys(state.objects.walls)).toHaveLength(11);
    expect(Object.keys(state.objects.lights)).toHaveLength(1);
  });

  it('hands the workers the image as its own bytes say it is', async () => {
    const b = await bench();

    await importUvttFile(b.deps, uvttFile(cryptSetting('image', `data:image/webp;base64,${base64Of(pngHeader(1000, 800))}`)), COLLECTION);

    const source = b.convertImage.mock.calls[0]![0];
    expect(source.type).toBe('image/png');
    expect([...new Uint8Array(await source.arrayBuffer())]).toEqual([...pngHeader(1000, 800)]);
  });

  it('writes a scene whose grid is the file\'s, with nothing left to detect', async () => {
    const b = await bench();

    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    const { grid } = sceneState(b, scenePath);
    expect(grid).toMatchObject({ enabled: true, visible: true, type: 'square', size: 100, offsetX: 0, offsetY: 0 });
    expect(grid).not.toHaveProperty('autoDetect');
  });

  it('survives the checks a scene passes when it is opened, with every wall and light in place', async () => {
    const b = await bench();
    const parsed = parseUvtt(JSON.stringify(cryptFile()));
    if (!parsed.ok) throw new Error(parsed.problem);
    const expected = uvttToScene(parsed.map, { cellSize: 100, unit: FEET });

    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    const loaded = migrateMapFile(parseSceneFile(b.vault.files.get(scenePath)!).state);
    expect(loaded.objects.walls).toEqual(expected.walls);
    expect(loaded.objects.lights).toEqual(expected.lights);
    expect(loaded.grid).toMatchObject(expected.grid);
    expect(loaded.objects).toMatchObject({ tokens: {}, fog: {}, pins: {}, texts: {}, drawings: {} });

    const storage = createAtlasStorage<{ mapPath: string }, SceneState>(b.vault.app, { getState: () => ({ mapPath: scenePath }) });
    const stored = await storage.getItem('atlas');
    expect(stored?.version).toBe(4);
    expect(stored?.state.objects.walls).toEqual(expected.walls);
    expect(stored?.state.objects.lights).toEqual(expected.lights);
    expect(readSceneLighting(stored?.state.lighting)).toEqual({ enabled: true, ambient: 0.5 });
  });

  it('loads into a view\'s store lit, with its walls, its door and its light', async () => {
    const b = await bench();
    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    const store = createViewAtlasStore(b.vault.app, `uvtt-import-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(scenePath);
    await store.rehydrateFromFile();

    const state = store.getState();
    const walls = Object.values(state.objects.walls);
    expect(state.lighting).toEqual({ enabled: true, ambient: 0.5 });
    expect(walls.filter((wall) => wall.type === 'solid')).toHaveLength(10);
    expect(walls.filter((wall) => wall.type === 'door')).toEqual([
      { id: 'wall_uvtt_11', kind: 'wall', type: 'door', closed: true, p1: { x: 450, y: 325 }, p2: { x: 450, y: 425 } },
    ]);
    expect(Object.values(state.objects.lights)).toEqual([
      { id: 'light_uvtt_1', kind: 'light', x: 250, y: 250, emission: { bright: 15, dim: 30, color: '#eccd8b', intensity: 1, animation: 'none', kind: 'custom' } },
    ]);
    expect(state.grid).toMatchObject({ size: 100, offsetX: 0, offsetY: 0, type: 'square' });
    expect(state.background).toMatch(/^atlas-vtt\/assets\/Crypt_/);
  });

  it.each<[string, CollectionGridDefaults, number, number, Partial<GridState>]>([
    ['feet', { unitType: 'feet', unitDistance: 5, measurementMode: 'metric' }, 15, 30, { unitType: 'feet', unitDistance: 5, measurementType: 'units' }],
    ['metres', { unitType: 'meters', unitDistance: 1.5, measurementMode: 'metric' }, 4.5, 9, { unitType: 'meters', unitDistance: 1.5, measurementType: 'units' }],
    ['range bands', { unitType: 'feet', unitDistance: 5, measurementMode: 'abstract', abstractRangeBands: [{ name: 'Close', maxSquares: 6 }] }, 15, 30, { unitType: 'feet', unitDistance: 5, measurementType: 'abstract' }],
    ['range bands of ten feet a square', { unitType: 'feet', unitDistance: 10, measurementMode: 'abstract' }, 30, 60, { unitDistance: 10, measurementType: 'abstract' }],
  ])('gives lights their ranges in what a collection measuring in %s counts', async (_label, gridDefaults, bright, dim, grid) => {
    const b = await bench();
    await b.assets.updateCollectionSettings(COLLECTION, { gridDefaults });

    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    const state = sceneState(b, scenePath);
    expect(state.objects.lights.light_uvtt_1!.emission).toMatchObject({ bright, dim });
    expect(state.grid).toMatchObject(grid);
  });

  it('places walls on the image as it is saved when a large image was scaled down', async () => {
    const b = await bench();
    const file = cryptWith((crypt) => {
      crypt.resolution = { map_origin: { x: 0, y: 0 }, map_size: { x: 40, y: 30 }, pixels_per_grid: 256 };
      crypt.image = base64Of(pngHeader(10240, 7680));
    });
    const scaledDown = { from: { width: 10240, height: 7680 }, to: { width: 8192, height: 6144 } };
    b.convertImage.mockImplementation(async () => ({ ...converted(new Blob([pngHeader(8192, 6144)])), scaledDown }));

    const result = arrived(await importUvttFile(b.deps, uvttFile(file), COLLECTION));

    const state = sceneState(b, result.scenePath);
    expect(state.grid.size).toBe(204.8);
    expect(state.objects.walls.wall_uvtt_1).toMatchObject({ p1: { x: 204.8, y: 204.8 }, p2: { x: 9 * 204.8, y: 204.8 } });
    expect(result.scaledDown).toEqual(scaledDown);
  });

  it('takes an image longer than 16,384 pixels on a side while its pixels fit the image workers\' memory', async () => {
    const b = await bench();
    // The size of a real export: 114 × 64 cells at 150 pixels
    const file = cryptWith((crypt) => {
      crypt.resolution = { map_origin: { x: 0, y: 0 }, map_size: { x: 114, y: 64 }, pixels_per_grid: 150 };
      crypt.image = base64Of(pngHeader(17_100, 9_600));
    });
    b.convertImage.mockImplementation(async () => converted(new Blob([pngHeader(8192, 4599)])));

    const result = arrived(await importUvttFile(b.deps, uvttFile(file), COLLECTION));

    expect(sceneState(b, result.scenePath).grid.size).toBe(8192 / 114);
    expect(UVTT_LIMITS.imagePixels).toBe(MEMORY_BUDGET_BYTES / 4);
    expect(UVTT_LIMITS.imagePixels).toBeGreaterThan(17_100 * 9_600);
  });

  it('imports baked lights switched off, on a scene in daylight', async () => {
    const b = await bench();

    const result = arrived(await importUvttFile(b.deps, uvttFile(cryptSetting('environment.baked_lighting', true)), COLLECTION));

    const state = sceneState(b, result.scenePath);
    expect(result.lightsOff).toBe(true);
    expect(state.objects.lights.light_uvtt_1!.hidden).toBe(true);
    expect(state.lighting).toEqual({ enabled: true, ambient: 1 });
  });

  it('numbers the name when a scene already carries it', async () => {
    const b = await bench();

    const first = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));
    const second = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));
    const third = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    expect([first.name, second.name, third.name]).toEqual(['Crypt', 'Crypt 2', 'Crypt 3']);
    expect(third.scenePath).toBe(`${SCENES}/Crypt 3.atlasmap`);
    expect((await recordsOf(b)).filter((record) => record.type === 'scene').map((record) => record.name).sort()).toEqual(['Crypt', 'Crypt 2', 'Crypt 3']);
  });

  it('writes its files and records as one step, so the vault check finds nothing to add or drop', async () => {
    const b = await bench();
    let locked = false;
    const runExclusive = b.assets.runExclusive.bind(b.assets);
    vi.spyOn(b.assets, 'runExclusive').mockImplementation(async (task) => {
      locked = true;
      try { return await runExclusive(task); } finally { locked = false; }
    });
    const unlockedWrites: string[] = [];
    let lockedWrites = 0;
    for (const method of ['create', 'createBinary']) {
      interceptWrites(b.vault.app.vault, method, (path) => {
        if (locked) lockedWrites++;
        else unlockedWrites.push(path);
      });
    }

    arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));
    const before = await recordsOf(b);
    await b.assets.reconcileWithVault();

    // The image, the scene file and the two record files
    expect(lockedWrites).toBeGreaterThanOrEqual(4);
    expect(unlockedWrites).toEqual([]);
    expect(await recordsOf(b)).toEqual(before);
    expect(before.map((record) => record.type).sort()).toEqual(['map', 'scene']);
  });

  it('cuts walls that reach far beyond the map, so the scene opens at once', async () => {
    const b = await bench();
    const file = cryptWith((crypt) => {
      crypt.line_of_sight = Array.from({ length: 150 }, (_, i) => [{ x: -16_384, y: i * 0.05 - 300 }, { x: 16_384, y: i * 0.05 + 300 }]);
      crypt.objects_line_of_sight = [];
    });

    const result = arrived(await importUvttFile(b.deps, uvttFile(file), COLLECTION));

    const state = sceneState(b, result.scenePath);
    const walls = Object.values(state.objects.walls) as WallSegment[];
    for (const point of walls.flatMap((wall) => [wall.p1, wall.p2])) {
      expect(Math.abs(point.x - 500)).toBeLessThanOrEqual(600);
      expect(Math.abs(point.y - 400)).toBeLessThanOrEqual(500);
    }
    expect(result.counts.walls).toBe(150);
    const started = performance.now();
    sealWalls(walls, sealTolerance(2));
    expect(performance.now() - started).toBeLessThan(SLOW);
  });

  it('places a wall across a map of one cell on a large image on that image', async () => {
    const b = await bench();
    const file = cryptWith((crypt) => {
      crypt.resolution = { map_origin: { x: 0, y: 0 }, map_size: { x: 1, y: 1 }, pixels_per_grid: 4096 };
      crypt.image = base64Of(pngHeader(8192, 8192));
      crypt.line_of_sight = [[{ x: -16_384, y: 0.5 }, { x: 16_384, y: 0.5 }]];
      crypt.objects_line_of_sight = [];
      crypt.portals = [];
      crypt.lights = [];
    });

    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(file), COLLECTION));

    expect(sceneState(b, scenePath).objects.walls).toEqual({
      wall_uvtt_1: { id: 'wall_uvtt_1', kind: 'wall', type: 'solid', chainId: 'chain_uvtt_1', p1: { x: -8192, y: 4096 }, p2: { x: 16_384, y: 4096 } },
    });
  });

  it('gives a new scene of the collection its token settings', async () => {
    const b = await bench();
    await b.assets.updateCollectionSettings(COLLECTION, { defaultWidgets: { hpBar: true, stressBar: false } });

    const { scenePath } = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    expect(sceneState(b, scenePath).tokenSettings).toMatchObject({ showHPBars: true, showStressBars: false, showNameplates: false });
  });
});

describe('a Universal VTT file that is refused', () => {
  const refusals: Array<[string, () => File, string]> = [
    ['is larger than 150 MB', () => new File([new Uint8Array(UVTT_LIMITS.fileBytes + 1)], 'huge.dd2vtt'), 'The file is larger than 150 MB.'],
    ['is not JSON', () => uvttFile('PK\x03\x04 not a map'), 'The file is not a Universal VTT map (it is not valid JSON).'],
    ['has a wall point that is not a number', () => uvttFile(cryptSetting('line_of_sight.0.0.x', 'a')), 'Point 1 of wall line 1 (x) is missing or not a number.'],
    ['holds an image that is no image', () => uvttFile(cryptSetting('image', base64Of(new TextEncoder().encode('MZ executable')))), 'The map image in the file is not a PNG, WebP or JPEG image.'],
    ['holds an image whose header ends early', () => uvttFile(cryptSetting('image', base64Of(pngHeader(1000, 800).slice(0, 12)))), 'The map image in the file could not be read.'],
    ['holds an image of another shape than the map', () => uvttFile(cryptSetting('image', base64Of(pngHeader(1000, 1000)))), 'The map image is 1000 × 1000 pixels, which does not fit a map of 10 × 8 squares.'],
    ['holds an image with too few pixels for its grid', () => uvttFile(cryptWith((crypt) => {
      crypt.resolution = { map_size: { x: 400, y: 300 }, pixels_per_grid: 2 };
      crypt.image = base64Of(pngHeader(800, 600));
    })), 'The map image is too small for its grid: 800 × 600 pixels for 400 × 300 squares.'],
    ['states an origin that puts its walls and lights off the image', () => uvttFile(cryptSetting('resolution.map_origin', { x: 500, y: 500 })), 'Nothing in the file lies on its map image: its walls, doors and lights are all outside it.'],
    ['holds an image with more pixels than the image workers decode', () => uvttFile(cryptSetting('image', base64Of(pngHeader(20_000, 16_000)))), 'The map image is too large to open: 20000 × 16000 pixels.'],
  ];

  it.each(refusals)('when it %s, changes nothing', async (_label, file, problem) => {
    const b = await bench();
    const before = filesOf(b);

    expect(problemOf(await importUvttFile(b.deps, file(), COLLECTION))).toBe(problem);

    expect(filesOf(b)).toEqual(before);
    expect(await recordsOf(b)).toEqual([]);
    expect(b.convertImage).not.toHaveBeenCalled();
  });

  it('when the collection is gone, changes nothing', async () => {
    const b = await bench();
    const before = filesOf(b);

    expect(problemOf(await importUvttFile(b.deps, uvttFile(cryptFile()), 'Gone'))).toBe('The collection no longer exists. Choose another collection and try again.');

    expect(filesOf(b)).toEqual(before);
  });

  it('when the collection is deleted while the image is converted, does not bring it back', async () => {
    const b = await bench();
    b.convertImage.mockImplementation(async (image) => {
      await b.assets.deleteCollection(COLLECTION);
      return converted(image);
    });

    expect(problemOf(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION))).toBe('The collection no longer exists. Choose another collection and try again.');

    expect(filesOf(b).filter((path) => path.includes(COLLECTION) || path.startsWith('atlas-vtt/assets/'))).toEqual([]);
    expect([...b.vault.folders].filter((path) => path.includes(COLLECTION))).toEqual([]);
    await b.assets.reconcileWithVault();
    expect((await b.assets.getCollections()).map((collection) => collection.id)).not.toContain(COLLECTION);
  });

  it('when the workers cannot decode its image, changes nothing', async () => {
    const b = await bench();
    const before = filesOf(b);
    b.convertImage.mockRejectedValue(new Error('The source image could not be decoded.'));

    expect(problemOf(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION))).toBe('The map image in the file could not be read.');

    expect(filesOf(b)).toEqual(before);
    expect(await recordsOf(b)).toEqual([]);
  });

  it('when the decoded image is not the size its header stated, changes nothing', async () => {
    const b = await bench();
    const before = filesOf(b);
    b.convertImage.mockImplementation(async () => converted(new Blob([pngHeader(640, 640)])));

    expect(problemOf(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION))).toBe('The map image is 640 × 640 pixels, which does not fit a map of 10 × 8 squares.');

    expect(filesOf(b)).toEqual(before);
  });

  it('when the saved image has too few pixels for its grid, changes nothing', async () => {
    const b = await bench();
    const before = filesOf(b);
    b.convertImage.mockImplementation(async () => converted(new Blob([pngHeader(50, 40)])));

    expect(problemOf(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION))).toBe('The map image is too small for its grid: 50 × 40 pixels for 10 × 8 squares.');

    expect(filesOf(b)).toEqual(before);
  });

  it.each([
    ['20,000 walls that cross the map almost on top of each other', (i: number) => [{ x: -16_384, y: -16_384 + i }, { x: 16_384, y: 16_384 - i }]],
    ['20,000 walls that fan out from one point', (i: number) => [{ x: 5, y: 4 }, { x: 5 + 3 * Math.cos(i), y: 4 + 3 * Math.sin(i) }]],
  ])('when it holds %s, changes nothing and takes no time over it', async (_label, line) => {
    const b = await bench();
    const before = filesOf(b);
    const file = uvttFile(cryptWith((crypt) => { crypt.line_of_sight = Array.from({ length: 20_000 }, (_, i) => line(i)); crypt.objects_line_of_sight = []; crypt.portals = []; }));

    const started = performance.now();
    const problem = problemOf(await importUvttFile(b.deps, file, COLLECTION));

    expect(performance.now() - started).toBeLessThan(SLOW);
    expect(problem).toBe('The walls in the file end too close together in too many places for Atlas to join them.');
    expect(filesOf(b)).toEqual(before);
    expect(b.convertImage).not.toHaveBeenCalled();
  });

  it('when it is too large, is not read at all', async () => {
    const b = await bench();
    const file = uvttFile(cryptFile());
    Object.defineProperty(file, 'size', { value: UVTT_LIMITS.fileBytes + 1 });
    const read = vi.fn((): Promise<never> => Promise.reject(new Error('The file was read')));
    Object.assign(file, { text: read, arrayBuffer: read, stream: read, slice: read });

    expect(problemOf(await importUvttFile(b.deps, file, COLLECTION))).toBe('The file is larger than 150 MB.');

    expect(read).not.toHaveBeenCalled();
  });

  it('when it is just within the size limit, is read', async () => {
    const b = await bench();
    const file = uvttFile(cryptFile());
    Object.defineProperty(file, 'size', { value: UVTT_LIMITS.fileBytes });

    expect(arrived(await importUvttFile(b.deps, file, COLLECTION)).name).toBe('Crypt');
  });

  it('never throws, even when the file cannot be read at all', async () => {
    const b = await bench();
    const file = uvttFile(cryptFile());
    file.text = (): Promise<string> => Promise.reject(new Error('NotReadableError'));

    expect(problemOf(await importUvttFile(b.deps, file, COLLECTION))).toBe('The file could not be imported.');
  });
});

describe('an import that fails half way', () => {
  /** Runs an import in which the write to a path matching `failing` is refused, then lets writes through again. */
  async function failingAt(b: Bench, failing: RegExp, through: 'create' | 'adapter'): Promise<UvttImportResult> {
    const { vault } = b.vault.app;
    let refused = 0;
    const restore = interceptWrites(through === 'create' ? vault : vault.adapter, through === 'create' ? 'create' : 'write', (path) => {
      if (!failing.test(path)) return;
      refused++;
      throw new Error('EIO: i/o error');
    });
    try {
      return await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION);
    } finally {
      restore();
      // A failed save of the index is followed by one that puts the library files back, which meets the refusal again.
      expect(refused).toBeGreaterThanOrEqual(1);
    }
  }

  it.each<[string, RegExp, 'create' | 'adapter']>([
    ['the scene file cannot be written', /\.atlasmap$/, 'create'],
    ['the map\'s record file cannot be written', /\/maps\/map-.+\.json$/, 'create'],
    ['the scene\'s record file cannot be written', /\/scenes\/scene-.+\.json$/, 'create'],
    ['the asset index cannot be saved', /assets-metadata\.json$/, 'adapter'],
  ])('leaves no file and no record when %s', async (_label, failing, through) => {
    const b = await bench();
    const before = filesOf(b);
    const index = b.vault.files.get([...b.vault.files.keys()].find((path) => path.endsWith('assets-metadata.json'))!);

    const result = await failingAt(b, failing, through);

    expect(problemOf(result)).toBe('The map could not be saved. Nothing was added.');
    expect(filesOf(b)).toEqual(before);
    expect(await recordsOf(b)).toEqual([]);
    await b.assets.refreshMetadata();
    expect(await recordsOf(b)).toEqual([]);
    expect(b.vault.files.get([...b.vault.files.keys()].find((path) => path.endsWith('assets-metadata.json'))!)).toBe(index);
  });

  it('leaves the vault ready for the same import to succeed afterwards', async () => {
    const b = await bench();

    await failingAt(b, /assets-metadata\.json$/, 'adapter');
    const result = arrived(await importUvttFile(b.deps, uvttFile(cryptFile()), COLLECTION));

    expect(result.name).toBe('Crypt');
    expect(await recordsOf(b)).toHaveLength(2);
  });

  it('names the files it could not remove again', async () => {
    const b = await bench();
    vi.spyOn(b.vault.app.fileManager, 'trashFile').mockRejectedValue(new Error('EPERM'));

    const problem = problemOf(await failingAt(b, /assets-metadata\.json$/, 'adapter'));

    expect(problem).toMatch(/^The map could not be saved\. These files could not be removed again: /);
    expect(problem).toContain(`${SCENES}/Crypt.atlasmap`);
    expect(await recordsOf(b)).toEqual([]);
  });

  it('names the image and its thumbnail when those are what it could not remove again', async () => {
    const b = await bench();
    const remove = vi.spyOn(b.vault.app.fileManager, 'trashFile');
    const removeForReal = remove.getMockImplementation()!;
    remove.mockImplementation(async (file) => {
      if (file.path.startsWith('atlas-vtt/assets/')) throw new Error('EPERM');
      return removeForReal(file);
    });

    const problem = problemOf(await failingAt(b, /\.atlasmap$/, 'create'));

    const images = filesOf(b).filter((path) => path.startsWith('atlas-vtt/assets/'));
    expect(images).toHaveLength(2);
    expect(images.some((path) => path.includes('/thumbnails/'))).toBe(true);
    expect(problem).toBe(`The map could not be saved. These files could not be removed again: ${[...images].sort((a, b) => Number(a.includes('/thumbnails/')) - Number(b.includes('/thumbnails/'))).join(', ')}.`);
    expect(filesOf(b).filter((path) => path.endsWith('.atlasmap'))).toEqual([]);
  });
});

describe('the notice of an import', () => {
  const imported: UvttImported = { ok: true, name: 'Crypt', scenePath: `${SCENES}/Crypt.atlasmap`, counts: { walls: 412, doors: 9, lights: 14 }, lightsOff: false };

  it('counts what arrived', () => {
    expect(uvttImportSummary(imported)).toBe('Imported "Crypt": 412 walls, 9 doors, 14 lights.');
    expect(uvttImportSummary(imported, false)).toBe('Imported "Crypt": 412 walls, 9 doors, 14 lights. They show once you switch on dynamic lighting under Experimental features in the command palette.');
    expect(uvttImportSummary({ ...imported, counts: { walls: 1, doors: 1, lights: 1 } })).toBe('Imported "Crypt": 1 wall, 1 door, 1 light.');
    expect(uvttImportSummary({ ...imported, counts: { walls: 20000, doors: 0, lights: 0 } })).toBe('Imported "Crypt": 20,000 walls, 0 doors, 0 lights.');
  });

  it('says when the lights are off and when the image lost pixels', () => {
    const scaledDown = { from: { width: 10240, height: 7680 }, to: { width: 8192, height: 6144 } };

    expect(uvttImportSummary({ ...imported, lightsOff: true, scaledDown })).toBe(
      'Imported "Crypt": 412 walls, 9 doors, 14 lights. The lights are switched off, because the image already shows their glow. The image was scaled down to 8192 × 6144 pixels.',
    );
  });
});
