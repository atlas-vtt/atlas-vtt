// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TAbstractFile } from 'obsidian';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { createScene, createScenesFromMaps } from '../../src/app/services/createScene';
import { createAtlasStorage } from '../../src/app/services/MapPersistence';
import { sceneMenuEntries } from '../../src/app/packages/components/asset-manager/contextMenus/sceneMenuEntries';
import type { AnyAsset, MapAsset } from '../../src/app/packages/components/asset-manager/types';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const COLLECTION = 'C';
const SCENES = `atlas-vtt/collections/${COLLECTION}/scenes`;

async function library(): Promise<{ vault: InMemoryApp; assets: AssetService }> {
  const vault = createInMemoryApp();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection(COLLECTION);
  return { vault, assets };
}

const mapCard = (name: string): MapAsset => ({ id: `map-${name}`, name, type: 'maps', mapFilePath: `atlas-vtt/assets/${name}.webp` } as MapAsset);
const scenes = async (assets: AssetService): Promise<Asset[]> => assets.getAssets(COLLECTION, 'scene');
const backgroundOf = (vault: InMemoryApp, path: string): unknown => (JSON.parse(vault.files.get(path)!) as { state: { background: unknown } }).state.background;

afterEach(() => { AssetService.resetInstance(); vi.restoreAllMocks(); });

describe('scenes from several maps', () => {
  it('makes one scene on each selected map, named like its map', async () => {
    const { vault, assets } = await library();
    await createScene(vault.app, assets, { name: 'Cave', collectionId: COLLECTION, background: null });

    await createScenesFromMaps(vault.app, assets, COLLECTION, [mapCard('Cave'), mapCard('Tower'), mapCard('Cave')]);

    expect((await scenes(assets)).map((scene) => scene.name).sort()).toEqual(['Cave', 'Cave 2', 'Cave 3', 'Tower']);
    expect(backgroundOf(vault, `${SCENES}/Cave 2.atlasmap`)).toBe('atlas-vtt/assets/Cave.webp');
    expect(backgroundOf(vault, `${SCENES}/Tower.atlasmap`)).toBe('atlas-vtt/assets/Tower.webp');
    expect(backgroundOf(vault, `${SCENES}/Cave 3.atlasmap`)).toBe('atlas-vtt/assets/Cave.webp');
  });

  it('offers the dialog for one map and a scene per map for several', async () => {
    const { vault, assets } = await library();
    const openCreateScene = vi.fn();
    const deps = { app: vault.app, assetService: assets, collectionId: COLLECTION, openCreateScene, loadAssetsForActiveTab: vi.fn(async () => {}) };
    const [one] = sceneMenuEntries(mapCard('Cave'), [mapCard('Cave')], deps);
    if (one?.type !== 'item') throw new Error('No menu item');
    await one.onClick?.();
    expect(openCreateScene).toHaveBeenCalledWith({ backgroundPath: 'atlas-vtt/assets/Cave.webp', defaultName: 'Cave' });

    const selection: AnyAsset[] = [mapCard('Cave'), mapCard('Tower')];
    const entries = sceneMenuEntries(mapCard('Cave'), selection, deps);
    expect(entries).toHaveLength(1);
    const [many] = entries;
    if (many?.type !== 'item') throw new Error('No menu item');
    expect(many.label).toBe('Create 2 Scenes');
    await many.onClick?.();
    expect((await scenes(assets)).map((scene) => scene.name).sort()).toEqual(['Cave', 'Tower']);
    expect(deps.loadAssetsForActiveTab).toHaveBeenCalled();
  });
});

describe('several maps made into scenes (#555)', () => {
  const sceneFiles = (vault: InMemoryApp): string[] => [...vault.files.keys()].filter((path) => path.endsWith('.atlasmap')).sort();
  const sceneNames = async (assets: AssetService): Promise<string[]> => (await scenes(assets)).map((scene) => scene.name).sort();

  it('makes no second record of a scene when the vault check runs while they are written', async () => {
    const { vault, assets } = await library();
    const create = vi.mocked(vault.app.vault.create);
    const original = create.getMockImplementation()!;
    const checks: Promise<unknown>[] = [];
    create.mockImplementation(async (path: string, data: string) => {
      const file = await original(path, data);
      if (path.endsWith('.atlasmap')) {
        checks.push(assets.reconcileWithVault());
        // Time for a check that is not held back to find the map before its record is added
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      return file;
    });

    await createScenesFromMaps(vault.app, assets, COLLECTION, [mapCard('Cave'), mapCard('Tower'), mapCard('Crypt')]);
    await Promise.all(checks);

    expect(await sceneNames(assets)).toEqual(['Cave', 'Crypt', 'Tower']);
    expect(sceneFiles(vault)).toEqual([`${SCENES}/Cave.atlasmap`, `${SCENES}/Crypt.atlasmap`, `${SCENES}/Tower.atlasmap`]);
  });

  it('keeps a deleted one deleted, through the vault check and a restart, and leaves the others', async () => {
    const { vault, assets } = await library();
    const made = await createScenesFromMaps(vault.app, assets, COLLECTION, [mapCard('Cave'), mapCard('Tower')]);
    const cave = made.find((scene) => scene.name === 'Cave')!;

    await assets.deleteAsset(cave.id);
    await assets.reconcileWithVault(new Set([`${SCENES}/Cave.atlasmap`]));
    expect(await sceneNames(assets)).toEqual(['Tower']);

    AssetService.resetInstance();
    const restarted = AssetService.getInstance(vault.app);
    await restarted.initialize();
    await restarted.reconcileWithVault();

    expect(await sceneNames(restarted)).toEqual(['Tower']);
    expect(sceneFiles(vault)).toEqual([`${SCENES}/Tower.atlasmap`]);
  });
});

describe('deleting a scene', () => {
  it('waits for the vault check: the map is never taken in again as a scene of its own', async () => {
    const { vault, assets } = await library();
    const { asset } = await createScene(vault.app, assets, { name: 'Cave', collectionId: COLLECTION, background: 'atlas-vtt/assets/Cave.webp' });
    const trash = vi.mocked(vault.app.fileManager.trashFile);
    const original = trash.getMockImplementation()!;
    let check: Promise<unknown> | null = null;
    // The check runs while the scene is half deleted: its record file gone, its map not yet
    trash.mockImplementation(async (file: TAbstractFile) => {
      if (file.path.endsWith('.atlasmap')) check ??= assets.reconcileWithVault(new Set([asset.filePath!]));
      await new Promise((resolve) => setTimeout(resolve, 10));
      return original(file);
    });

    await assets.deleteAsset(asset.id);
    await check;

    expect(await scenes(assets)).toEqual([]);
    expect([...vault.files.keys()].filter((path) => path.startsWith(`${SCENES}/`))).toEqual([]);
  });

  it('is not undone by a save of the open scene: its file stays deleted', async () => {
    const { vault, assets } = await library();
    const { asset, file } = await createScene(vault.app, assets, { name: 'Cave', collectionId: COLLECTION, background: null });
    const storage = createAtlasStorage(vault.app, { getState: () => ({ mapPath: file.path, mapLoaded: true }) });
    await storage.getItem('atlas');
    await storage.setItem('atlas', { state: { revision: 1 }, version: 4 });

    await assets.deleteAsset(asset.id);
    // The view closes with the scene and flushes what it had not saved yet
    await storage.flush();
    await assets.reconcileWithVault(new Set([file.path]));

    expect(vault.files.has(file.path)).toBe(false);
    expect(await scenes(assets)).toEqual([]);
  });
});
