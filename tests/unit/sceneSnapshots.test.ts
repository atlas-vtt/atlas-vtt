import { afterEach, describe, expect, it } from 'vitest';
import { TFile } from 'obsidian';
import { SceneSnapshotService, nextSnapshotName } from '../../src/app/snapshots/SceneSnapshotService';
import { createSnapshot, isSceneSnapshot, restoreSnapshot } from '../../src/app/snapshots/sceneSnapshotFormat';
import { legacySnapshotFolderFor, sceneSnapshotFolder, snapshotOwnerOf } from '../../src/app/snapshots/snapshotPaths';
import { snapshotFolderForMap } from '../../src/app/snapshots/sceneSnapshotFolders';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';
import { isHiddenVaultPath } from '../../src/app/utils/hiddenVaultFiles';
import { AssetService } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const SCENES = 'atlas-vtt/collections/c/scenes';
const FOLDER = sceneSnapshotFolder('c', 'scene-cave');

interface MapState {
  mapPath?: string;
  background?: string;
  camera?: { x: number; y: number; scale: number };
  diceLog?: string[];
  initiative?: { round: number };
  objects: { tokens: Record<string, { id: string; x: number; y: number; imagePath: string; hp?: number; conditions?: string[] }> };
}

function mapEnvelope(state: MapState): string {
  return JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, ...state } });
}

const encounterReady: MapState = {
  mapPath: MAP_PATH,
  background: 'atlas-vtt/assets/cave.webp',
  camera: { x: 1, y: 2, scale: 3 },
  diceLog: ['d20: 12'],
  initiative: { round: 1 },
  objects: { tokens: { goblin: { id: 'goblin', x: 10, y: 20, imagePath: 'atlas-vtt/assets/goblin.webp', hp: 7, conditions: ['poisoned'] } } },
};

function readMap(vault: InMemoryApp): MapState {
  return (JSON.parse(vault.files.get(MAP_PATH) ?? '{}') as { state: MapState }).state;
}

async function seed(): Promise<{ vault: InMemoryApp; snapshots: SceneSnapshotService; mapFile: TFile }> {
  const vault = createInMemoryApp({ files: { [MAP_PATH]: mapEnvelope(encounterReady) } });
  return { vault, snapshots: new SceneSnapshotService(vault.app), mapFile: new TFile(MAP_PATH) };
}

