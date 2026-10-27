// @vitest-environment node
/**
 * Real multi-floor Universal VTT exports, read from a local folder at test time
 * (`ATLAS_UVTT_SAMPLES=/path/to/uvtt-samples`); skipped without one. The files are never
 * committed: they are other people's maps. The fixtures in `tests/fixtures/uvttFloorFiles.ts`
 * copy their shape. Each set is a folder of its own:
 *
 * - `mastercoookie-dnd-dreams`: Dungeon Alchemist, `tower_floor_0..2.dd2vtt`
 * - `mixtli-dungeon-lab`: Dungeondraft, `Penhew-Foundation-32x40-{01-Ground,02-Exhibit,B1-Basement}-nogrid-lights.uvtt`
 *   and `Small-Home-16x18-L0{1,2}-nogrid-lights.uvtt`
 * - `zephyr-cartography`: `sorcerers-tower.0..2.dd2vtt` and `roadside-inn.0..2.dd2vtt` (85⅓ pixels a cell)
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { importUvttFloors } from '../../src/app/import/uvtt/importUvttFloors';
import type { UvttImportDeps } from '../../src/app/import/uvtt/importUvttFile';
import { floorNaming } from '../../src/app/import/uvtt/uvttFloorNames';
import { floorsProblem } from '../../src/app/import/uvtt/uvttFloors';
import { readUvttSource, type UvttSource } from '../../src/app/import/uvtt/uvttSource';
import { AssetService } from '../../src/app/services/AssetService';
import { AssetThumbnailService } from '../../src/app/services/AssetThumbnailService';
import { createViewAtlasStore } from '../../src/app/storeFactory';
import { levelObjects } from '../../src/app/levels/levelObjects';
import { createInMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/pixi/mapImage/prebuildMapImage', () => ({ prebuildMapImageAt: vi.fn() }));

const SAMPLES = process.env.ATLAS_UVTT_SAMPLES;
const COLLECTION = 'Exports';

interface Set {
  folder: string;
  files: RegExp;
  /** The level names, bottom first. */
  floors: string[];
  /** The files, bottom first. */
  order: string[];
  sceneName: string;
}

const SETS: Set[] = [
  {
    folder: 'mastercoookie-dnd-dreams', files: /^tower_floor_\d\.dd2vtt$/, sceneName: 'tower',
    floors: ['Level 1', 'Level 2', 'Level 3'], order: ['tower_floor_0.dd2vtt', 'tower_floor_1.dd2vtt', 'tower_floor_2.dd2vtt'],
  },
  {
    folder: 'mixtli-dungeon-lab', files: /^Penhew-/, sceneName: 'Penhew-Foundation-32x40', floors: ['Basement', 'Ground', 'Exhibit'],
    order: ['B1-Basement', '01-Ground', '02-Exhibit'].map((floor) => `Penhew-Foundation-32x40-${floor}-nogrid-lights.uvtt`),
  },
  {
    folder: 'mixtli-dungeon-lab', files: /^Small-Home-/, sceneName: 'Small-Home-16x18', floors: ['Level 1', 'Level 2'],
    order: ['Small-Home-16x18-L01-nogrid-lights.uvtt', 'Small-Home-16x18-L02-nogrid-lights.uvtt'],
  },
  {
    folder: 'zephyr-cartography', files: /^sorcerers-tower\.\d\.dd2vtt$/, sceneName: 'sorcerers-tower',
    floors: ['Level 1', 'Level 2', 'Level 3', 'Level 4', 'Level 5'], order: [0, 1, 2, 3, 4].map((floor) => `sorcerers-tower.${floor}.dd2vtt`),
  },
  {
    folder: 'zephyr-cartography', files: /^roadside-inn\.\d\.dd2vtt$/, sceneName: 'roadside-inn',
    floors: ['Level 1', 'Level 2', 'Level 3'], order: [0, 1, 2].map((floor) => `roadside-inn.${floor}.dd2vtt`),
  },
];

async function sourcesOf(set: Set): Promise<UvttSource[]> {
  const folder = join(SAMPLES!, set.folder);
  // Listed backwards, so the order is worked out and not the folder's
  const names = readdirSync(folder).filter((name) => set.files.test(name)).sort().reverse();
  const sources: UvttSource[] = [];
  for (const name of names) {
    const source = await readUvttSource(new File([readFileSync(join(folder, name))], name));
    if ('ok' in source) throw new Error(`${name}: ${source.problem}`);
    sources.push(source);
  }
  return sources;
}

beforeEach(() => { vi.spyOn(console, 'debug').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); AssetService.resetInstance(); });

describe.skipIf(!SAMPLES)('real multi-floor exports', () => {
  it.each(SETS)('$folder $files: read, ordered and named, then imported as one scene', async (set) => {
    const sources = await sourcesOf(set);
    expect(floorsProblem(sources)).toBeNull();
    const naming = floorNaming(sources);
    expect(naming.sceneName).toBe(set.sceneName);
    expect(naming.floors.map((floor) => floor.name)).toEqual(set.floors);
    expect(naming.floors.map((floor) => floor.file.fileName)).toEqual(set.order);

    const vault = createInMemoryApp();
    AssetService.resetInstance();
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    await assets.createCollection(COLLECTION);
    const deps: UvttImportDeps = {
      app: vault.app,
      assetService: assets,
      convertImage: async (image) => ({ image, thumbnail: new Blob(['THUMB']), preview: null, sourcePreview: null }),
      thumbnails: new AssetThumbnailService(vault.app, assets, async () => new ArrayBuffer(0)),
    };
    const result = await importUvttFloors(deps, naming.floors.map(({ file, name }) => ({ source: file, name })), naming.sceneName, COLLECTION);
    if (!result.ok) throw new Error(result.problem);
    expect(result.levels).toBe(sources.length);

    const store = createViewAtlasStore(vault.app, `uvtt-real-${Math.random()}`);
    store.getState().setPersistenceEnabled(false);
    store.getState().setMapPath(result.scenePath);
    await store.rehydrateFromFile();
    const state = store.getState();
    expect(state.levels?.map((level) => level.name)).toEqual(set.floors);
    // Every real set shares origin, size and cells: no floor needs an alignment of its own
    expect(state.levelAlignments).toBeUndefined();
    const walls = Object.values(state.objects.walls);
    expect(walls.length).toBe(result.counts.walls + result.counts.doors);
    for (const [index, level] of (state.levels ?? []).entries()) {
      store.getState().setViewedLevel(level.id);
      const shown = levelObjects(store.getState());
      const expected = naming.floors[index]!.file.map;
      expect(Object.values(shown.walls).every((wall) => wall.levels?.[0] === level.id)).toBe(true);
      expect(Object.values(shown.lights)).toHaveLength(expected.lights.filter((light) => light.range > 0).length);
    }
  });
});
