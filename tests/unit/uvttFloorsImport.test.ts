// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { UvttImportDeps } from '../../src/app/import/uvtt/importUvttFile';
import { importUvttFloors, type UvttFloorsImported, type UvttFloorsResult } from '../../src/app/import/uvtt/importUvttFloors';
import { floorNaming } from '../../src/app/import/uvtt/uvttFloorNames';
import { readUvttSource, type UvttSource } from '../../src/app/import/uvtt/uvttSource';
import type { ProcessedImage } from '../../src/app/imageProcessing/imageProcessing';
import { levelImagePlacement } from '../../src/app/levels/levelAlignment';
import { levelObjects } from '../../src/app/levels/levelObjects';
import { prebuildMapImageAt } from '../../src/app/pixi/mapImage/prebuildMapImage';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { AssetThumbnailService } from '../../src/app/services/AssetThumbnailService';
import { parseSceneFile } from '../../src/app/services/MapPersistence';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { daTowerFloor, floorFile, keepFloor, webpHeader } from '../fixtures/uvttFloorFiles';
import { createInMemoryApp, interceptWrites, type InMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/pixi/mapImage/prebuildMapImage', () => ({ prebuildMapImageAt: vi.fn() }));

const COLLECTION = 'Dungeons';

interface Bench {
  vault: InMemoryApp;
  assets: AssetService;
  deps: UvttImportDeps;
  convertImage: ReturnType<typeof vi.fn<UvttImportDeps['convertImage']>>;
}

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

async function sources(...files: [unknown, string][]): Promise<UvttSource[]> {
  const read = await Promise.all(files.map(([content, name]) => readUvttSource(floorFile(content, name))));
  return read.map((source) => {
    if ('ok' in source) throw new Error(source.problem);
    return source;
  });
}

/** Imports `files` as the floors of one scene, in the order and with the names the import suggests. */
async function importFloors(b: Bench, ...files: [unknown, string][]): Promise<UvttFloorsResult> {
  const naming = floorNaming(await sources(...files));
  return importUvttFloors(b.deps, naming.floors.map(({ file, name }) => ({ source: file, name })), naming.sceneName, COLLECTION);
}

function arrived(result: UvttFloorsResult): UvttFloorsImported {
  if (!result.ok) throw new Error(`Refused: ${result.problem}`);
  return result;
}

const problemOf = (result: UvttFloorsResult): string => {
  if (result.ok) throw new Error('The files were imported');
  return result.problem;
};

const tower = (): [unknown, string][] => [2, 0, 1].map((floor) => [daTowerFloor(floor), `tower_floor_${floor}.dd2vtt`]);
const filesOf = ({ vault }: Bench): string[] => [...vault.files.keys()].sort();
const recordsOf = ({ assets }: Bench): Promise<Asset[]> => assets.getAssets(COLLECTION);

async function loaded(b: Bench, scenePath: string): Promise<ReturnType<typeof createViewAtlasStore>> {
  const store = createViewAtlasStore(b.vault.app, `uvtt-floors-${Math.random()}`);
  store.getState().setPersistenceEnabled(false);
  store.getState().setMapPath(scenePath);
  await store.rehydrateFromFile();
  return store;
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.mocked(prebuildMapImageAt).mockClear();
});
afterEach(() => { vi.restoreAllMocks(); AssetService.resetInstance(); });