describe('scene snapshot format', () => {
  it('stores the scene state without the map path, camera and dice log', () => {
    const snapshot = createSnapshot({ version: 4, state: { ...encounterReady } }, 's1', 'Ambush', 1000);
    expect(snapshot).toMatchObject({ id: 's1', name: 'Ambush', createdAt: 1000, version: 4 });
    expect(snapshot.state).not.toHaveProperty('mapPath');
    expect(snapshot.state).not.toHaveProperty('camera');
    expect(snapshot.state).not.toHaveProperty('diceLog');
    expect(snapshot.state).toMatchObject({ background: encounterReady.background, initiative: { round: 1 } });
    expect(isSceneSnapshot(JSON.parse(JSON.stringify(snapshot)))).toBe(true);
  });

  it('leaves the loot roller out, as it belongs to the session', () => {
    const snapshot = createSnapshot({ version: 4, state: { ...encounterReady, lootRoller: { open: true, history: [] } } }, 's1', 'Ambush', 1000);
    expect(snapshot.state).not.toHaveProperty('lootRoller');
  });

  it('restores the scene state but keeps the session state of the map it is restored into', () => {
    const snapshot = createSnapshot({ version: 4, state: { ...encounterReady } }, 's1', 'Ambush', 1000);
    const played = { version: 4, state: { mapPath: 'old/path.atlasmap', camera: { x: 9, y: 9, scale: 1 }, diceLog: ['d6: 3'], objects: { tokens: {} } } };
    const restored = restoreSnapshot(played, snapshot, MAP_PATH);
    expect(restored.state).toMatchObject({
      mapPath: MAP_PATH,
      camera: { x: 9, y: 9, scale: 1 },
      diceLog: ['d6: 3'],
      initiative: { round: 1 },
      objects: encounterReady.objects,
    });
  });

  it('restores the floors a snapshot holds, and a scene of one floor from a snapshot taken before there were more', () => {
    const levels = [
      { id: 'ground', name: 'Ground', elevation: { bottom: 0, top: 10 }, background: encounterReady.background },
      { id: 'upper', name: 'Upper', elevation: { bottom: 10, top: 20 }, background: 'atlas-vtt/assets/upper.webm' },
    ];
    const withFloors = { version: 5, state: { ...encounterReady, levels, exploredMasks: { upper: 'data:image/png;base64,AAAA' } } };
    const oneFloor = createSnapshot({ version: 4, state: { ...encounterReady } }, 's1', 'Before the tower', 1000);

    const restored = restoreSnapshot(withFloors, oneFloor, MAP_PATH);
    expect(restored.version).toBe(4);
    expect(restored.state).not.toHaveProperty('levels');
    expect(restored.state).not.toHaveProperty('exploredMasks');

    const floors = createSnapshot(withFloors, 's2', 'Tower', 2000);
    const back = restoreSnapshot(restored, floors, MAP_PATH);
    expect(back.version).toBe(5);
    expect(back.state).toMatchObject({ levels, exploredMasks: { upper: 'data:image/png;base64,AAAA' } });
  });

  it('rejects files that are not snapshots', () => {
    expect(isSceneSnapshot({ version: 4, state: {} })).toBe(false);
    expect(isSceneSnapshot({ format: 1, id: 'a', name: 'b', createdAt: 1, state: { objects: 'broken' } })).toBe(false);
  });

  it('keeps snapshots in a visible folder of the collection, named after the scene id', () => {
    expect(FOLDER).toBe('atlas-vtt/collections/c/snapshots/scene-cave');
    expect(snapshotOwnerOf(`${FOLDER}/s1.json`)).toEqual({ collectionId: 'c', sceneId: 'scene-cave' });
    expect(snapshotOwnerOf(`${SCENES}/s1.json`)).toBeNull();
    expect(snapshotOwnerOf('atlas-vtt/collections/c/snapshots/s1.json')).toBeNull();
  });

  it('knows where earlier versions kept them, to carry them over', () => {
    expect(legacySnapshotFolderFor(MAP_PATH)).toBe(`${SCENES}/.snapshots/Cave`);
    expect(legacySnapshotFolderFor('Cave.atlasmap')).toBe('.snapshots/Cave');
  });

  it('picks the first free default name', () => {
    expect(nextSnapshotName([])).toBe('Snapshot 1');
    expect(nextSnapshotName(['Snapshot 1', 'Boss fight'])).toBe('Snapshot 3');
    expect(nextSnapshotName(['Snapshot 2'])).toBe('Snapshot 3');
  });
});

