// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { App } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { createScene } from '../../src/app/services/createScene';
import { openMap } from '../../src/app/packages/components/asset-manager/hooks/useOpenAsset';
import { sceneMenuEntries, type SceneMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/sceneMenuEntries';
import { MapScenes, latestSceneOn, type SceneOnMap } from '../../src/app/packages/components/asset-manager/utils/mapScenes';
import type { MapAsset } from '../../src/app/packages/components/asset-manager/types';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const COLLECTION = 'C';
const mapCard = (name: string): MapAsset => ({ id: `map-${name}`, name, type: 'maps', mapFilePath: `atlas-vtt/assets/${name}.webp` } as MapAsset);

interface Library {
  vault: InMemoryApp;
  assets: AssetService;
  deps: SceneMenuDeps;
  openFile: ReturnType<typeof vi.fn>;
  created: ReturnType<typeof vi.fn<(event: Event) => void>>;
}

async function library(): Promise<Library> {
  const vault = createInMemoryApp();
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection(COLLECTION);
  const openFile = vi.fn(async (): Promise<void> => {});
  vault.app.workspace.getLeaf = vi.fn(() => ({ openFile })) as unknown as App['workspace']['getLeaf'];
  const created = vi.fn((_event: Event): void => {});
  window.addEventListener('create-scene-from-map', created);
  listeners.push(created);
  const deps: SceneMenuDeps = {
    app: vault.app, view: null, assetService: assets, onClose: vi.fn(), collectionId: COLLECTION,
    openCreateScene: vi.fn(), loadAssetsForActiveTab: vi.fn(async () => {}),
  };
  return { vault, assets, deps, openFile, created };
}

const listeners: Array<(event: Event) => void> = [];
const sceneOn = (map: string, name: string): Parameters<typeof createScene>[2] => ({ name, collectionId: COLLECTION, background: `atlas-vtt/assets/${map}.webp` });
const openedPath = (openFile: ReturnType<typeof vi.fn>): unknown => (openFile.mock.calls[0]?.[0] as { path?: string } | undefined)?.path;

afterEach(() => {
  for (const listener of listeners.splice(0)) window.removeEventListener('create-scene-from-map', listener);
  AssetService.resetInstance();
  vi.restoreAllMocks();
});

// Decision #19: Enter or a double-click on a map made another scene of it each time, even where it had one.
describe('a map card\'s main action', () => {
  it('opens the scene last saved on the map, and makes none', async () => {
    const { vault, assets, deps, openFile, created } = await library();
    await createScene(vault.app, assets, sceneOn('Cave', 'Cave'));
    await createScene(vault.app, assets, sceneOn('Tower', 'Tower'));
    await createScene(vault.app, assets, sceneOn('Cave', 'Cave by night'));

    await openMap(deps, mapCard('Cave'));

    expect(openedPath(openFile)).toBe(`atlas-vtt/collections/${COLLECTION}/scenes/Cave by night.atlasmap`);
    expect(deps.onClose).toHaveBeenCalledTimes(1);
    expect(created).not.toHaveBeenCalled();
    expect((await assets.getAssets(COLLECTION, 'scene')).length).toBe(3);
  });

  it('starts a scene on a map no scene uses', async () => {
    const { vault, assets, deps, openFile, created } = await library();
    await createScene(vault.app, assets, sceneOn('Tower', 'Tower'));

    await openMap(deps, mapCard('Cave'));

    expect(openFile).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledTimes(1);
    expect((created.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({ backgroundPath: 'atlas-vtt/assets/Cave.webp', defaultName: 'Cave' });
  });

  it('starts a scene where the latest scene\'s file is gone', async () => {
    const { vault, assets, deps, openFile, created } = await library();
    const { file } = await createScene(vault.app, assets, sceneOn('Cave', 'Cave'));
    await MapScenes.forApp(vault.app).read(assets, COLLECTION);
    vault.files.delete(file.path);

    await openMap(deps, mapCard('Cave'));

    expect(openFile).not.toHaveBeenCalled();
    expect(created).toHaveBeenCalledTimes(1);
  });
});

describe('a map card\'s menu', () => {
  const labels = (deps: SceneMenuDeps): string[] => sceneMenuEntries(mapCard('Cave'), [mapCard('Cave')], deps)
    .map((entry) => (entry.type === 'item' ? entry.label : ''));

  it('leads with the scene Enter opens and keeps Create scene', async () => {
    const { vault, assets, deps, openFile } = await library();
    await createScene(vault.app, assets, sceneOn('Cave', 'Cave'));
    await MapScenes.forApp(vault.app).read(assets, COLLECTION);

    expect(labels(deps)).toEqual(['Open scene "Cave"', 'Create scene…']);
    const [open] = sceneMenuEntries(mapCard('Cave'), [mapCard('Cave')], deps);
    if (open?.type === 'item') void open.onClick();
    await vi.waitFor(() => expect(openedPath(openFile)).toBe(`atlas-vtt/collections/${COLLECTION}/scenes/Cave.atlasmap`));
  });

  it('offers only Create scene where the map has no scene', async () => {
    const { vault, assets, deps } = await library();
    await createScene(vault.app, assets, sceneOn('Tower', 'Tower'));
    await MapScenes.forApp(vault.app).read(assets, COLLECTION);

    expect(labels(deps)).toEqual(['Create scene…']);
  });
});

describe('latestSceneOn', () => {
  const scene = (id: string, background: string | null, savedAt: number): SceneOnMap => ({ id, name: id, background, savedAt });

  it('picks the scene saved last of those on the map', () => {
    const scenes = [scene('a', 'maps/cave.webp', 3), scene('b', 'maps/cave.webp', 7), scene('c', 'maps/tower.webp', 9), scene('d', null, 10)];
    expect(latestSceneOn('maps/cave.webp', scenes)?.id).toBe('b');
    expect(latestSceneOn('maps/crypt.webp', scenes)).toBeNull();
  });
});

describe('MapScenes', () => {
  it('reads a scene file again only once it changed', async () => {
    const { vault, assets } = await library();
    const { file } = await createScene(vault.app, assets, sceneOn('Cave', 'Cave'));
    const scenes = MapScenes.forApp(vault.app);
    await scenes.read(assets, COLLECTION);
    const reads = vi.mocked(vault.app.vault.cachedRead).mock.calls.length;

    await scenes.read(assets, COLLECTION);
    expect(vi.mocked(vault.app.vault.cachedRead).mock.calls.length).toBe(reads);

    const moved = (JSON.parse(vault.files.get(file.path)!) as { state: { background: string } });
    moved.state.background = 'atlas-vtt/assets/Tower.webp';
    await vault.app.vault.process(file, () => JSON.stringify(moved));
    expect((await scenes.read(assets, COLLECTION))[0]?.background).toBe('atlas-vtt/assets/Tower.webp');
  });
});

