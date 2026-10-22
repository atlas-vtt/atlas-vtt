import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService, type Asset, type EncounterAsset, type SceneAsset, type TokenAsset } from '../../src/app/services/AssetService';
import { FileReferenceService } from '../../src/app/services/FileReferenceService';
import { transferAssets, type AssetTransferResult } from '../../src/app/services/assetTransfer/assetTransfer';
import { createSnapshot } from '../../src/app/snapshots/sceneSnapshotFormat';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { createInMemoryApp, parseFrontmatter, type InMemoryApp } from '../mocks/inMemoryVault';


const SOURCE = 'atlas-vtt/collections/source';
const TARGET = 'atlas-vtt/collections/target';
const MAP_PATH = `${SOURCE}/scenes/Cave.atlasmap`;
const TOKEN_IMAGE = 'atlas-vtt/assets/goblin.webp';
const TOKEN_THUMB = 'atlas-vtt/assets/thumbnails/goblin-abc.webp';
const STATBLOCK = 'Bestiary/Goblin.md';
const BACKGROUND = `${SOURCE}/files/cave.webp`;
const NOTE = `${SOURCE}/notes/Entrance.md`;

interface Vault { vault: InMemoryApp; assets: AssetService }

const mapFile = (tokens: Record<string, unknown> = {}, pins: Record<string, unknown> = {}): string => JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt', version: 4, background: BACKGROUND, grid: null, camera: { x: 0, y: 0, scale: 1 },
    objects: { tokens, pins, fog: {}, texts: {}, drawings: {}, walls: {}, lights: {} },
  },
}, null, 2);

const goblinOnMap = { t1: { id: 't1', kind: 'character', x: 0, y: 0, imagePath: TOKEN_IMAGE, name: 'Goblin', conditions: ['poisoned', 'custom'] } };
const pinToNote = { p1: { id: 'p1', kind: 'pin', x: 0, y: 0, notePath: `${NOTE}#Door` } };

/** A vault with a source collection holding a token, a scene and an encounter, and an empty target collection. */
async function seededVault(): Promise<Vault> {
  const vault = createInMemoryApp();
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    new TextEncoder().encode(vault.files.get(file.path) ?? '').buffer as ArrayBuffer;
  vault.app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const frontmatter = parseFrontmatter(vault.files.get(file.path) ?? '');
    return frontmatter ? { frontmatter } : null;
  });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('source');
  await assets.createCollection('target');
  for (const [path, content] of Object.entries({
    [TOKEN_IMAGE]: 'IMG', [TOKEN_THUMB]: 'THUMB', [BACKGROUND]: 'BG', [STATBLOCK]: '---\nstatblock: true\n---\nA goblin.',
    [NOTE]: '# Door', [MAP_PATH]: mapFile(goblinOnMap, pinToNote), [`${SOURCE}/scenes/Cave.thumb.jpg`]: 'JPG',
  })) {
    await vault.app.vault.create(path, content);
  }
  await assets.createTag('source', 'tokens', 'Goblinoid');
  await assets.updateCollectionSettings('target', { conditions: [{ id: 'poisoned', name: 'Poisoned', color: '#0f0' }], defaultWidgets: { hpBar: true } });
  await assets.addTokenAsset({ name: 'Goblin', imagePath: TOKEN_IMAGE, thumbnailPath: TOKEN_THUMB, statblockPath: STATBLOCK, collection: 'source', tags: ['goblinoid'] });
  const scene = await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'source', tags: [], data: { mapPath: MAP_PATH } });
  const snapshot = createSnapshot(JSON.parse(mapFile(goblinOnMap)) as never, 'snap1', 'Start', 1000);
  await vault.app.vault.create(`${sceneSnapshotFolder('source', scene.id)}/snap1.json`, JSON.stringify(snapshot));
  await vault.app.vault.create(`${sceneSnapshotFolder('source', scene.id)}/snap1.jpg`, 'SNAPJPG');
  return { vault, assets };
}

