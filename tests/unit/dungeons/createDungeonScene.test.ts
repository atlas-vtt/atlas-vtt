import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DungeonModel } from '../../../src/app/dungeons/model';
import { DEFAULT_PX_PER_CELL, SCENE_MAP_PIXELS, mapLayout, suggestedPxPerCell } from '../../../src/app/dungeons/render/layoutSize';
import { createDungeonSceneWith, dungeonSceneName, type DungeonSceneDeps, type DungeonSceneResult } from '../../../src/app/dungeons/scene/createDungeonScene';
import { DEFAULT_VIEW } from '../../../src/app/dungeons/style';
import { dungeonStyle } from '../../../src/app/dungeons/styleCatalog';
import type { DungeonJob, DungeonRendered } from '../../../src/app/dungeons/worker/dungeonJob';
import type { ProcessedImage } from '../../../src/app/imageProcessing/imageProcessing';
import { prebuildMapImageAt } from '../../../src/app/pixi/mapImage/prebuildMapImage';
import { AssetService, type Asset } from '../../../src/app/services/AssetService';
import { AssetThumbnailService } from '../../../src/app/services/AssetThumbnailService';
import type { WallSegment } from '../../../src/app/types/wallTypes';
import type { NotePin } from '../../../src/app/types';
import type { LevelLink, SceneLevel } from '../../../src/app/types/sceneLevelTypes';
import { generateDungeon } from '../../../src/app/dungeons/generate';
import { smallDungeon } from '../../fixtures/dungeonModels';
import { fakeBitmap, pngHeader, pngOfBitmap } from '../../fixtures/uvttFiles';
import { createInMemoryApp, interceptWrites, type InMemoryApp } from '../../mocks/inMemoryVault';

vi.mock('../../../src/app/pixi/mapImage/prebuildMapImage', () => ({ prebuildMapImageAt: vi.fn() }));

const COLLECTION = 'Dungeons';
const SCENES = `atlas-vtt/collections/${COLLECTION}/scenes`;
const STYLE = dungeonStyle('parchment');
const TITLE = 'Sunken Vault of the Grey Abbot';
/** How large a scene's maps are asked for. */
const SIZE = { pxPerCell: DEFAULT_PX_PER_CELL, maxPixels: SCENE_MAP_PIXELS };

interface Bench {
  vault: InMemoryApp;
  assets: AssetService;
  deps: DungeonSceneDeps;
  jobs: DungeonJob[];
}

/** What the dungeon worker gives back: the model, its layout and a bitmap of the layout's size. */
function drawn(job: DungeonJob): DungeonRendered {
  const model = job.model ?? smallDungeon();
  if (job.output.kind !== 'map') throw new Error('Only maps are drawn here');
  const map = mapLayout(model, suggestedPxPerCell(model, job.output.pxPerCell, job.view, job.output.maxPixels), job.view);
  return { model, map, image: { type: 'bitmap', bitmap: fakeBitmap(map.widthPx, map.heightPx) } };
}

const kept = (image: Blob): ProcessedImage => ({ image, thumbnail: new Blob(['THUMB']), preview: null, sourcePreview: null });

async function bench(): Promise<Bench> {
  const vault = createInMemoryApp();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection(COLLECTION);
  const jobs: DungeonJob[] = [];
  const deps: DungeonSceneDeps = {
    app: vault.app,
    assetService: assets,
    render: async (job) => {
      jobs.push(job);
      return drawn(job);
    },
    convertImage: async (image) => kept(pngOfBitmap(image)),
    thumbnails: new AssetThumbnailService(vault.app, assets, async () => new ArrayBuffer(0)),
  };
  return { vault, assets, deps, jobs };
}

const options = (model: DungeonModel = smallDungeon()): Parameters<typeof createDungeonSceneWith>[1] => ({
  name: TITLE,
  request: { seed: model.seed, tags: model.tags, floors: model.floors.length },
  model,
  style: STYLE,
  view: DEFAULT_VIEW,
  collectionId: COLLECTION,
});