describe('SceneSnapshotService', () => {
  it('saves snapshots with a thumbnail and lists them newest first', async () => {
    const { vault, snapshots, mapFile } = await seed();
    const first = await snapshots.create(FOLDER, mapFile, 'Before the ambush', new TextEncoder().encode('JPG').buffer);
    await new Promise((resolve) => setTimeout(resolve, 2));
    await snapshots.create(FOLDER, mapFile, 'After round one', null);

    const entries = await snapshots.list(FOLDER);
    expect(entries.map((entry) => entry.snapshot.name)).toEqual(['After round one', 'Before the ambush']);
    expect(entries[1]?.path).toBe(`${FOLDER}/${first.id}.json`);
    expect(entries[1]?.thumbnailPath).toBe(`${FOLDER}/${first.id}.jpg`);
    expect(entries[0]?.thumbnailPath).toBeNull();
    expect(vault.files.get(`${FOLDER}/${first.id}.jpg`)).toBe('JPG');
  });

  it('writes visible files through the vault, so sync tools carry them', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(FOLDER, mapFile, 'Ambush', new TextEncoder().encode('JPG').buffer);

    const created = [...vault.files.keys()].filter((path) => path.startsWith(`${FOLDER}/`));
    expect(created).toHaveLength(2);
    expect(created.some(isHiddenVaultPath)).toBe(false);
    expect(vault.app.vault.create).toHaveBeenCalled();
    expect(vault.app.vault.createBinary).toHaveBeenCalled();
    expect(vault.app.vault.adapter.write).not.toHaveBeenCalled();
  });

  it('builds thumbnail URLs that change when the snapshot is overwritten', async () => {
    const { snapshots, mapFile } = await seed();
    await snapshots.create(FOLDER, mapFile, 'Ambush', new TextEncoder().encode('JPG').buffer);
    const [entry] = await snapshots.list(FOLDER);
    const before = snapshots.thumbnailUrl(entry!);
    expect(before).toMatch(new RegExp(`^app://vault/${FOLDER}/.*\\.jpg\\?v=\\d+$`));

    await new Promise((resolve) => setTimeout(resolve, 2));
    await snapshots.overwrite(entry!, mapFile, new TextEncoder().encode('NEW').buffer);
    const [overwritten] = await snapshots.list(FOLDER);
    expect(snapshots.thumbnailUrl(overwritten!)).not.toBe(before);
  });

  it('restores tokens, conditions and hit points into the map file', async () => {
    const { vault, snapshots, mapFile } = await seed();
    const snapshot = await snapshots.create(FOLDER, mapFile, 'Ambush', null);

    vault.files.set(MAP_PATH, mapEnvelope({ ...encounterReady, diceLog: ['d8: 5'], objects: { tokens: {} } }));
    await snapshots.restoreInto(mapFile, snapshot);

    const restored = readMap(vault);
    expect(restored.objects.tokens.goblin).toMatchObject({ hp: 7, conditions: ['poisoned'], x: 10, y: 20 });
    expect(restored.mapPath).toBe(MAP_PATH);
    expect(restored.diceLog).toEqual(['d8: 5']);
  });

  it('overwrites a snapshot with the current map, keeping its id, name and place', async () => {
    const { vault, snapshots, mapFile } = await seed();
    const original = await snapshots.create(FOLDER, mapFile, 'Ambush', new TextEncoder().encode('OLD').buffer);
    const [entry] = await snapshots.list(FOLDER);

    vault.files.set(MAP_PATH, mapEnvelope({ ...encounterReady, objects: { tokens: { goblin: { id: 'goblin', x: 50, y: 60, imagePath: 'atlas-vtt/assets/goblin.webp', hp: 2 } } } }));
    await snapshots.overwrite(entry!, mapFile, new TextEncoder().encode('NEW').buffer);

    const [overwritten] = await snapshots.list(FOLDER);
    expect(overwritten?.snapshot).toMatchObject({ id: original.id, name: 'Ambush', createdAt: original.createdAt });
    expect(overwritten?.snapshot.updatedAt).toBeGreaterThanOrEqual(original.createdAt);
    expect(overwritten?.snapshot.state.objects?.tokens?.goblin).toMatchObject({ x: 50, y: 60, hp: 2 });
    expect(vault.files.get(`${FOLDER}/${original.id}.jpg`)).toBe('NEW');
  });

  it('renames a snapshot without touching its state', async () => {
    const { snapshots, mapFile } = await seed();
    await snapshots.create(FOLDER, mapFile, 'Snapshot 1', null);
    const [entry] = await snapshots.list(FOLDER);
    await snapshots.rename(entry!, 'Boss fight');

    const [renamed] = await snapshots.list(FOLDER);
    expect(renamed?.snapshot).toMatchObject({ name: 'Boss fight', id: entry!.snapshot.id, state: entry!.snapshot.state });
  });

  it('deletes a snapshot with its thumbnail and removes the emptied folder', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(FOLDER, mapFile, 'One', new TextEncoder().encode('JPG').buffer);
    await snapshots.create(FOLDER, mapFile, 'Two', null);
    const entries = await snapshots.list(FOLDER);
    const one = entries.find((entry) => entry.snapshot.name === 'One');
    const two = entries.find((entry) => entry.snapshot.name === 'Two');

    await snapshots.delete(one!);
    expect(await snapshots.list(FOLDER)).toHaveLength(1);
    expect(vault.files.has(one!.thumbnailPath!)).toBe(false);

    await snapshots.delete(two!);
    expect(vault.folders.has(FOLDER)).toBe(false);
    expect(vault.folders.has(SCENES)).toBe(true);
  });

  it('skips files in the folder that are not snapshots', async () => {
    const { vault, snapshots, mapFile } = await seed();
    await snapshots.create(FOLDER, mapFile, 'Good', null);
    vault.files.set(`${FOLDER}/broken.json`, '{not json');
    expect((await snapshots.list(FOLDER)).map((entry) => entry.snapshot.name)).toEqual(['Good']);
  });
});