async function only<T extends Asset['type']>(assets: AssetService, collection: string, type: T): Promise<Extract<Asset, { type: T }>> {
  const [asset, ...rest] = await assets.getAssets(collection, type);
  expect(rest).toHaveLength(0);
  return asset!;
}

const move = (vault: Vault, ids: string[]): Promise<AssetTransferResult> =>
  transferAssets(vault.vault.app, vault.assets, { assetIds: ids, targetCollectionId: 'target', mode: 'move' });
const copy = (vault: Vault, ids: string[]): Promise<AssetTransferResult> =>
  transferAssets(vault.vault.app, vault.assets, { assetIds: ids, targetCollectionId: 'target', mode: 'copy' });

const mapState = (vault: Vault, path: string): { background: string; tokenSettings?: Record<string, unknown>; objects: { tokens: Record<string, { conditions?: string[]; imagePath: string }>; pins: Record<string, { notePath: string }> } } =>
  (JSON.parse(vault.vault.files.get(path)!) as { state: never }).state;

beforeEach(() => { AssetService.resetInstance(); });

describe('moving assets to another collection', () => {
  it('moves a token with its id and brings its tags along, leaving shared artwork in place', async () => {
    const vault = await seededVault();
    const token = await only(vault.assets, 'source', 'token');

    await move(vault, [token.id]);

    const moved = await only(vault.assets, 'target', 'token');
    expect(moved).toMatchObject({ id: token.id, imagePath: TOKEN_IMAGE, thumbnailPath: TOKEN_THUMB, statblockPath: STATBLOCK });
    expect(await vault.assets.getAssets('source', 'token')).toHaveLength(0);
    expect((await vault.assets.getCollectionTags('target', 'tokens')).map((tag) => tag.name)).toEqual(['Goblinoid']);
    expect(vault.vault.files.get(TOKEN_IMAGE)).toBe('IMG');
  });

  it('takes token art that lives in the source folder along, keeping its folder', async () => {
    const vault = await seededVault();
    const image = `${SOURCE}/tokens/Undead/zombie.webp`;
    await vault.vault.app.vault.create(image, 'ZOMBIE');
    const zombie = await vault.assets.addTokenAsset({ name: 'Zombie', imagePath: image, collection: 'source', tags: [] });

    await move(vault, [zombie.id]);

    const moved = (await vault.assets.getAssetById(zombie.id)) as TokenAsset;
    expect(moved.imagePath).toBe(`${TARGET}/tokens/Undead/zombie.webp`);
    expect(vault.vault.files.get(moved.imagePath)).toBe('ZOMBIE');
    expect(vault.vault.files.has(image)).toBe(false);
  });

  it('moves a scene with its thumbnail and snapshots and adopts the target collection rules', async () => {
    const vault = await seededVault();
    const scene = await only(vault.assets, 'source', 'scene');

    await move(vault, [scene.id]);

    const moved = (await vault.assets.getAssetById(scene.id)) as SceneAsset;
    const newMap = `${TARGET}/scenes/Cave.atlasmap`;
    expect(moved).toMatchObject({ collection: 'target', name: 'Cave', data: { mapPath: newMap } });
    expect(moved.filePath?.startsWith(`${TARGET}/scenes/`)).toBe(true);
    expect(vault.vault.files.has(MAP_PATH)).toBe(false);
    expect(vault.vault.files.get(`${TARGET}/scenes/Cave.thumb.jpg`)).toBe('JPG');
    // Snapshots follow the scene's id into the target collection; the emptied folder goes.
    expect(vault.vault.files.get(`${sceneSnapshotFolder('target', scene.id)}/snap1.jpg`)).toBe('SNAPJPG');
    expect([...vault.vault.files.keys()].some((path) => path.startsWith(`${SOURCE}/snapshots/`))).toBe(false);
    expect(vault.vault.folders.has(sceneSnapshotFolder('source', scene.id))).toBe(false);
    expect(vault.assets.getCollectionForMap(newMap)).toBe('target');

    const state = mapState(vault, newMap);
    expect(state.objects.tokens.t1!.conditions).toEqual(['poisoned']);
    const snapshot = JSON.parse(vault.vault.files.get(`${sceneSnapshotFolder('target', scene.id)}/snap1.json`)!) as { state: { objects: { tokens: Record<string, { conditions: string[] }> } } };
    expect(snapshot.state.objects.tokens.t1!.conditions).toEqual(['poisoned']);
  });

  it('takes files only the scene uses along and copies files the source still needs', async () => {
    const vault = await seededVault();
    await vault.vault.app.vault.create(`${SOURCE}/scenes/Lair.atlasmap`, mapFile());
    await vault.assets.addAsset({ type: 'scene', name: 'Lair', collection: 'source', tags: [], data: { mapPath: `${SOURCE}/scenes/Lair.atlasmap` } });
    const cave = (await vault.assets.getAssets('source', 'scene')).find((scene) => scene.name === 'Cave')!;

    await move(vault, [cave.id]);

    const state = mapState(vault, `${TARGET}/scenes/Cave.atlasmap`);
    expect(state.objects.pins.p1!.notePath).toBe(`${TARGET}/notes/Entrance.md#Door`);
    expect(vault.vault.files.has(NOTE)).toBe(false);
    // Lair still shows the background, so the moved scene gets a copy of its own.
    expect(state.background).toBe(`${TARGET}/files/cave.webp`);
    expect(vault.vault.files.get(BACKGROUND)).toBe('BG');
    expect(mapState(vault, `${SOURCE}/scenes/Lair.atlasmap`).background).toBe(BACKGROUND);
  });

  it('gives a scene a free file name when the target already has one of that name', async () => {
    const vault = await seededVault();
    await vault.vault.app.vault.create(`${TARGET}/scenes/Cave.atlasmap`, mapFile());
    const scene = await only(vault.assets, 'source', 'scene');

    await move(vault, [scene.id]);

    const moved = (await vault.assets.getAssetById(scene.id)) as SceneAsset;
    expect(moved).toMatchObject({ name: 'Cave-2', data: { mapPath: `${TARGET}/scenes/Cave-2.atlasmap` } });
    expect(vault.vault.files.get(`${TARGET}/scenes/Cave-2.thumb.jpg`)).toBe('JPG');
    // Snapshots are found by the scene's id, so the map's new name does not touch them.
    expect(vault.vault.files.has(`${sceneSnapshotFolder('target', scene.id)}/snap1.json`)).toBe(true);
  });

  it('leaves the artwork of a token that stays behind shared with a moved encounter', async () => {
    const vault = await seededVault();
    const image = `${SOURCE}/tokens/Undead/zombie.webp`;
    await vault.vault.app.vault.create(image, 'ZOMBIE');
    const zombie = await vault.assets.addTokenAsset({ name: 'Zombie', imagePath: image, collection: 'source', tags: [] });
    const encounter = await vault.assets.addAsset({
      type: 'encounter', name: 'Horde', collection: 'source', tags: [], tokens: [{ id: zombie.id, name: 'Zombie', imagePath: image }],
    });

    await move(vault, [encounter.id]);

    expect(await only(vault.assets, 'target', 'encounter')).toMatchObject({ tokens: [{ id: zombie.id, imagePath: image }] });
    expect([...vault.vault.files.keys()].filter((path) => path.startsWith(`${TARGET}/tokens/`))).toEqual([]);
  });

  it('copies token art another token of the source collection also shows', async () => {
    const vault = await seededVault();
    const image = `${SOURCE}/tokens/orc.webp`;
    await vault.vault.app.vault.create(image, 'ORC');
    const leaving = await vault.assets.addTokenAsset({ name: 'Orc', imagePath: image, collection: 'source', tags: [] });
    await vault.assets.addTokenAsset({ name: 'Orc chief', imagePath: image, collection: 'source', tags: [] });

    await move(vault, [leaving.id]);

    expect(((await vault.assets.getAssetById(leaving.id)) as TokenAsset).imagePath).toBe(`${TARGET}/tokens/orc.webp`);
    expect(vault.vault.files.get(image)).toBe('ORC');
    expect(vault.vault.files.get(`${TARGET}/tokens/orc.webp`)).toBe('ORC');
  });

  it('puts every file back and changes no record when the transfer fails', async () => {
    const vault = await seededVault();
    const scene = await only(vault.assets, 'source', 'scene');
    const before = new Map(vault.vault.files);
    vi.spyOn(vault.assets, 'commitAssetTransfer').mockRejectedValueOnce(new Error('Disk full'));

    await expect(move(vault, [scene.id])).rejects.toThrow('Disk full. Nothing was changed.');

    expect((await vault.assets.getAssetById(scene.id))?.collection).toBe('source');
    for (const [path, content] of before) expect(vault.vault.files.get(path)).toBe(content);
    expect([...vault.vault.files.keys()].filter((path) => path.startsWith(`${TARGET}/`) && !before.has(path))).toEqual([]);
  });

  it('leaves no record file behind when a copy fails', async () => {
    const vault = await seededVault();
    const map = await vault.assets.addAsset({ type: 'map', name: 'Region', collection: 'source', tags: [], mapFilePath: 'Maps/region.webp' });
    vi.spyOn(vault.assets, 'commitAssetTransfer').mockRejectedValueOnce(new Error('Disk full'));

    await expect(copy(vault, [map.id])).rejects.toThrow('Disk full. Nothing was changed.');

    // The target collection's own record is all its folder holds.
    expect([...vault.vault.files.keys()].filter((path) => path.startsWith(`${TARGET}/`))).toEqual([`${TARGET}/collection.json`]);
  });
});