function created(result: DungeonSceneResult): Extract<DungeonSceneResult, { ok: true }> {
  if (!result.ok) throw new Error(`Refused: ${result.problem}`);
  return result;
}

interface SceneState {
  background: string;
  version: number;
  grid: { size: number; offsetX: number; offsetY: number; autoDetect?: unknown };
  objects: { walls: Record<string, WallSegment>; lights: Record<string, unknown>; pins?: Record<string, NotePin>; levelLinks?: Record<string, LevelLink> };
  lighting: unknown;
  levels?: SceneLevel[];
}

const sceneFile = ({ vault }: Bench, path: string): { version: number; state: SceneState } => JSON.parse(vault.files.get(path)!) as { version: number; state: SceneState };
const sceneState = (b: Bench, path: string): SceneState => sceneFile(b, path).state;
const filesOf = ({ vault }: Bench): string[] => [...vault.files.keys()].sort();
const recordsOf = ({ assets }: Bench): Promise<Asset[]> => assets.getAssets(COLLECTION);

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.mocked(prebuildMapImageAt).mockClear();
});
afterEach(() => { vi.restoreAllMocks(); AssetService.resetInstance(); });

describe('creating a dungeon scene', () => {
  it('adds a map, a scene of the GM\'s name with grid, walls, doors, pins and lighting, and its note', async () => {
    const b = await bench();

    const result = created(await createDungeonSceneWith(b.deps, options()));

    expect(result).toEqual({ ok: true, name: TITLE, scenePath: `${SCENES}/${TITLE}.atlasmap` });
    expect(b.jobs.map(job => job.output)).toEqual([
      { kind: 'map', ...SIZE, bitmap: true },
    ]);
    const records = await recordsOf(b);
    expect(records.map(r => r.type).sort()).toEqual(['map', 'scene']);
    const map = records.find(r => r.type === 'map');
    if (map?.type !== 'map') throw new Error('No map record');
    expect(prebuildMapImageAt).toHaveBeenCalledWith(b.vault.app, map.mapFilePath);

    const state = sceneState(b, result.scenePath);
    expect(sceneFile(b, result.scenePath).version).toBe(4);
    expect(state.levels).toBeUndefined();
    expect(state.objects.levelLinks).toBeUndefined();
    expect(result.entryLevel).toBeUndefined();
    expect(state.background).toBe(map.mapFilePath);
    expect(state.grid).toMatchObject({ size: DEFAULT_PX_PER_CELL, offsetX: 0, offsetY: 0 });
    expect(state.grid.autoDetect).toBeUndefined();
    expect(state.lighting).toEqual({ enabled: true, ambient: 1 });
    expect(state.objects.lights).toEqual({});
    const walls = Object.values(state.objects.walls);
    expect(walls.filter(w => w.type === 'door')).toHaveLength(5);
    expect(walls.filter(w => w.type === 'secret-door')).toHaveLength(1);
    expect(Object.keys(state.objects.pins ?? {})).toHaveLength(7);
    expect(filesOf(b).filter(path => path.endsWith('.md'))).toEqual([`atlas-vtt/collections/${COLLECTION}/notes/${TITLE}.md`]);
  });

  it('writes a Cavern of three floors as one scene: a level per floor, deepest first, stairs, and one note', async () => {
    const b = await bench();
    const model = generateDungeon({ seed: 7, theme: 'cavern', tags: ['medium'], floors: 3 });

    const result = created(await createDungeonSceneWith(b.deps, options(model)));

    expect(b.jobs.map(job => job.output)).toEqual([
      { kind: 'map', ...SIZE, bitmap: true },
      { kind: 'map', ...SIZE, bitmap: true, floor: 1 },
      { kind: 'map', ...SIZE, bitmap: true, floor: 2 },
    ]);
    const maps = (await recordsOf(b)).filter(r => r.type === 'map');
    expect(maps.map(map => map.name)).toEqual([`${TITLE}, Floor A`, `${TITLE}, Floor B`, `${TITLE}, Floor C`]);
    const file = sceneFile(b, result.scenePath);
    expect(file.version).toBe(5);
    const { levels = [], objects, background } = file.state;
    expect(levels.map(level => level.name)).toEqual(['Floor C', 'Floor B', 'Floor A']);
    expect(levels.map(level => level.elevation)).toEqual([{ bottom: -20, top: -10 }, { bottom: -10, top: 0 }, { bottom: 0, top: 10 }]);
    const mapPath = (name: string): string | undefined => {
      const map = maps.find(m => m.name === name);
      return map?.type === 'map' ? map.mapFilePath : undefined;
    };
    expect(levels.map(level => level.background)).toEqual([mapPath(`${TITLE}, Floor C`), mapPath(`${TITLE}, Floor B`), mapPath(`${TITLE}, Floor A`)]);
    expect(background).toBe(levels[0]!.background);
    expect(result.entryLevel).toBe(levels[2]!.id);

    const ids = levels.map(level => level.id);
    for (const wall of Object.values(objects.walls)) expect(ids).toContain(wall.levels?.[0]);
    const links = Object.values(objects.levelLinks ?? {});
    expect(links.length).toBeGreaterThanOrEqual(2);
    for (const link of links) expect([[ids[2], ids[1]], [ids[1], ids[0]]]).toContainEqual(link.levels);

    const notePath = `atlas-vtt/collections/${COLLECTION}/notes/${TITLE}.md`;
    const note = b.vault.files.get(notePath)!;
    // A room's heading names its key, then what it was built for where its theme typed it.
    expect(note).toMatch(new RegExp(`^# ${TITLE}\\n\\n## A1( · [^\\n]+)?\\n`));
    const pins = Object.values(objects.pins ?? {});
    expect(pins.length).toBeGreaterThan(5);
    for (const pin of pins) {
      expect(pin).toMatchObject({ icon: 'number', gmOnly: true });
      expect(pin.notePath.startsWith(`${notePath}#${pin.label}`)).toBe(true);
      expect(note).toContain(`\n## ${pin.notePath.split('#')[1]}\n`);
      expect(pin.level).toBe(ids[2 - 'ABC'.indexOf(pin.label![0]!)]);
    }
  });

  it('writes a three-floor Fortress bottom first, entrance floor first', async () => {
    const b = await bench();
    const model = generateDungeon({ seed: 7, theme: 'fortress', tags: ['medium'], floors: 3 });

    const result = created(await createDungeonSceneWith(b.deps, options(model)));

    const maps = (await recordsOf(b)).filter(r => r.type === 'map');
    const mapPath = (name: string): string | undefined => {
      const map = maps.find(m => m.name === name);
      return map?.type === 'map' ? map.mapFilePath : undefined;
    };
    const { levels = [], objects, background } = sceneFile(b, result.scenePath).state;
    expect(levels.map(level => level.name)).toEqual(['Floor A', 'Floor B', 'Floor C']);
    expect(levels.map(level => level.elevation)).toEqual([{ bottom: 0, top: 10 }, { bottom: 10, top: 20 }, { bottom: 20, top: 30 }]);
    expect(levels.map(level => level.background)).toEqual([mapPath(`${TITLE}, Floor A`), mapPath(`${TITLE}, Floor B`), mapPath(`${TITLE}, Floor C`)]);
    expect(background).toBe(levels[0]!.background);
    expect(result.entryLevel).toBe(levels[0]!.id);
    const ids = levels.map(level => level.id);
    // Each stairwell joins the floor above and the floor below, in that order.
    for (const link of Object.values(objects.levelLinks ?? {})) expect([[ids[1], ids[0]], [ids[2], ids[1]]]).toContainEqual(link.levels);
    for (const pin of Object.values(objects.pins ?? {})) expect(pin.level).toBe(ids['ABC'.indexOf(pin.label![0]!)]);
  });

  it('writes a one-floor Fortress without levels', async () => {
    const b = await bench();
    const result = created(await createDungeonSceneWith(b.deps, options(generateDungeon({ seed: 7, theme: 'fortress', tags: ['medium'], floors: 1 }))));
    const file = sceneFile(b, result.scenePath);
    expect(file.version).toBe(4);
    expect(file.state.levels).toBeUndefined();
    expect(file.state.objects.levelSurfaces).toBeUndefined();
    expect(result.entryLevel).toBeUndefined();
  });

  it('takes back every floor\'s map, the thumbnails and the note when the scene cannot be written', async () => {
    const b = await bench();
    const before = filesOf(b);
    const restore = interceptWrites(b.vault.app.vault, 'create', (path) => {
      if (path.endsWith('.atlasmap')) throw new Error('EIO: i/o error');
    });

    const result = await createDungeonSceneWith(b.deps, options(generateDungeon({ seed: 7, tags: ['medium'], floors: 3 })));
    restore();

    expect(result).toEqual({ ok: false, problem: 'The scene could not be created.' });
    expect(filesOf(b)).toEqual(before);
    expect(await recordsOf(b)).toEqual([]);
  });

  it('numbers the scene where its note\'s name is taken', async () => {
    const b = await bench();
    await b.vault.app.vault.create(`atlas-vtt/collections/${COLLECTION}/notes/${TITLE}.md`, 'my own');

    const result = created(await createDungeonSceneWith(b.deps, options()));

    expect(result.name).toBe(`${TITLE} 2`);
    expect(b.vault.files.get(`atlas-vtt/collections/${COLLECTION}/notes/${TITLE}.md`)).toBe('my own');
    expect(b.vault.files.has(`atlas-vtt/collections/${COLLECTION}/notes/${TITLE} 2.md`)).toBe(true);
  });

  it('numbers a second dungeon of the same name', async () => {
    const b = await bench();
    await createDungeonSceneWith(b.deps, options());

    const second = created(await createDungeonSceneWith(b.deps, options()));

    expect(second).toMatchObject({ name: `${TITLE} 2`, scenePath: `${SCENES}/${TITLE} 2.atlasmap` });
  });

  it('fits grid and walls to an image the workers scaled down', async () => {
    const b = await bench();
    b.deps.convertImage = async ({ width, height }) => {
      const to = { width: width / 2, height: height / 2 };
      return { ...kept(new Blob([pngHeader(to.width, to.height)])), scaledDown: { from: { width, height }, to } };
    };

    const result = created(await createDungeonSceneWith(b.deps, options()));

    const state = sceneState(b, result.scenePath);
    expect(state.grid.size).toBe(DEFAULT_PX_PER_CELL / 2);
  });

  it('leaves no file and no record when the scene cannot be written', async () => {
    const b = await bench();
    const before = filesOf(b);
    const restore = interceptWrites(b.vault.app.vault, 'create', (path) => {
      if (path.endsWith('.atlasmap')) throw new Error('EIO: i/o error');
    });

    const result = await createDungeonSceneWith(b.deps, options());
    restore();

    expect(result).toEqual({ ok: false, problem: 'The scene could not be created.' });
    expect(filesOf(b)).toEqual(before);
    expect(await recordsOf(b)).toEqual([]);
  });

  it('answers with a problem when the dungeon cannot be drawn', async () => {
    const b = await bench();
    b.deps.render = () => Promise.reject(new Error('Worker crashed'));
    const before = filesOf(b);

    expect(await createDungeonSceneWith(b.deps, options())).toEqual({ ok: false, problem: 'The scene could not be created.' });
    expect(filesOf(b)).toEqual(before);
  });

  it('refuses a collection that is gone', async () => {
    const b = await bench();
    const result = await createDungeonSceneWith(b.deps, { ...options(), collectionId: 'Nowhere' });
    expect(result.ok).toBe(false);
    expect(b.jobs).toEqual([]);
  });

  it('names the scene as a vault file may be called', () => {
    expect(dungeonSceneName('Crypt: of [the] #Lich?')).toBe('Crypt of the Lich');
    expect(dungeonSceneName(' ..  ')).toBe('Dungeon');
  });
});