describe('Universal VTT files imported as the floors of one scene', () => {
  it('add a map of each floor and one scene with a level each, bottom first, written as a scene of several levels', async () => {
    const b = await bench();

    const result = arrived(await importFloors(b, ...tower()));

    expect(result).toMatchObject({ name: 'tower', levels: 3, counts: { walls: 12, doors: 1, lights: 0 }, lightsOff: false, scaledDown: [] });
    const records = await recordsOf(b);
    expect(records.map((record) => [record.type, record.name]).sort()).toEqual([
      ['map', 'tower, Level 1'], ['map', 'tower, Level 2'], ['map', 'tower, Level 3'], ['scene', 'tower'],
    ]);
    const file = parseSceneFile(b.vault.files.get(result.scenePath)!);
    expect(file.version).toBe(5);
    expect(file.state.version).toBe(5);
    const { levels, background } = file.state;
    expect(levels?.map(({ name, elevation }) => ({ name, elevation }))).toEqual([
      { name: 'Level 1', elevation: { bottom: 0, top: 10 } },
      { name: 'Level 2', elevation: { bottom: 10, top: 20 } },
      { name: 'Level 3', elevation: { bottom: 20, top: 30 } },
    ]);
    const maps = records.filter((record) => record.type === 'map').sort((a, c) => a.name.localeCompare(c.name)) as { mapFilePath: string }[];
    expect(levels?.map((level) => level.background)).toEqual(maps.map((map) => map.mapFilePath));
    expect(background).toBe(maps[0]!.mapFilePath);
    // Floors on one canvas need no alignment of their own
    expect(levels?.some((level) => level.alignment)).toBe(false);
    expect(prebuildMapImageAt).toHaveBeenCalledTimes(3);
  });

  it('put each floor\'s walls, doors and lights on its level alone, with ids no other floor uses', async () => {
    const b = await bench();
    const { scenePath } = arrived(await importFloors(b, ...tower()));

    const store = await loaded(b, scenePath);
    const levels = store.getState().levels!;
    const shown = levels.map((level) => {
      store.getState().setViewedLevel(level.id);
      return Object.values(levelObjects(store.getState()).walls);
    });
    // Each floor's ring lies a cell further in than the floor below's
    expect(shown.map((walls) => Math.min(...walls.map((wall) => wall.p1.x)))).toEqual([72, 144, 216]);
    expect(shown.map((walls) => walls.filter((wall) => wall.type === 'door').length)).toEqual([0, 1, 0]);
    shown.forEach((walls, index) => expect(walls.every((wall) => wall.levels?.[0] === levels[index]!.id && wall.id.startsWith(`wall_uvtt_${index + 1}_`))).toBe(true));
    expect(Object.keys(store.getState().objects.walls)).toHaveLength(13);
  });

  it('take the light of the scene from the bottom floor, and switch off only the lights whose own image shows their glow', async () => {
    const b = await bench();

    const result = arrived(await importFloors(b,
      [keepFloor({ x: 5, y: 5 }, { ambient: 'ff336699' }), 'Keep-20x16-01-Hall-nogrid.uvtt'],
      [keepFloor({ x: 6, y: 6 }, { baked: true, ambient: 'ffffffff' }), 'Keep-20x16-02-Gallery-nogrid.uvtt'],
    ));

    expect(result.lightsOff).toBe(true);
    const state = (await loaded(b, result.scenePath)).getState();
    expect(state.lighting).toEqual({ enabled: true, ambient: 0.37 });
    const lights = Object.values(state.objects.lights);
    expect(lights.map(({ id, x, hidden, levels }) => ({ id, x, hidden, levels }))).toEqual([
      { id: 'light_uvtt_1_1', x: 500, hidden: undefined, levels: [state.levels![0]!.id] },
      { id: 'light_uvtt_2_1', x: 600, hidden: true, levels: [state.levels![1]!.id] },
    ]);
    expect(state.levels!.map((level) => level.name)).toEqual(['Hall', 'Gallery']);
  });

  it('place a floor that begins further in by its origin, with an alignment that draws its image there', async () => {
    const b = await bench();

    const result = arrived(await importFloors(b,
      [keepFloor({ x: 2, y: 2 }), 'Keep_0.uvtt'],
      [keepFloor({ x: 2, y: 2 }, { origin: { x: 6, y: 5 }, size: { x: 8, y: 6 } }), 'Keep_1.uvtt'],
    ));

    const state = (await loaded(b, result.scenePath)).getState();
    const [ground, top] = state.levels!;
    expect(state.levelAlignments).toEqual({ [top!.id]: { offset: { x: 600, y: 500 }, scale: 1, stretch: { x: 1, y: 1 } } });
    expect(levelImagePlacement(state, ground!.id)).toEqual({ x: 1, y: 1 });
    expect(levelImagePlacement(state, top!.id)).toEqual({ x: 1, y: 1, offset: { x: 600, y: 500 } });
    expect(state.grid).toMatchObject({ size: 100, offsetX: 0, offsetY: 0 });
    // The upper floor's torch stands at its own cell 2, 2: the scene's 8, 7
    expect(Object.values(state.objects.lights).map((light) => [light.x, light.y])).toEqual([[200, 200], [800, 700]]);
  });

  it('let the scene begin at the least origin, so a ground floor that begins further in is the one placed', async () => {
    const b = await bench();

    const result = arrived(await importFloors(b,
      [keepFloor({ x: 2, y: 2 }, { origin: { x: 2, y: 3 } }), 'Keep_0.uvtt'],
      [keepFloor({ x: 2, y: 2 }, { size: { x: 8, y: 6 } }), 'Keep_1.uvtt'],
    ));

    const state = (await loaded(b, result.scenePath)).getState();
    const [ground, top] = state.levels!;
    expect(state.levelAlignments).toEqual({ [ground!.id]: { offset: { x: 200, y: 300 }, scale: 1, stretch: { x: 1, y: 1 } } });
    expect(levelImagePlacement(state, top!.id)).toEqual({ x: 1, y: 1 });
    expect(Object.values(state.objects.lights).map((light) => [light.x, light.y])).toEqual([[400, 500], [200, 200]]);
  });

  it('fit a floor whose image was saved smaller, so its walls and its art stay together', async () => {
    const b = await bench();
    // The upper floor is twice as large, and its image is saved at half its size
    b.convertImage.mockImplementation(async (image) => {
      const head = new Uint8Array(await image.slice(0, 30).arrayBuffer());
      if ((head[26]! | (head[27]! << 8)) !== 4000) return converted(image);
      return { ...converted(new Blob([webpHeader(2000, 1600)])), scaledDown: { from: { width: 4000, height: 3200 }, to: { width: 2000, height: 1600 } } };
    });

    const result = arrived(await importFloors(b,
      [keepFloor({ x: 2, y: 2 }), 'Keep_0.uvtt'],
      [keepFloor({ x: 30, y: 20 }, { size: { x: 40, y: 32 } }), 'Keep_1.uvtt'],
    ));

    expect(result.scaledDown).toEqual(['Keep_1.uvtt']);
    const state = (await loaded(b, result.scenePath)).getState();
    const top = state.levels![1]!;
    expect(state.grid?.size).toBe(100);
    expect(state.levelAlignments?.[top.id]).toEqual({ offset: { x: 0, y: 0 }, scale: 2, stretch: { x: 1, y: 1 } });
    expect(levelImagePlacement(state, top.id)).toEqual({ x: 2, y: 2 });
    // Its torch at cell 30, 20 stands where the image, drawn twice its saved size, shows that cell
    expect(Object.values(state.objects.lights).map((light) => [light.x, light.y])).toEqual([[200, 200], [3000, 2000]]);
  });
});

