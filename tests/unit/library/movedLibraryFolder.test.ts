// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, TFolder, type Plugin } from 'obsidian';
import { AssetService, type Asset, type CollectionMetadata } from '../../../src/app/services/AssetService';
import { registerVaultSync } from '../../../src/app/plugin/vaultSync';
import { closeMapTab } from '../../../src/app/plugin/atlasLeaves';
import { SceneFileWriter } from '../../../src/app/services/sceneFileWriter';
import { showNotice } from '../../../src/app/ui/notice';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

// The check runs at once instead of after the vault went quiet.
vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  debounce: (callback: () => void) => Object.assign(() => callback(), { cancel: (): void => {} }),
}));
vi.mock('../../../src/app/plugin/atlasLeaves', () => ({ closeMapTab: vi.fn(), getLoadedAtlasView: vi.fn(() => null) }));
vi.mock('../../../src/app/ui/notice', () => ({ showNotice: vi.fn() }));

const ROOT = 'atlas-vtt';
const AWAY = 'Games/atlas-vtt';
const FEN = `${ROOT}/collections/Fen`;
const MAP_IMAGE = `${ROOT}/assets/cave.webp`;
const ART = `${FEN}/tokens/hag.webp`;
const SCENE = `${FEN}/scenes/Cave.atlasmap`;
const THUMBNAIL = `${FEN}/scenes/Cave.thumb.jpg`;

const sceneFile = (): string => JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt',
    version: 4,
    mapPath: SCENE,
    background: MAP_IMAGE,
    objects: { tokens: { t1: { id: 't1', imagePath: ART } }, pins: {} },
  },
}, null, 2);

interface Device extends InMemoryApp {
  assets: AssetService;
}

const isHidden = (path: string): boolean => path.split('/').some((part) => part.startsWith('.'));

/** Lets the rename events' passes and the vault check they ask for run to their end. */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 60));

/** Starts Atlas on a vault: the index, its first check, and the vault's events. */
async function start(vault: InMemoryApp): Promise<Device> {
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  registerVaultSync({ app: vault.app, register: vi.fn(), registerEvent: vi.fn() } as unknown as Plugin);
  await settled();
  return { ...vault, assets };
}

/** Obsidian closed and opened again on the same disk and the same device. */
async function restart(device: InMemoryApp): Promise<Device> {
  const rootThere = device.folders.has(ROOT);
  const vault = createInMemoryApp({ files: Object.fromEntries(device.files), folders: [...device.folders] });
  if (!rootThere) vault.folders.delete(ROOT);
  for (const [key, value] of device.localStorage) vault.app.saveLocalStorage(key, value);
  return start(vault);
}

/**
 * A library a GM made in Atlas: a collection with a map, a scene on it, a token and an encounter of that token.
 * Beside them lies what Atlas only found and never wrote a file for: art dropped into the tokens folder, and
 * a folder with a map made in the file manager, which are a token, a collection and a scene all the same.
 */
async function library(): Promise<Device> {
  const device = await start(createInMemoryApp({ files: { [MAP_IMAGE]: 'IMG', 'Notes/Session 1.md': 'The cave' } }));
  const { app, assets } = device;
  await assets.createCollection('Fen');
  await assets.addAsset({ type: 'map', name: 'Cave', collection: 'Fen', tags: [], mapFilePath: MAP_IMAGE });
  const token = await assets.runExclusive(async () => {
    await app.vault.create(ART, 'ART');
    return assets.addTokenAsset({ name: 'Bog hag', imagePath: ART, tags: ['hag'], collection: 'Fen' });
  });
  await assets.runExclusive(async () => {
    await app.vault.create(SCENE, sceneFile());
    await app.vault.create(THUMBNAIL, 'THUMB');
    await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'Fen', tags: [], data: { mapPath: SCENE } });
  });
  await assets.createEncounter({ name: 'Ambush', collection: 'Fen', tags: [], tokens: [{ id: token.id, name: token.name, imagePath: ART }] });
  await assets.getVaultId();
  await app.vault.create(`${FEN}/tokens/imp.webp`, 'ART');
  await app.vault.create(`${ROOT}/collections/Marsh/scenes/Bog.atlasmap`, sceneFile());
  await assets.reconcileWithVault();
  await settled();
  expect((await assets.getAssets()).map((asset) => asset.name).sort()).toEqual(['Ambush', 'Bog', 'Bog hag', 'Cave', 'Cave', 'Imp']);
  return device;
}

