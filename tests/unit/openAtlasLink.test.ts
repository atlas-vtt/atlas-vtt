import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { TFile } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { SceneSnapshotService } from '../../src/app/snapshots/SceneSnapshotService';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { primaryPath } from '../../src/app/services/vault-sync/assetFiles';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const leaves = vi.hoisted(() => ({ loadAtlasView: vi.fn(), openMapInView: vi.fn(async () => {}) }));
const dialogs = vi.hoisted(() => ({ confirmAction: vi.fn() }));
const spawning = vi.hoisted(() => ({ spawnEncounterTokens: vi.fn(async () => ['t1']) }));
vi.mock('../../src/app/plugin/atlasLeaves', () => leaves);
vi.mock('../../src/app/ui/confirmDialog', () => dialogs);
vi.mock('../../src/app/packages/components/asset-manager/utils/tokenSpawnService', () => spawning);

import { openSceneLink, placeEncounterFile, restoreLinkedSnapshot } from '../../src/app/links/openAtlasLink';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';

function mapWithGoblinAt(x: number): string {
  return JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, mapPath: MAP_PATH, objects: { tokens: { g: { id: 'g', x, y: 0, imagePath: 'goblin.webp' } } } } });
}

function goblinX(vault: InMemoryApp): number {
  return (JSON.parse(vault.files.get(MAP_PATH)!) as { state: { objects: { tokens: { g: { x: number } } } } }).state.objects.tokens.g.x;
}

interface SceneState { mapLoaded: boolean; isMapLoading: boolean; mapPath: string | null }

/** A scene with a snapshot "Before the fight" of the goblin at 10, since moved to 99, and an Atlas view still loading another scene. */
async function setUp(): Promise<{ vault: InMemoryApp; store: ReturnType<typeof createStore<SceneState>>; reloadActiveScene: ReturnType<typeof vi.fn> }> {
  const vault = createInMemoryApp({ files: { [MAP_PATH]: mapWithGoblinAt(10) } });
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  const scene = (await assets.getAssets(undefined, 'scene'))[0]!;
  await new SceneSnapshotService(vault.app).create(sceneSnapshotFolder('c', scene.id), new TFile(MAP_PATH), 'Before the fight', null);
  vault.files.set(MAP_PATH, mapWithGoblinAt(99));

  const store = createStore<SceneState>(() => ({ mapLoaded: false, isMapLoading: true, mapPath: 'other.atlasmap' }));
  const reloadActiveScene = vi.fn(async (rewrite: (file: TFile) => Promise<void>) => rewrite(new TFile(MAP_PATH)));
  leaves.loadAtlasView.mockResolvedValue({ getStore: () => store, reloadActiveScene });
  return { vault, store, reloadActiveScene };
}

const showScene = (store: ReturnType<typeof createStore<SceneState>>): void => store.setState({ mapLoaded: true, isMapLoading: false, mapPath: MAP_PATH });

afterEach(() => {
  vi.clearAllMocks();
  AssetService.resetInstance();
});

describe('snapshot links', () => {
  it('asks once the scene is open, then restores the snapshot', async () => {
    const { vault, store, reloadActiveScene } = await setUp();
    dialogs.confirmAction.mockResolvedValueOnce(true);

    const opening = openSceneLink(vault.app as never, new TFile(MAP_PATH), '#before the fight');
    await vi.waitFor(() => expect(leaves.openMapInView).toHaveBeenCalled());
    expect(dialogs.confirmAction).not.toHaveBeenCalled();

    showScene(store);
    await opening;
    expect(dialogs.confirmAction).toHaveBeenCalledWith(expect.objectContaining({ title: 'Restore "Before the fight"?' }));
    expect(reloadActiveScene).toHaveBeenCalled();
    expect(goblinX(vault)).toBe(10);
  });

  it('leaves the scene as it is when the restore is not confirmed', async () => {
    const { vault, store, reloadActiveScene } = await setUp();
    showScene(store);
    dialogs.confirmAction.mockResolvedValueOnce(false);

    await restoreLinkedSnapshot(vault.app as never, MAP_PATH, '#Before the fight');
    expect(reloadActiveScene).not.toHaveBeenCalled();
    expect(goblinX(vault)).toBe(99);
  });

  it('asks nothing for a snapshot the scene does not have, or a link without one', async () => {
    const { vault, store, reloadActiveScene } = await setUp();
    showScene(store);

    await restoreLinkedSnapshot(vault.app as never, MAP_PATH, '#After the fight');
    await restoreLinkedSnapshot(vault.app as never, MAP_PATH, '');
    expect(dialogs.confirmAction).not.toHaveBeenCalled();
    expect(reloadActiveScene).not.toHaveBeenCalled();
  });
});

describe('encounter links', () => {
  it('places the encounter on the open map, as its asset manager card does', async () => {
    const vault = createInMemoryApp({ files: {} });
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    const goblin = { id: 'g', name: 'Goblin', imagePath: 'goblin.webp' };
    const encounter = await assets.createEncounter({ name: 'Goblin ambush', collection: 'c', tags: [], tokens: [goblin] });

    await placeEncounterFile(vault.app as never, new TFile(primaryPath(encounter)!));
    expect(spawning.spawnEncounterTokens).toHaveBeenCalledWith(
      { app: vault.app, view: null, assetService: assets, random: expect.any(Function) },
      expect.objectContaining({ type: 'encounters', id: encounter.id, tokens: [goblin] }),
      'map',
    );
  });

  it('starts a fight with it, or adds it to initiative beside the map', async () => {
    const vault = createInMemoryApp({ files: {} });
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    const encounter = await assets.createEncounter({ name: 'Goblin ambush', collection: 'c', tags: [], tokens: [{ id: 'g', name: 'Goblin', imagePath: 'goblin.webp' }] });

    await placeEncounterFile(vault.app as never, new TFile(primaryPath(encounter)!), 'fight');
    await placeEncounterFile(vault.app as never, new TFile(primaryPath(encounter)!), 'beside');
    expect(vi.mocked(spawning.spawnEncounterTokens).mock.calls.slice(-2).map((call) => call[2])).toEqual(['fight', 'beside']);
  });
});