describe('statblock artwork after a move', () => {
  it('points a statblock note at its token art when the art moves', async () => {
    const vault = await seededVault();
    await vault.vault.app.vault.create('Bestiary/Orc.md', `---\nstatblock: true\nimage: ${TOKEN_IMAGE}\n---\nAn orc.`);

    await new FileReferenceService(vault.vault.app).handleFilesMoved([{ from: TOKEN_IMAGE, to: `${TARGET}/tokens/goblin.webp` }]);

    expect(parseFrontmatter(vault.vault.files.get('Bestiary/Orc.md')!)?.image).toBe(`${TARGET}/tokens/goblin.webp`);
  });
});

describe('copying assets to another collection', () => {
  it('copies a token with its own artwork under a new id and leaves the original alone', async () => {
    const vault = await seededVault();
    const token = await only(vault.assets, 'source', 'token');

    const result = await copy(vault, [token.id]);

    const original = await only(vault.assets, 'source', 'token');
    const copied = await only(vault.assets, 'target', 'token');
    expect(copied.id).not.toBe(token.id);
    expect(result.assets).toEqual([copied]);
    expect(original).toEqual(token);
    expect(copied.imagePath).toBe('atlas-vtt/assets/goblin-2.webp');
    expect(vault.vault.files.get(copied.imagePath)).toBe('IMG');
    expect(vault.vault.files.get(copied.thumbnailPath!)).toBe('THUMB');
    expect(copied.thumbnailPath).not.toBe(TOKEN_THUMB);
    // A statblock may be linked by many tokens: the copy shares the original's.
    expect(copied.statblockPath).toBe(STATBLOCK);

    // Deleting the copy must not take the original's artwork with it.
    await vault.assets.deleteAsset(copied.id);
    expect(vault.vault.files.get(TOKEN_IMAGE)).toBe('IMG');
  });

  it('copies a scene with everything it needs from the source folder', async () => {
    const vault = await seededVault();
    const scene = await only(vault.assets, 'source', 'scene');

    await copy(vault, [scene.id]);

    const copied = await only(vault.assets, 'target', 'scene');
    const newMap = `${TARGET}/scenes/Cave.atlasmap`;
    expect(copied.id).not.toBe(scene.id);
    expect(copied.data?.mapPath).toBe(newMap);
    expect(vault.vault.files.get(MAP_PATH)).toBe(mapFile(goblinOnMap, pinToNote));
    const state = mapState(vault, newMap);
    expect(state.background).toBe(`${TARGET}/files/cave.webp`);
    expect(state.objects.pins.p1!.notePath).toBe(`${TARGET}/notes/Entrance.md#Door`);
    expect(state.objects.tokens.t1!.conditions).toEqual(['poisoned']);
    expect(vault.vault.files.get(`${TARGET}/notes/Entrance.md`)).toBe('# Door');
    // The copy's snapshots are its own, under its new id; the original keeps its own.
    expect(vault.vault.files.get(`${sceneSnapshotFolder('target', copied.id)}/snap1.jpg`)).toBe('SNAPJPG');
    expect(vault.vault.files.has(`${sceneSnapshotFolder('target', copied.id)}/snap1.json`)).toBe(true);
    expect(vault.vault.files.get(`${sceneSnapshotFolder('source', scene.id)}/snap1.jpg`)).toBe('SNAPJPG');
    expect(JSON.parse(vault.vault.files.get(copied.filePath!)!)).toEqual({
      mapPath: newMap,
      atlasRecord: expect.objectContaining({ id: copied.id, type: 'scene', name: 'Cave' }),
    });
  });

  it('keeps the statblock link of a copy whose note lives in the collection and comes along', async () => {
    const vault = await seededVault();
    const note = `${SOURCE}/statblocks/Orc.md`;
    await vault.vault.app.vault.create(note, `---\nstatblock: true\nimage: ${TOKEN_IMAGE}\n---\nAn orc.`);
    await vault.vault.app.vault.create('atlas-vtt/assets/orc.webp', 'ORC');
    const orc = await vault.assets.addTokenAsset({ name: 'Orc', imagePath: 'atlas-vtt/assets/orc.webp', statblockPath: note, collection: 'source', tags: [] });
    await vault.vault.app.vault.process(new TFile(note), (text) => text.replace(TOKEN_IMAGE, orc.imagePath));

    await copy(vault, [orc.id]);

    const copied = await only(vault.assets, 'target', 'token');
    expect(copied.statblockPath).toBe(`${TARGET}/statblocks/Orc.md`);
    expect(parseFrontmatter(vault.vault.files.get(copied.statblockPath!)!)?.image).toBe(copied.imagePath);
    expect(parseFrontmatter(vault.vault.files.get(note)!)?.image).toBe(orc.imagePath);
  });

  it('points copies made together at each other', async () => {
    const vault = await seededVault();
    const token = await only(vault.assets, 'source', 'token');
    const encounter = await vault.assets.addAsset({
      type: 'encounter', name: 'Ambush', collection: 'source', tags: [],
      tokens: [{ id: token.id, name: 'Goblin', imagePath: TOKEN_IMAGE }],
    }) as EncounterAsset;

    await copy(vault, [token.id, encounter.id]);

    const copiedToken = await only(vault.assets, 'target', 'token');
    const copiedEncounter = await only(vault.assets, 'target', 'encounter');
    expect(copiedEncounter.tokens).toEqual([{ id: copiedToken.id, name: 'Goblin', imagePath: copiedToken.imagePath }]);
    expect((await vault.assets.getAssetById(encounter.id)) as EncounterAsset).toMatchObject({ tokens: [{ id: token.id, imagePath: TOKEN_IMAGE }] });
  });

  it('writes the record file of a copied map for its new id and collection', async () => {
    const vault = await seededVault();
    const map = await vault.assets.addAsset({ type: 'map', name: 'Region', collection: 'source', tags: [], mapFilePath: 'Maps/region.webp' });

    const { assets: [copied] } = await copy(vault, [map.id]);

    const record = JSON.parse(vault.vault.files.get(`${TARGET}/maps/${copied!.id}.json`)!) as Record<string, unknown>;
    expect(record).toMatchObject({ id: copied!.id, collection: 'target', mapFilePath: 'Maps/region.webp' });
    expect(vault.vault.files.has(`${SOURCE}/maps/${map.id}.json`)).toBe(true);
  });
});