/** Renames a file or folder as Obsidian's file explorer does: the folder is reported first, then everything in it. */
async function moveInObsidian(vault: InMemoryApp, from: string, to: string): Promise<void> {
  const inside = [...vault.folders, ...vault.files.keys()].filter((path) => path.startsWith(`${from}/`) && !isHidden(path)).sort();
  const folders = new Set([from, ...inside].filter((path) => vault.folders.has(path)));
  await vault.app.vault.adapter.rename(from, to);
  for (const path of [from, ...inside]) {
    const target = to + path.slice(from.length);
    vault.emit('rename', folders.has(path) ? new TFolder(target) : new TFile(target), path);
  }
  await settled();
}

/** Deletes a folder as Obsidian's file explorer does: everything in it is reported gone, then the folder. */
async function deleteInObsidian(vault: InMemoryApp, folder: string): Promise<void> {
  const inside = [...vault.folders, ...vault.files.keys()].filter((path) => path.startsWith(`${folder}/`) && !isHidden(path)).sort().reverse();
  const folders = new Set([folder, ...inside].filter((path) => vault.folders.has(path)));
  await vault.app.vault.adapter.rmdir(folder, true);
  for (const path of [...inside, folder]) vault.emit('delete', folders.has(path) ? new TFolder(path) : new TFile(path));
  await settled();
}

/** Every file at or below `folder` with its content, as `{ path below the folder: content }`. */
function filesBelow(vault: InMemoryApp, folder: string, hidden = true): Record<string, string> {
  const below = [...vault.files].filter(([path]) => path.startsWith(`${folder}/`) && (hidden || !isHidden(path)));
  return Object.fromEntries(below.map(([path, content]): [string, string] => [path.slice(folder.length + 1), content]).sort(([a], [b]) => a.localeCompare(b)));
}

interface Library {
  /** The library's own files, without this device's hidden cache. */
  files: Record<string, string>;
  assets: Asset[];
  collections: CollectionMetadata[];
  defaultCollection: string;
  vaultId: string | null;
}

/** What the library holds: its files in the vault and what Atlas reads from them. */
async function libraryOf({ assets, ...vault }: Device): Promise<Library> {
  return {
    files: filesBelow(vault, ROOT, false),
    // Copies: the index hands out its own records, which it changes in place.
    assets: structuredClone(await assets.getAssets()).sort((a, b) => a.id.localeCompare(b.id)),
    collections: structuredClone(await assets.getCollections()),
    defaultCollection: assets.getDefaultCollectionId(),
    vaultId: await assets.knownVaultId(),
  };
}

/** Whether anything, hidden or not, lies where the library's folder was. */
const somethingAtRoot = (vault: InMemoryApp): boolean =>
  [...vault.folders, ...vault.files.keys()].some((path) => path === ROOT || path.startsWith(`${ROOT}/`));

afterEach(() => {
  AssetService.resetInstance();
  vi.mocked(closeMapTab).mockClear();
  vi.mocked(showNotice).mockClear();
});