describe('Universal VTT floors that are refused', () => {
  it('name the file whose floor has nothing on its image, and change nothing', async () => {
    const b = await bench();
    const before = filesOf(b);
    const off = keepFloor({ x: 2, y: 2 });
    (off as { resolution: { map_origin: unknown } }).resolution.map_origin = { x: 500, y: 500 };

    const problem = problemOf(await importFloors(b, [keepFloor({ x: 2, y: 2 }), 'Keep_0.uvtt'], [off, 'Keep_1.uvtt']));

    expect(problem).toBe('Keep_1.uvtt: Nothing in the file lies on its map image: its walls, doors and lights are all outside it.');
    expect(filesOf(b)).toEqual(before);
    expect(b.convertImage).not.toHaveBeenCalled();
  });

  it('name the file whose image the workers cannot read, and change nothing', async () => {
    const b = await bench();
    const before = filesOf(b);
    // The bottom floor's image is converted first
    b.convertImage.mockRejectedValueOnce(new Error('decode'));

    const problem = problemOf(await importFloors(b, ...tower()));

    expect(problem).toBe('tower_floor_0.dd2vtt: The map image in the file could not be read.');
    expect(filesOf(b)).toEqual(before);
  });

  it('when their grids differ, as one sentence naming both files', async () => {
    const b = await bench();

    const problem = problemOf(await importFloors(b, [daTowerFloor(0), 'tower_floor_0.dd2vtt'], [keepFloor({ x: 1, y: 1 }), 'tower_floor_1.dd2vtt']));

    expect(problem).toBe('The cells of tower_floor_1.dd2vtt are 100 pixels wide, those of tower_floor_0.dd2vtt 72 pixels, so they do not share a grid.');
  });

  it('when the collection is gone, change nothing', async () => {
    const b = await bench();
    await b.assets.deleteCollection(COLLECTION);
    const before = filesOf(b);

    const problem = problemOf(await importFloors(b, ...tower()));

    expect(problem).toBe('The collection no longer exists. Choose another collection and try again.');
    expect(filesOf(b)).toEqual(before);
  });

  it.each<[string, RegExp, 'create' | 'adapter']>([
    ['the scene file cannot be written', /\.atlasmap$/, 'create'],
    ['a map\'s record file cannot be written', /\/maps\/map-.+\.json$/, 'create'],
    ['the asset index cannot be saved', /assets-metadata\.json$/, 'adapter'],
  ])('take back every floor\'s image and every record when %s', async (_label, failing, through) => {
    const b = await bench();
    const before = filesOf(b);
    const { vault } = b.vault.app;
    const restore = interceptWrites(through === 'create' ? vault : vault.adapter, through === 'create' ? 'create' : 'write', (path) => {
      if (failing.test(path)) throw new Error('EIO: i/o error');
    });
    let result: UvttFloorsResult;
    try {
      result = await importFloors(b, ...tower());
    } finally {
      restore();
    }

    expect(problemOf(result)).toBe('The map could not be saved. Nothing was added.');
    expect(filesOf(b)).toEqual(before);
    await b.assets.refreshMetadata();
    expect(await recordsOf(b)).toEqual([]);
  });

  it('write everything under the index lock, so the vault check finds nothing to add or drop', async () => {
    const b = await bench();
    let locked = false;
    const runExclusive = b.assets.runExclusive.bind(b.assets);
    vi.spyOn(b.assets, 'runExclusive').mockImplementation(async (task) => {
      locked = true;
      try { return await runExclusive(task); } finally { locked = false; }
    });
    const unlocked: string[] = [];
    for (const method of ['create', 'createBinary']) interceptWrites(b.vault.app.vault, method, (path) => { if (!locked) unlocked.push(path); });

    arrived(await importFloors(b, ...tower()));
    const before = await recordsOf(b);
    await b.assets.reconcileWithVault();

    expect(unlocked).toEqual([]);
    expect(await recordsOf(b)).toEqual(before);
  });
});