describe('snapshots of a scene record', () => {
  afterEach(() => AssetService.resetInstance());

  async function sceneVault(): Promise<{ vault: InMemoryApp; assets: AssetService; snapshots: SceneSnapshotService; folder: string; sceneId: string }> {
    const { vault, snapshots } = await seed();
    AssetService.resetInstance();
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    // The vault check takes the map in as a scene of its collection.
    const [scene] = await assets.getAssets('c', 'scene');
    expect(scene?.data?.mapPath).toBe(MAP_PATH);
    const folder = (await snapshotFolderForMap(assets, MAP_PATH))!;
    await snapshots.create(folder, new TFile(MAP_PATH), 'Ambush', new TextEncoder().encode('JPG').buffer);
    return { vault, assets, snapshots, folder, sceneId: scene!.id };
  }

  it('finds the snapshots by the scene the map belongs to', async () => {
    const { folder, sceneId } = await sceneVault();
    expect(folder).toBe(sceneSnapshotFolder('c', sceneId));
  });

  it('keeps those of a map that belongs to no scene beside it, as every map did before', async () => {
    const { assets } = await sceneVault();
    expect(await snapshotFolderForMap(assets, 'Elsewhere/Loose.atlasmap')).toBe('Elsewhere/.snapshots/Loose');
  });

  it('keeps them in place when the map is renamed or moved within its collection', async () => {
    const { vault, assets, snapshots, folder } = await sceneVault();
    const renamed = `${SCENES}/Dungeons/Goblin cave.atlasmap`;
    const before = new Map([...vault.files].filter(([path]) => path.startsWith(`${folder}/`)));

    await vault.app.fileManager.renameFile(new TFile(MAP_PATH), renamed);
    await new FileReferenceService(vault.app).handleFileRenamed(MAP_PATH, renamed);

    expect(await snapshotFolderForMap(assets, renamed)).toBe(folder);
    expect(await snapshots.list(folder)).toHaveLength(1);
    for (const [path, content] of before) expect(vault.files.get(path)).toBe(content);
  });

  it('trashes them with the scene', async () => {
    const { vault, assets, folder, sceneId } = await sceneVault();
    await assets.deleteAsset(sceneId);
    expect([...vault.files.keys()].some((path) => path.startsWith(`${folder}/`))).toBe(false);
  });

  it('point snapshot tokens at renamed artwork', async () => {
    const { vault, snapshots, folder } = await sceneVault();

    await new FileReferenceService(vault.app).handleFileRenamed('atlas-vtt/assets/goblin.webp', 'atlas-vtt/assets/goblin-boss.webp');

    const [entry] = await snapshots.list(folder);
    expect(entry?.snapshot.name).toBe('Ambush');
    expect(entry?.snapshot.state.objects?.tokens?.goblin?.imagePath).toBe('atlas-vtt/assets/goblin-boss.webp');
  });
});

describe('snapshots of a map outside every collection', () => {
  it('are saved, listed and removed in the hidden folder beside it, and follow it when it is renamed', async () => {
    const { createInMemoryApp: inMemory } = await import('../mocks/inMemoryVault');
    const { SceneSnapshotService: Service } = await import('../../src/app/snapshots/SceneSnapshotService');
    const { followLegacySnapshots } = await import('../../src/app/snapshots/sceneSnapshotFolders');
    const map = JSON.stringify({ version: 4, state: { objects: { tokens: {}, pins: {} } } });
    const vault = inMemory({ files: { 'Elsewhere/Loose.atlasmap': map } });
    const service = new Service(vault.app);
    const folder = 'Elsewhere/.snapshots/Loose';

    const snapshot = await service.create(folder, vault.app.vault.getFileByPath('Elsewhere/Loose.atlasmap'), 'Before the fight', null);
    expect(vault.files.has(`${folder}/${snapshot.id}.json`)).toBe(true);
    expect((await service.list(folder)).map((entry) => entry.snapshot.name)).toEqual(['Before the fight']);

    await vault.app.vault.adapter.rename('Elsewhere/Loose.atlasmap', 'Elsewhere/Keep.atlasmap');
    await followLegacySnapshots(vault.app, 'Elsewhere/Loose.atlasmap', 'Elsewhere/Keep.atlasmap');
    const [entry] = await service.list('Elsewhere/.snapshots/Keep');
    expect(entry?.snapshot.name).toBe('Before the fight');

    await service.delete(entry!);
    expect([...vault.files.keys()].some((path) => path.includes('.snapshots'))).toBe(false);
  });

  it('point their tokens at renamed artwork', async () => {
    const loose = 'Elsewhere/Loose.atlasmap';
    const vault = createInMemoryApp({ files: { [loose]: mapEnvelope({ ...encounterReady, mapPath: loose }) } });
    const service = new SceneSnapshotService(vault.app);
    const folder = legacySnapshotFolderFor(loose);
    await service.create(folder, vault.app.vault.getFileByPath(loose), 'Ambush', null);

    await new FileReferenceService(vault.app).handleFileRenamed('atlas-vtt/assets/goblin.webp', 'atlas-vtt/assets/goblin-boss.webp');

    const [entry] = await service.list(folder);
    expect(entry?.snapshot.state.objects?.tokens?.goblin?.imagePath).toBe('atlas-vtt/assets/goblin-boss.webp');
  });

});