describe('the Atlas folder moved into another folder in Obsidian', () => {
  it('keeps every file as it was: nothing in the moved library is rewritten', async () => {
    const device = await library();
    const before = filesBelow(device, ROOT);

    await moveInObsidian(device, ROOT, AWAY);

    expect(filesBelow(device, AWAY)).toEqual(before);
  });

  it('makes nothing in its old place, so the folder can be moved back', async () => {
    const device = await library();

    await moveInObsidian(device, ROOT, AWAY);

    expect(somethingAtRoot(device)).toBe(false);
  });

  it('holds no library while the folder is away, closes its open scene and says where the library is looked for', async () => {
    const device = await library();

    await moveInObsidian(device, ROOT, AWAY);

    expect(await device.assets.getAssets()).toEqual([]);
    expect(closeMapTab).toHaveBeenCalledWith(device.app, SCENE);
    expect(showNotice).toHaveBeenCalledTimes(1);
    expect(vi.mocked(showNotice).mock.calls[0]?.[0]).toContain(AWAY);
  });

  it('makes nothing there either when an edit of its open scene was still waiting to be saved', async () => {
    const device = await library();
    const writer = new SceneFileWriter<unknown>(device.app, () => true);
    writer.fileSeen(SCENE);
    writer.schedule(SCENE, { state: { revision: 2 }, version: 4 });

    await moveInObsidian(device, ROOT, AWAY);
    await writer.flush();

    expect(somethingAtRoot(device)).toBe(false);
  });

  it('is the library it was once the folder is moved back in Obsidian', async () => {
    const device = await library();
    const before = await libraryOf(device);
    const cache = device.files.get(`${ROOT}/.atlas-data/assets-metadata.json`);

    await moveInObsidian(device, ROOT, AWAY);
    await moveInObsidian(device, AWAY, ROOT);

    expect(await libraryOf(device)).toEqual(before);
    expect(JSON.parse(device.files.get(`${ROOT}/.atlas-data/assets-metadata.json`)!)).toEqual(JSON.parse(cache!));
  });

  it('is the library it was when the folder is put back while Atlas is off, as after a rename with Obsidian closed', async () => {
    const device = await library();
    const before = await libraryOf(device);

    await moveInObsidian(device, ROOT, AWAY);
    await device.app.vault.adapter.rename(AWAY, ROOT);
    const restarted = await restart(device);

    expect(await libraryOf(restarted)).toEqual(before);
  });

  it('is the library it was after a start without it, once the empty folder that start made is deleted and the library renamed back, both while Atlas is off', async () => {
    const device = await library();
    const before = await libraryOf(device);

    await moveInObsidian(device, ROOT, AWAY);
    const without = await restart(device);
    await without.app.vault.adapter.rmdir(ROOT, true);
    await without.app.vault.adapter.rename(AWAY, ROOT);
    const restarted = await restart(without);

    expect(await libraryOf(restarted)).toEqual(before);
  });

  it('does not make the folder again once the GM deletes the empty one a start without the library made, and takes the library back', async () => {
    const device = await library();
    const before = await libraryOf(device);

    await moveInObsidian(device, ROOT, AWAY);
    const without = await restart(device);
    expect(without.folders.has(`${ROOT}/collections`)).toBe(true);
    await deleteInObsidian(without, ROOT);
    expect(somethingAtRoot(without)).toBe(false);
    await moveInObsidian(without, AWAY, ROOT);

    expect(await libraryOf(without)).toEqual(before);
  });

  it('is renamed in place just the same', async () => {
    const device = await library();
    const before = await libraryOf(device);

    await moveInObsidian(device, ROOT, 'Atlas library');
    expect(somethingAtRoot(device)).toBe(false);
    await moveInObsidian(device, 'Atlas library', ROOT);

    expect(await libraryOf(device)).toEqual(before);
  });
});

describe('the Atlas folder moved while Obsidian is closed', () => {
  it('is left alone where it lies, and is the library it was once it is moved back', async () => {
    const device = await library();
    const before = await libraryOf(device);
    const files = filesBelow(device, ROOT);

    await device.app.vault.adapter.rename(ROOT, AWAY);
    const without = await restart(device);
    expect(filesBelow(without, AWAY)).toEqual(files);
    expect(await without.assets.getAssets()).toEqual([]);

    await without.app.vault.adapter.rmdir(ROOT, true);
    await without.app.vault.adapter.rename(AWAY, ROOT);
    expect(await libraryOf(await restart(without))).toEqual(before);
  });
});

describe('a file moved out of the Atlas folder on its own', () => {
  it('is followed as before: the scene and the map name the image where it lies now', async () => {
    const device = await library();

    await moveInObsidian(device, MAP_IMAGE, 'Maps/cave.webp');

    expect(JSON.parse(device.files.get(SCENE)!).state.background).toBe('Maps/cave.webp');
    expect(await device.assets.getAssets('Fen', 'map')).toEqual([expect.objectContaining({ mapFilePath: 'Maps/cave.webp' })]);
  });
});
