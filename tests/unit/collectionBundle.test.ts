// @vitest-environment node
// JSZip needs Node's ArrayBuffer realm; jsdom's differs and its Blob support is absent.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AtlasView } from '../../src/app/atlas-view';
import { bundleNoteKeys } from '../../src/app/extensions/bundleNoteKeys';
import { AssetService } from '../../src/app/services/AssetService';
import { transferAssets } from '../../src/app/services/assetTransfer/assetTransfer';
import { groupContents } from '../../src/app/services/collectionBundle/bundleContents';
import type { BundleFile } from '../../src/app/services/collectionBundle/bundleFormat';
import { exportCollectionBundle, prepareCollectionExport, type ExportChoice } from '../../src/app/services/collectionBundle/collectionExport';
import { openCollectionImport, type ImportDecision } from '../../src/app/services/collectionBundle/collectionImport';
import type { ImportReview } from '../../src/app/services/collectionBundle/importReview';
import { readInstallRecord } from '../../src/app/services/collectionBundle/installRecord';
import { noteTree } from '../../src/app/services/collectionBundle/noteTree';
import { createSnapshot } from '../../src/app/snapshots/sceneSnapshotFormat';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { createInMemoryApp, parseFrontmatter, type InMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/atlas-view', () => ({
  ATLAS_VIEW_TYPE: 'atlas-vtt',
  AtlasView: class { async saveMap(): Promise<void> {} },
}));

// Covers are drawn on a canvas, which Node lacks.
vi.mock('../../src/app/imageProcessing/imageProcessing', () => ({
  optimizeImage: vi.fn(async (source: Blob) => ({ image: new Blob([`COVER:${await source.text()}`]), thumbnail: null, preview: null })),
}));

// Obsidian runs a base's query; here each base holds the item notes a test gives it.
const lootItems = vi.hoisted(() => new Map<string, string[]>());
vi.mock('../../src/app/loot/lootBaseItems', () => ({
  readLootBaseItems: vi.fn(async (_app: unknown, path: string) => lootItems.get(path) ?? null),
}));

const MAP_PATH = 'atlas-vtt/collections/source/scenes/Cave.atlasmap';
const NOTE_PATH = 'Bestiary/Goblin.md';
const NOTE_IMAGE = 'Bestiary/goblin.png';
const TOKEN_IMAGE = 'atlas-vtt/assets/goblin_1.webp';
const TOKEN_THUMB = 'atlas-vtt/assets/thumbnails/goblin_1-abc.webp';
const BACKGROUND = 'atlas-vtt/assets/cave_bg.webp';

const mapFile = (hp = 7): string => JSON.stringify({
  version: 4,
  state: {
    schema: 'atlas-vtt', version: 4, mapPath: MAP_PATH, background: BACKGROUND, grid: null, camera: { x: 0, y: 0, scale: 1 },
    objects: {
      tokens: { t1: { id: 't1', kind: 'character', x: 0, y: 0, imagePath: TOKEN_IMAGE, showRing: false, statblockPath: NOTE_PATH, name: 'Goblin', hp } },
      fog: {}, pins: {}, texts: {}, drawings: {}, walls: {}, lights: {},
    },
  },
});

/** Binary reads must produce buffers from this realm, and the metadata cache must see the seeded frontmatter. */
function stubFileReads(vault: InMemoryApp): void {
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    new TextEncoder().encode(vault.files.get(file.path) ?? '').buffer as ArrayBuffer;
  vault.app.metadataCache.getFileCache = vi.fn((file: TFile) => {
    const frontmatter = parseFrontmatter(vault.files.get(file.path) ?? '');
    return frontmatter ? { frontmatter } : null;
  });
}

function service(vault: InMemoryApp): AssetService {
  AssetService.resetInstance();
  return AssetService.getInstance(vault.app);
}

interface Vault { vault: InMemoryApp; assets: AssetService }

async function emptyVault(files: Record<string, string> = {}): Promise<Vault> {
  const vault = createInMemoryApp({ files });
  stubFileReads(vault);
  const assets = service(vault);
  await assets.initialize();
  return { vault, assets };
}

/** The creator's vault with a collection of a token, a scene and an encounter. */
async function creatorVault(): Promise<Vault> {
  const creator = await emptyVault();
  const { vault, assets } = creator;
  await assets.createCollection('source');
  for (const [path, content] of Object.entries({
    [TOKEN_IMAGE]: 'IMG', [TOKEN_THUMB]: 'THUMB', [BACKGROUND]: 'BG', [MAP_PATH]: mapFile(),
    'atlas-vtt/collections/source/scenes/Cave.thumb.jpg': 'JPG',
    [NOTE_PATH]: '---\nstatblock: true\nimage: "[[goblin.png]]"\n---\nA goblin.',
    [NOTE_IMAGE]: 'PNG',
  })) {
    await vault.app.vault.create(path, content);
  }
  await assets.createTag('source', 'tokens', 'Dragon');
  await assets.updateCollectionSettings('source', { conditions: [{ id: 'c1', name: 'Poisoned', color: '#0f0' }] });
  await assets.addTokenAsset({ name: 'Goblin', imagePath: TOKEN_IMAGE, thumbnailPath: TOKEN_THUMB, statblockPath: NOTE_PATH, showRing: false, size: 1.5, collection: 'source', tags: ['dragon'] });
  await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'source', tags: [], data: { mapPath: MAP_PATH } });
  await assets.addAsset({ type: 'encounter', name: 'Ambush', collection: 'source', tags: [], tokens: [{ id: 'g', name: 'Goblin', imagePath: TOKEN_IMAGE, statblockPath: NOTE_PATH }] });
  return creator;
}

async function exportFrom({ vault, assets }: Vault, choice?: ExportChoice, collectionId = 'source'): Promise<Blob> {
  AssetService.resetInstance();
  const preview = await prepareCollectionExport(vault.app, assets, collectionId);
  const bundle = await exportCollectionBundle(vault.app, assets, preview, choice ?? { kind: 'release', version: preview.suggestedVersion });
  await bundle.commit();
  return bundle.blob;
}

/** Pins `notePath` on the creator's scene and creates the note. */
async function pinNote({ vault }: Vault, notePath: string, content: string): Promise<void> {
  const map = JSON.parse(vault.files.get(MAP_PATH)!) as { state: { objects: { pins: Record<string, unknown> } } };
  map.state.objects.pins = { p1: { id: 'p1', kind: 'pin', x: 0, y: 0, notePath } };
  vault.files.set(MAP_PATH, JSON.stringify(map));
  await vault.app.vault.create(notePath.split('#')[0]!, content);
}

interface PackedManifest {
  collection: Record<string, unknown>;
  assets: Array<{ id: string; name: string }>;
  files: Array<{ vaultPath: string; role: string; owners?: string[] }>;
}

async function manifestOf(blob: Blob): Promise<PackedManifest> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return JSON.parse(await zip.file('manifest.json')!.async('string')) as PackedManifest;
}

async function reviewImport({ vault, assets }: Vault, blob: Blob): Promise<{ review: ImportReview; apply: (decision?: ImportDecision) => ReturnType<Awaited<ReturnType<typeof openCollectionImport>>['apply']> }> {
  const session = await openCollectionImport(vault.app, assets, blob);
  return { review: session.review, apply: (decision = {}) => session.apply(decision) };
}

async function importInto(target: Vault, blob: Blob, decision: ImportDecision = {}): Promise<ImportReview> {
  const { review, apply } = await reviewImport(target, blob);
  await apply(decision);
  return review;
}

/** Saves a snapshot of the creator's scene in which an ogre with artwork of its own stands; returns the snapshot folder. */
async function withOgreSnapshot({ vault, assets }: Vault, ogreImage: string): Promise<string> {
  const [scene] = await assets.getAssets('source', 'scene');
  const folder = sceneSnapshotFolder('source', scene!.id);
  const snapshot = createSnapshot({ version: 4, state: {
    schema: 'atlas-vtt', version: 4, background: BACKGROUND, grid: null,
    objects: { tokens: { o1: { id: 'o1', kind: 'character', x: 0, y: 0, imagePath: ogreImage, statblockPath: NOTE_PATH, name: 'Ogre', hp: 30 } } },
  } }, 'snap1', 'Ogre ambush', 1000);
  await vault.app.vault.create(ogreImage, 'OGRE');
  await vault.app.vault.create(`${folder}/snap1.json`, JSON.stringify(snapshot));
  await vault.app.vault.create(`${folder}/snap1.jpg`, 'SNAPJPG');
  return folder;
}

/** `blob` as an earlier version wrote it: snapshot files under `legacyFolder`, owned by `owners` when given. */
async function withLegacySnapshotPaths(blob: Blob, legacyFolder: string, owners?: string[]): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as PackedManifest;
  for (const file of manifest.files.filter((entry) => entry.role.startsWith('scene-snapshot'))) {
    const legacyPath = `${legacyFolder}/${file.vaultPath.slice(file.vaultPath.lastIndexOf('/') + 1)}`;
    zip.file(`files/${legacyPath}`, await zip.file(`files/${file.vaultPath}`)!.async('arraybuffer'));
    zip.remove(`files/${file.vaultPath}`);
    file.vaultPath = legacyPath;
    if (owners) file.owners = owners;
  }
  zip.file('manifest.json', JSON.stringify(manifest));
  return new Blob([await zip.generateAsync({ type: 'arraybuffer' })]);
}

const theirs = (unit: string): ImportDecision => ({ resolutions: new Map([[unit, 'theirs']]) });

beforeEach(() => { AssetService.resetInstance(); });

describe('exporting', () => {
  it('packs every file with its checksum and owners, and reports missing references', async () => {
    const creator = await creatorVault();
    creator.vault.files.delete(BACKGROUND);
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    expect(preview).toMatchObject({ publisher: 'self', minimumVersion: 1, suggestedVersion: 1 });
    expect(preview.missing).toEqual([expect.objectContaining({ path: BACKGROUND, assetName: 'Cave' })]);

    const bundle = await exportCollectionBundle(creator.vault.app, creator.assets, preview, { kind: 'release', version: 1, author: 'Dungeon Tube', notes: 'First release' });
    expect(bundle.fileName).toBe('source v1.atlas-collection.zip');
    expect((await creator.assets.getCollection('source'))?.releasedAt).toBeUndefined();
    await bundle.commit();
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await bundle.blob.arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as {
      format: number; release: unknown; collection: Record<string, unknown>; files: Array<{ vaultPath: string; sha256: string; owners: string[] }>;
    };
    expect(manifest).toMatchObject({ format: 6, release: { kind: 'release', notes: 'First release' }, collection: { version: 1, author: 'Dungeon Tube' } });
    const image = manifest.files.find((file) => file.vaultPath === TOKEN_IMAGE)!;
    expect(image.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(image.owners).toHaveLength(3);
    expect(Object.keys(zip.files)).toEqual(expect.arrayContaining([`files/${MAP_PATH}`, `files/${NOTE_PATH}`, `files/${NOTE_IMAGE}`]));
    expect(await creator.assets.getCollection('source')).toMatchObject({ version: 1, author: 'Dungeon Tube', releasedAt: expect.any(Number) });
  });

  it('leaves out the content the user excluded and every file only it uses', async () => {
    const creator = await creatorVault();
    const [scene] = await creator.assets.getAssets('source', 'scene');
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    const bundle = await exportCollectionBundle(creator.vault.app, creator.assets, preview, {
      kind: 'release', version: 1, excluded: new Set([`asset:${scene!.id}`, `file:${NOTE_PATH}`]),
    });
    const manifest = await manifestOf(bundle.blob);
    expect(manifest.assets.map((asset) => asset.name).sort()).toEqual(['Ambush', 'Goblin']);
    const paths = manifest.files.map((file) => file.vaultPath);
    for (const path of [MAP_PATH, BACKGROUND, NOTE_PATH, NOTE_IMAGE]) expect(paths).not.toContain(path);
    expect(manifest.files.find((file) => file.vaultPath === TOKEN_IMAGE)?.owners).toHaveLength(2);
    expect(bundle.assetCount).toBe(2);
  });

  it('leaves records of removed features, such as player groups, out of the export', async () => {
    const creator = await creatorVault();
    await creator.assets.addAsset({ type: 'player', name: 'Party', collection: 'source', tags: [], tokens: [] });
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    expect(preview.assets.map((asset) => asset.type).sort()).toEqual(['encounter', 'scene', 'token']);
  });

  it('carries the notes pins open and keeps every pin pointing at its heading', async () => {
    const creator = await creatorVault();
    await pinNote(creator, 'Lore/Cave.md#Door', '# Door\nLocked.');
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    expect(preview.files).toContainEqual(expect.objectContaining({ vaultPath: 'Lore/Cave.md', role: 'linked-note' }));

    const fan = await emptyVault();
    const review = await importInto(fan, await exportFrom(creator));
    expect(review.contents.find((group) => group.category === 'notes')?.items).toEqual([
      { key: 'file:Lore/Cave.md', name: 'Cave', depth: 0, origin: { kind: 'scene', name: 'Cave', more: 0 } },
    ]);
    const notes = 'atlas-vtt/collections/source/notes/Lore';
    expect(fan.vault.files.get(`${notes}/Cave.md`)).toBe('# Door\nLocked.');
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.pins.p1.notePath).toBe(`${notes}/Cave.md#Door`);
  });

  it("strips a registered note property from the bundle, installs without it and leaves the sender's note alone", async () => {
    const stop = bundleNoteKeys.add('test', ['ext-share']);
    try {
      const creator = await creatorVault();
      const lore = '---\next-share: [Ana]\nstatus: draft\n---\n# Door\nLocked.';
      const goblin = '---\nstatblock: true\next-share: public\nimage: "[[goblin.png]]"\n---\nA goblin.';
      await pinNote(creator, 'Lore/Cave.md#Door', lore);
      creator.vault.files.set(NOTE_PATH, goblin);
      const blob = await exportFrom(creator);
      const { default: JSZip } = await import('jszip');
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const manifest = await manifestOf(blob) as PackedManifest & { files: Array<{ vaultPath: string; sha256: string }> };
      const packed = async (path: string): Promise<string> => zip.file(`files/${path}`)!.async('string');
      expect(await packed('Lore/Cave.md')).toBe('---\nstatus: draft\n---\n# Door\nLocked.');
      expect(await packed(NOTE_PATH)).toBe('---\nstatblock: true\nimage: "[[goblin.png]]"\n---\nA goblin.');
      // The checksum is of the bytes in the zip, so a later install sees them as the sender's release
      for (const path of ['Lore/Cave.md', NOTE_PATH]) {
        const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', await zip.file(`files/${path}`)!.async('arraybuffer')))).map((byte) => byte.toString(16).padStart(2, '0')).join('');
        expect(manifest.files.find((file) => file.vaultPath === path)?.sha256).toBe(digest);
      }
      expect(creator.vault.files.get('Lore/Cave.md')).toBe(lore);
      expect(creator.vault.files.get(NOTE_PATH)).toBe(goblin);

      const fan = await emptyVault();
      await importInto(fan, blob);
      expect(fan.vault.files.get('atlas-vtt/collections/source/notes/Lore/Cave.md')).toBe('---\nstatus: draft\n---\n# Door\nLocked.');
      expect([...fan.vault.files.values()].some((text) => text.includes('ext-share'))).toBe(false);
    } finally {
      stop();
    }
  });

  it('packs the chosen cover, keeps it with the collection and installs it with the collection', async () => {
    const creator = await creatorVault();
    const [scene] = await creator.assets.getAssets('source', 'scene');
    const thumbnail = 'atlas-vtt/collections/source/scenes/Cave.thumb.jpg';
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    expect(preview.cover).toBeUndefined();
    // A scene offers its full background as cover art, previewed through its thumbnail.
    expect(preview.coverCandidates).toEqual([{
      key: scene!.id, name: 'Cave', sourcePath: BACKGROUND, imageUrl: `app://vault/${BACKGROUND}`, previewUrl: `app://vault/${thumbnail}`,
    }]);

    const bundle = await exportCollectionBundle(creator.vault.app, creator.assets, preview, { kind: 'release', version: 1, cover: { kind: 'artwork', path: BACKGROUND } });
    await bundle.commit();
    const cover = 'atlas-vtt/collections/source/cover.webp';
    expect((await manifestOf(bundle.blob)).collection.coverPath).toBe(cover);
    expect(creator.vault.files.get(cover)).toBe('COVER:BG');
    expect((await prepareCollectionExport(creator.vault.app, creator.assets, 'source')).cover).toEqual({ path: cover, url: `app://vault/${cover}` });

    const fan = await emptyVault();
    const review = await importInto(fan, bundle.blob);
    expect(await review.cover?.text()).toBe('COVER:BG');
    expect(await fan.assets.getCollection('source')).toMatchObject({ coverPath: cover });
    expect(fan.vault.files.get(cover)).toBe('COVER:BG');
  });

  it('suggests the next version after a release and refuses releases by anyone but the publisher', async () => {
    const creator = await creatorVault();
    await exportFrom(creator);
    expect((await prepareCollectionExport(creator.vault.app, creator.assets, 'source')).suggestedVersion).toBe(2);

    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator, { kind: 'release', version: 2 }));
    const preview = await prepareCollectionExport(fan.vault.app, fan.assets, 'source');
    expect(preview.publisher).toBe('other');
    await expect(exportCollectionBundle(fan.vault.app, fan.assets, preview, { kind: 'release', version: 3 })).rejects.toThrow(/publisher/);
  });
});

describe('installing', () => {
  it('installs a collection with working scenes, statblock links and settings, and records the install', async () => {
    const fan = await emptyVault();
    const review = await importInto(fan, await exportFrom(await creatorVault()));
    expect(review).toMatchObject({ relation: 'new', version: 1, conflicts: [] });
    expect(review.contents.map((group) => [group.label, group.items.map((item) => item.name)])).toEqual([
      ['Scenes', ['Cave']], ['Maps', []], ['Tokens', ['Goblin']], ['Encounters', ['Ambush']], ['Statblocks', ['Goblin']], ['Notes', []],
    ]);
    // Token cards show the bundle's art, ring and statblock before anything is written.
    expect(review.contents.find((group) => group.category === 'tokens')?.items[0]?.token).toEqual({
      imagePath: TOKEN_IMAGE, thumbnailPath: TOKEN_THUMB, showRing: false, statblockPath: NOTE_PATH,
    });

    const collection = await fan.assets.getCollection('source');
    expect(collection).toMatchObject({ name: 'source', version: 1, tags: { 'tokens:dragon': { id: 'dragon', name: 'Dragon', group: 'tokens' } } });
    expect(collection?.settings.conditions).toEqual([{ id: 'c1', name: 'Poisoned', color: '#0f0' }]);
    const statblocks = 'atlas-vtt/collections/source/statblocks';
    const [token] = await fan.assets.getAssets('source', 'token');
    expect(token).toMatchObject({ imagePath: TOKEN_IMAGE, statblockPath: `${statblocks}/Goblin.md`, showRing: false, size: 1.5 });
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.statblockPath).toBe(`${statblocks}/Goblin.md`);
    expect(parseFrontmatter(fan.vault.files.get(`${statblocks}/Goblin.md`)!)).toMatchObject({ image: `${statblocks}/goblin.png` });
    expect(await readInstallRecord(fan.vault.app, collection!)).toMatchObject({ version: 1, collectionId: 'source' });
    // In the collection's folder, so it syncs and moves with the collection.
    expect(fan.vault.files.has('atlas-vtt/collections/source/install.json')).toBe(true);
  });

  it('carries scene snapshots with their thumbnails and artwork into the installed collection', async () => {
    const creator = await creatorVault();
    const ogreImage = 'atlas-vtt/assets/ogre.webp';
    const snapshotFolder = await withOgreSnapshot(creator, ogreImage);

    const blob = await exportFrom(creator);
    const packed = (await manifestOf(blob)).files.filter((file) => file.role.startsWith('scene-snapshot'));
    expect(packed.map((file) => file.vaultPath).sort()).toEqual([`${snapshotFolder}/snap1.jpg`, `${snapshotFolder}/snap1.json`]);
    const fan = await emptyVault();
    await importInto(fan, blob);
    const restored = JSON.parse(fan.vault.files.get(`${snapshotFolder}/snap1.json`)!) as typeof snapshot;
    expect(restored).toMatchObject({ id: 'snap1', name: 'Ogre ambush' });
    expect(restored.state.objects?.tokens?.o1).toMatchObject({ imagePath: ogreImage, statblockPath: 'atlas-vtt/collections/source/statblocks/Goblin.md' });
    expect(fan.vault.files.get(`${snapshotFolder}/snap1.jpg`)).toBe('SNAPJPG');
    expect(fan.vault.files.get(ogreImage)).toBe('OGRE');
  });

  it('places the snapshots of a bundle an earlier version wrote, in hidden folders, by their scene', async () => {
    const creator = await creatorVault();
    const snapshotFolder = await withOgreSnapshot(creator, 'atlas-vtt/assets/ogre.webp');
    const legacy = await withLegacySnapshotPaths(await exportFrom(creator), 'atlas-vtt/collections/source/scenes/.snapshots/Cave');

    const fan = await emptyVault();
    await importInto(fan, legacy);
    expect(JSON.parse(fan.vault.files.get(`${snapshotFolder}/snap1.json`)!)).toMatchObject({ id: 'snap1', name: 'Ogre ambush' });
    expect(fan.vault.files.get(`${snapshotFolder}/snap1.jpg`)).toBe('SNAPJPG');
    expect([...fan.vault.files.keys()].filter((path) => path.includes('.snapshots'))).toEqual([]);
  });

  it('refuses a hidden snapshot path that belongs to no scene of the bundle', async () => {
    const creator = await creatorVault();
    await withOgreSnapshot(creator, 'atlas-vtt/assets/ogre.webp');
    const legacy = await withLegacySnapshotPaths(await exportFrom(creator), '.obsidian/.snapshots/Cave', []);
    await expect(reviewImport(await emptyVault(), legacy)).rejects.toThrow(/will not write/);
  });

  it('imports a different collection with a name the vault already uses under a name of the user\'s choice', async () => {
    const fan = await emptyVault();
    await fan.assets.createCollection('source');
    const { review, apply } = await reviewImport(fan, await exportFrom(await creatorVault()));
    expect(review).toMatchObject({ relation: 'new', suggestedName: 'source (2)' });
    await expect(apply({ name: 'source' })).rejects.toThrow(/already exists/);
    await apply({ name: 'source (2)' });
    const names = (await fan.assets.getCollections()).map((collection) => collection.name);
    expect(names).toEqual(expect.arrayContaining(['source', 'source (2)']));
    expect(await fan.assets.getAssets('source')).toHaveLength(0);
  });

  it('gives a copy imported next to its source fresh asset ids and leaves the source alone', async () => {
    const creator = await creatorVault();
    const snapshotFolder = await withOgreSnapshot(creator, 'atlas-vtt/assets/ogre.webp');
    const sourceAssets = await creator.assets.getAssets('source');
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportFrom(creator)).arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { collection: { uid: string; name: string } };
    manifest.collection = { ...manifest.collection, uid: crypto.randomUUID(), name: 'Source copy' };
    zip.file('manifest.json', JSON.stringify(manifest));
    await importInto(creator, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]));

    expect(await creator.assets.getAssets('source')).toEqual(sourceAssets);
    const copied = await creator.assets.getAssets('Source copy');
    expect(copied).toHaveLength(3);
    expect(copied.every((asset) => !sourceAssets.some((original) => original.id === asset.id))).toBe(true);
    const [scene] = await creator.assets.getAssets('Source copy', 'scene');
    expect(scene?.data?.mapPath).toBe('atlas-vtt/collections/Source copy/scenes/Cave.atlasmap');
    // The copy's snapshots are found by its own new id; the original's stay where they were.
    expect(creator.vault.files.get(`${sceneSnapshotFolder('Source copy', scene!.id)}/snap1.jpg`)).toBe('SNAPJPG');
    expect(creator.vault.files.get(`${snapshotFolder}/snap1.jpg`)).toBe('SNAPJPG');
  });

  it('keeps statblock notes the vault already has and never rewrites them', async () => {
    const original = '---\nstatblock: true\nimage: "[[goblin.png]]"\n---\nLocal goblin.';
    const fan = await emptyVault({ [NOTE_PATH]: original, [NOTE_IMAGE]: 'LOCAL PNG' });
    await importInto(fan, await exportFrom(await creatorVault()));
    const [token] = await fan.assets.getAssets('source', 'token');
    expect(token?.statblockPath).toBe(NOTE_PATH);
    expect(fan.vault.files.get(NOTE_PATH)).toBe(original);
    expect(fan.vault.files.get(NOTE_IMAGE)).toBe('LOCAL PNG');
  });

  it('still installs bundles exported before format 3', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportFrom(await creatorVault())).arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as Record<string, unknown> & { files: Array<Record<string, unknown>> };
    const legacy = {
      ...manifest, format: 2, release: undefined,
      files: manifest.files.map(({ sha256: _hash, owners: _owners, ...file }) => file),
    };
    zip.file('manifest.json', JSON.stringify(legacy));
    const fan = await emptyVault();
    const review = await importInto(fan, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]));
    expect(review).toMatchObject({ relation: 'new', kind: 'release' });
    expect(await fan.assets.getAssets('source')).toHaveLength(3);
  });

  it('rejects a damaged bundle before writing anything', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportFrom(await creatorVault())).arrayBuffer());
    zip.file(`files/${TOKEN_IMAGE}`, 'TAMPERED');
    const fan = await emptyVault();
    await expect(openCollectionImport(fan.vault.app, fan.assets, new Blob([await zip.generateAsync({ type: 'arraybuffer' })])))
      .rejects.toThrow(/damaged: 1 file does not match its checksum \(goblin_1\.webp\)/);
    expect(fan.vault.files.has(TOKEN_IMAGE)).toBe(false);
  });

  it('rolls back every file it wrote when the import fails', async () => {
    const fan = await emptyVault();
    const before = new Map(fan.vault.files);
    let writes = 0;
    const createBinary = fan.vault.app.vault.createBinary.bind(fan.vault.app.vault);
    fan.vault.app.vault.createBinary = vi.fn(async (path: string, data: ArrayBuffer) => {
      if (++writes === 4) throw new Error('Disk full');
      return createBinary(path, data);
    });
    const { apply } = await reviewImport(fan, await exportFrom(await creatorVault()));
    await expect(apply()).rejects.toThrow('The import failed: Disk full. Nothing was changed.');
    expect(new Map(fan.vault.files)).toEqual(before);
    expect(await fan.assets.getCollection('source')).toBeNull();
  });
});

describe('updating', () => {
  async function installedV1(): Promise<{ creator: Vault; fan: Vault }> {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    AssetService.resetInstance();
    return { creator, fan };
  }

  it('reports the same version as up to date, and restores what the user changed only when asked', async () => {
    const { creator, fan } = await installedV1();
    const v1 = await exportFrom(creator, { kind: 'release', version: 1 });
    expect((await reviewImport(fan, v1)).review).toMatchObject({ relation: 'same', upToDate: true, canRestore: false, conflicts: [] });

    fan.vault.files.set(MAP_PATH, 'PLAYED');
    const { review, apply } = await reviewImport(fan, v1);
    expect(review).toMatchObject({ relation: 'same', upToDate: true, canRestore: true, counts: { kept: 1 } });
    const result = await apply({ restore: true });
    expect(result).toMatchObject({ written: 1, backupCount: 1 });
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.hp).toBe(7);
    expect(fan.vault.files.get(`${result.backupFolder}/${MAP_PATH}`)).toBe('PLAYED');
  });

  it("keeps the data an extension holds on the user's scene when an update replaces the scene", async () => {
    const { creator, fan } = await installedV1();
    const [local] = await fan.assets.getAssets('source', 'scene');
    await fan.assets.updateAsset(local!.id, { data: { ...local!.data, extensions: { 'some-extension': { item: 'shared' } } } });
    const [scene] = await creator.assets.getAssets('source', 'scene');
    await creator.assets.updateAsset(scene!.id, { name: 'Deep Cave' });

    const { review, apply } = await reviewImport(fan, await exportFrom(creator, { kind: 'release', version: 2 }));
    expect(review).toMatchObject({ relation: 'newer', conflicts: [] });
    await apply();

    expect(await fan.assets.getAssetById(local!.id)).toMatchObject({ name: 'Deep Cave', data: { mapPath: MAP_PATH, extensions: { 'some-extension': { item: 'shared' } } } });
  });

  it("does not take an installed scene for edited when an extension keeps data on it, and keeps that data out of its record file", async () => {
    const { creator, fan } = await installedV1();
    const [local] = await fan.assets.getAssets('source', 'scene');
    await fan.assets.updateAsset(local!.id, { data: { ...local!.data, extensions: { 'some-extension': { item: 'shared' } } } });
    const recordFile = [...fan.vault.files.entries()].find(([path]) => path.endsWith(`${local!.id}.json`));
    expect(recordFile?.[1]).not.toContain('some-extension');
    const { review } = await reviewImport(fan, await exportFrom(creator, { kind: 'release', version: 1 }));
    expect(review).toMatchObject({ relation: 'same', upToDate: true, canRestore: false, counts: { kept: 0 } });
  });

  it('applies a newer release: new, changed and removed assets, with backups of what it replaced', async () => {
    const { creator, fan } = await installedV1();
    const [encounter] = await creator.assets.getAssets('source', 'encounter');
    const [token] = await creator.assets.getAssets('source', 'token');
    creator.vault.files.set(MAP_PATH, mapFile(12));
    await creator.assets.updateAsset(token!.id, { name: 'Goblin Boss' });
    await creator.assets.deleteAsset(encounter!.id);
    await creator.vault.app.vault.create('atlas-vtt/assets/orc.webp', 'ORC');
    await creator.assets.addTokenAsset({ name: 'Orc', imagePath: 'atlas-vtt/assets/orc.webp', collection: 'source', tags: [] });

    const { review, apply } = await reviewImport(fan, await exportFrom(creator, { kind: 'release', version: 2, notes: 'Orcs!' }));
    expect(review).toMatchObject({ relation: 'newer', installedVersion: 1, version: 2, releaseNotes: 'Orcs!', conflicts: [] });
    expect(review.counts).toMatchObject({ added: 1, updated: 2, removed: 1 });
    const result = await apply();

    expect(result).toMatchObject({ created: false, version: 2 });
    expect((await fan.assets.getAssets('source', 'token')).map((asset) => asset.name).sort()).toEqual(['Goblin Boss', 'Orc']);
    expect(await fan.assets.getAssets('source', 'encounter')).toHaveLength(0);
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.hp).toBe(12);
    expect(fan.vault.files.get(`${result.backupFolder}/${MAP_PATH}`)).toContain('"hp":7');
    expect((await fan.assets.getCollection('source'))?.version).toBe(2);
  });

  it('keeps the user\'s changes the update does not touch, and their rename of the collection', async () => {
    const { creator, fan } = await installedV1();
    const [token] = await fan.assets.getAssets('source', 'token');
    await fan.assets.updateAsset(token!.id, { name: 'My goblin' });
    // The collection's folder takes the new name, and the update finds its files there.
    await fan.assets.renameCollection('source', 'My campaign pack');
    creator.vault.files.set(MAP_PATH, mapFile(12));

    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review).toMatchObject({ relation: 'newer', localName: 'My campaign pack', conflicts: [] });
    await apply();
    expect((await fan.assets.getAssets('My campaign pack', 'token'))[0]?.name).toBe('My goblin');
    expect((await fan.assets.getCollection('My campaign pack'))?.name).toBe('My campaign pack');
    const renamedMap = MAP_PATH.replace('collections/source/', 'collections/My campaign pack/');
    expect(JSON.parse(fan.vault.files.get(renamedMap)!).state.objects.tokens.t1.hp).toBe(12);
    expect(fan.vault.files.has(MAP_PATH)).toBe(false);
  });

  it('asks about changes both sides made, keeps the user\'s by default, and asks again only when the creator changes it again', async () => {
    const { creator, fan } = await installedV1();
    fan.vault.files.set(MAP_PATH, 'PLAYED');
    creator.vault.files.set(MAP_PATH, mapFile(12));
    const v2 = await exportFrom(creator);

    const { review, apply } = await reviewImport(fan, v2);
    expect(review.conflicts).toEqual([expect.objectContaining({ kind: 'Scene', name: 'Cave', reason: 'both-changed' })]);
    expect(await apply()).toMatchObject({ keptLocal: 1 });
    expect(fan.vault.files.get(MAP_PATH)).toBe('PLAYED');

    // Importing the same release again, or a later one that leaves the scene alone, keeps the user's version without asking.
    expect((await reviewImport(fan, v2)).review).toMatchObject({ conflicts: [], counts: { kept: 1 } });
    await importInto(fan, await exportFrom(creator));
    expect(fan.vault.files.get(MAP_PATH)).toBe('PLAYED');

    creator.vault.files.set(MAP_PATH, mapFile(20));
    const v4 = await reviewImport(fan, await exportFrom(creator));
    expect(v4.review.conflicts).toEqual([expect.objectContaining({ name: 'Cave', reason: 'both-changed' })]);
    await v4.apply(theirs(v4.review.conflicts[0]!.key));
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.hp).toBe(20);
  });

  it('asks before removing an asset the user changed', async () => {
    const { creator, fan } = await installedV1();
    const [fanEncounter] = await fan.assets.getAssets('source', 'encounter');
    await fan.assets.updateAsset(fanEncounter!.id, { name: 'My ambush' });
    const [encounter] = await creator.assets.getAssets('source', 'encounter');
    await creator.assets.deleteAsset(encounter!.id);

    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review.conflicts).toEqual([expect.objectContaining({ kind: 'Encounter', name: 'My ambush', reason: 'removed-by-update' })]);
    await apply();
    expect(await fan.assets.getAssets('source', 'encounter')).toHaveLength(1);
  });

  it('offers an older version as a downgrade that only reverts what the user did not change', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    const v1 = await exportFrom(creator);
    creator.vault.files.set(MAP_PATH, mapFile(12));
    await importInto(fan, await exportFrom(creator));
    AssetService.resetInstance();

    const { review, apply } = await reviewImport(fan, v1);
    expect(review).toMatchObject({ relation: 'older', installedVersion: 2, version: 1 });
    await apply();
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.tokens.t1.hp).toBe(7);
    expect((await fan.assets.getCollection('source'))?.version).toBe(1);
  });

  it('treats a copy from before install records as unknown: restores what is missing and asks about the rest', async () => {
    const { creator, fan } = await installedV1();
    const collection = await fan.assets.getCollection('source');
    fan.vault.files.delete('atlas-vtt/collections/source/install.json');
    fan.vault.files.delete(TOKEN_IMAGE);
    fan.vault.files.set(MAP_PATH, 'PLAYED');

    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review).toMatchObject({ relation: 'newer', hasInstallRecord: false });
    expect(review.conflicts).toEqual([expect.objectContaining({ name: 'Cave', reason: 'unknown-origin' })]);
    await apply();
    expect(fan.vault.files.get(TOKEN_IMAGE)).toBe('IMG');
    expect(fan.vault.files.get(MAP_PATH)).toBe('PLAYED');
    expect(await readInstallRecord(fan.vault.app, collection!)).not.toBeNull();
  });

  it('saves and closes open views of maps it replaces before writing them', async () => {
    const { creator, fan } = await installedV1();
    creator.vault.files.set(MAP_PATH, mapFile(12));
    const steps: string[] = [];
    const view = Object.assign(Object.create(AtlasView.prototype) as AtlasView, {
      getState: () => ({ file: MAP_PATH }),
      saveMap: vi.fn(async () => { steps.push('save'); }),
    });
    const leaf = { view, detach: vi.fn(() => { steps.push('detach'); }) };
    fan.vault.app.workspace.getLeavesOfType = vi.fn(() => [leaf]);
    const modifyBinary = fan.vault.app.vault.modifyBinary.bind(fan.vault.app.vault);
    fan.vault.app.vault.modifyBinary = vi.fn(async (file: TFile, data: ArrayBuffer) => {
      if (file.path === MAP_PATH) steps.push('write');
      return modifyBinary(file, data);
    });

    await importInto(fan, await exportFrom(creator));
    // Saved for the review, for the check that nothing changed since, and right before the write.
    expect(steps).toEqual(['save', 'save', 'save', 'detach', 'write']);
  });
});

describe('review findings', () => {
  it('keeps a moved statblock note and its edits instead of deleting it', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const fanNote = 'atlas-vtt/collections/source/statblocks/Goblin.md';
    fan.vault.files.set(fanNote, `${fan.vault.files.get(fanNote)!}\nMy notes.`);

    creator.vault.files.set('Monsters/Goblin.md', creator.vault.files.get(NOTE_PATH)!);
    creator.vault.files.delete(NOTE_PATH);
    const [token] = await creator.assets.getAssets('source', 'token');
    await creator.assets.updateAsset(token!.id, { statblockPath: 'Monsters/Goblin.md' });
    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    const result = await apply(review.conflicts.length ? theirs(review.conflicts[0]!.key) : {});

    const [fanToken] = await fan.assets.getAssets('source', 'token');
    expect(fanToken?.statblockPath).not.toBe(fanNote);
    expect(fan.vault.files.has(fanToken!.statblockPath!)).toBe(true);
    const edited = fan.vault.files.get(fanNote) ?? fan.vault.files.get(`${result.backupFolder}/${fanNote}`);
    expect(edited).toContain('My notes.');
  });

  it('leaves out assets that would name files outside Atlas\'s folder, and imports the rest', async () => {
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportFrom(await creatorVault())).arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { assets: Array<Record<string, unknown>> };
    manifest.assets = manifest.assets.map((asset) => (asset.type === 'token' ? { ...asset, imagePath: 'Journal/Diary.md' } : asset));
    zip.file('manifest.json', JSON.stringify(manifest));
    const fan = await emptyVault({ 'Journal/Diary.md': 'Dear diary' });
    const { review, apply } = await reviewImport(fan, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]));
    expect(review.skippedAssets).toEqual([{ name: 'Goblin', path: 'Journal/Diary.md' }]);
    await apply();
    expect(await fan.assets.getAssets('source', 'token')).toHaveLength(0);
    expect(await fan.assets.getAssets('source')).toHaveLength(2);
    expect(fan.vault.files.get('Journal/Diary.md')).toBe('Dear diary');
  });

  it('never takes back an asset the user moved to another collection', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    const v1 = await exportFrom(creator);
    await importInto(fan, v1);
    await fan.assets.createCollection('mine');
    const [token] = await fan.assets.getAssets('source', 'token');
    await fan.assets.updateAsset(token!.id, { name: 'My goblin' });
    await transferAssets(fan.vault.app, fan.assets, { assetIds: [token!.id], targetCollectionId: 'mine', mode: 'move' });

    const { review, apply } = await reviewImport(fan, v1);
    expect(review.canRestore).toBe(true);
    await apply({ restore: true });
    expect((await fan.assets.getAssets('mine', 'token')).map((asset) => asset.name)).toEqual(['My goblin']);
    expect(await fan.assets.getAssets('source', 'token')).toHaveLength(1);
  });

  it('gives two statblock notes with the same name their own files', async () => {
    const creator = await creatorVault();
    await creator.vault.app.vault.create('atlas-vtt/collections/source/statblocks/Goblin.md', '---\nstatblock: true\n---\nOther goblin.');
    await creator.assets.addTokenAsset({ name: 'Other', imagePath: TOKEN_IMAGE, statblockPath: 'atlas-vtt/collections/source/statblocks/Goblin.md', collection: 'source', tags: [] });
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const paths = (await fan.assets.getAssets('source', 'token')).map((asset) => asset.statblockPath);
    expect(new Set(paths).size).toBe(2);
    expect(paths.map((path) => fan.vault.files.get(path!))).toEqual(expect.arrayContaining([expect.stringContaining('A goblin.'), expect.stringContaining('Other goblin.')]));
  });

  it('keeps the vault\'s own different artwork and installs the bundle\'s next to it', async () => {
    const fan = await emptyVault({ [TOKEN_IMAGE]: 'MY OWN ART' });
    await importInto(fan, await exportFrom(await creatorVault()));
    const [token] = await fan.assets.getAssets('source', 'token');
    expect(token?.imagePath).toBe('atlas-vtt/assets/goblin_1-2.webp');
    expect(fan.vault.files.get(TOKEN_IMAGE)).toBe('MY OWN ART');
    expect(fan.vault.files.get(token!.imagePath)).toBe('IMG');
  });

  it('treats collections from before publishing as unknown and warns about releases by another publisher', async () => {
    const creator = await creatorVault();
    const collection = await creator.assets.getCollection('source');
    delete collection!.publisherId;
    expect((await prepareCollectionExport(creator.vault.app, creator.assets, 'source')).publisher).toBe('unknown');

    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const fork = await exportFrom(fan, { kind: 'release', version: 2 }).catch((error: Error) => error);
    expect(fork).toBeInstanceOf(Error);

    // A vault that claims the creator's collection with a release of its own is flagged.
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportFrom(creator)).arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { collection: Record<string, unknown> };
    manifest.collection = { ...manifest.collection, publisherId: 'someone-else', version: 9 };
    zip.file('manifest.json', JSON.stringify(manifest));
    const { review } = await reviewImport(creator, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]));
    expect(review).toMatchObject({ relation: 'newer', publisherWarning: 'own-collection' });
  });

  it('shares a copy that was imported under another name with the original name', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await fan.assets.createCollection('source');
    await importInto(fan, await exportFrom(creator), { name: 'source (2)' });
    const shared = await exportFrom(fan, { kind: 'share' }, 'source (2)');
    AssetService.resetInstance();
    const { review, apply } = await reviewImport(creator, shared);
    expect(review).toMatchObject({ upToDate: true, counts: { updated: 0 } });
    await apply();
    expect((await creator.assets.getCollection('source'))?.name).toBe('source');
  });
});

describe('second review findings', () => {
  it('keeps a kept token\'s statblock note when the update moves it', async () => {
    const { creator, fan } = await (async () => {
      const c = await creatorVault();
      const f = await emptyVault();
      await importInto(f, await exportFrom(c));
      return { creator: c, fan: f };
    })();
    const [fanToken] = await fan.assets.getAssets('source', 'token');
    await fan.assets.updateAsset(fanToken!.id, { name: 'My goblin' });
    creator.vault.files.set('Monsters/Goblin.md', creator.vault.files.get(NOTE_PATH)!);
    creator.vault.files.delete(NOTE_PATH);
    const [token] = await creator.assets.getAssets('source', 'token');
    await creator.assets.updateAsset(token!.id, { statblockPath: 'Monsters/Goblin.md' });

    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review.conflicts).toEqual([expect.objectContaining({ kind: 'Token', reason: 'both-changed' })]);
    await apply();
    const [kept] = await fan.assets.getAssets('source', 'token');
    expect(kept?.name).toBe('My goblin');
    expect(fan.vault.files.has(kept!.statblockPath!)).toBe(true);
  });

  it('keeps a note the creator moves into the collection folder', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const inFolder = 'atlas-vtt/collections/source/statblocks/Goblin.md';
    creator.vault.files.set(inFolder, creator.vault.files.get(NOTE_PATH)!);
    creator.vault.files.delete(NOTE_PATH);
    const [token] = await creator.assets.getAssets('source', 'token');
    await creator.assets.updateAsset(token!.id, { statblockPath: inFolder });

    const result = await (await reviewImport(fan, await exportFrom(creator))).apply();
    expect(result.removed).toBe(0);
    const [fanToken] = await fan.assets.getAssets('source', 'token');
    expect(fanToken?.statblockPath).toBe(inFolder);
    expect(fan.vault.files.has(inFolder)).toBe(true);
  });

  it('never links a new creator asset to a file the user made in the collection folder', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const lair = 'atlas-vtt/collections/source/scenes/Lair.atlasmap';
    await fan.vault.app.vault.create(lair, 'MY LAIR');
    await creator.vault.app.vault.create(lair, '{"creator":true}');
    await creator.assets.addAsset({ type: 'scene', name: 'Lair', collection: 'source', tags: [], data: { mapPath: lair } });

    await importInto(fan, await exportFrom(creator));
    expect(fan.vault.files.get(lair)).toBe('MY LAIR');
    const scene = (await fan.assets.getAssets('source', 'scene')).find((asset) => asset.name === 'Lair');
    expect(scene?.data?.mapPath).toBe('atlas-vtt/collections/source/scenes/Lair-2.atlasmap');
    expect(fan.vault.files.get(scene!.data!.mapPath)).toBe('{"creator":true}');
  });

  it('lists only Markdown notes as pinned notes: a pin to a scene\'s map leaves that map with its scene', async () => {
    const creator = await creatorVault();
    const cellar = 'atlas-vtt/collections/source/scenes/Cellar.atlasmap';
    await pinNote(creator, 'Lore/Cave.md', '# Cave');
    const map = JSON.parse(creator.vault.files.get(MAP_PATH)!) as { state: { objects: { pins: Record<string, unknown> } } };
    map.state.objects.pins.p2 = { id: 'p2', kind: 'pin', x: 0, y: 0, notePath: cellar };
    creator.vault.files.set(MAP_PATH, JSON.stringify(map));
    await creator.vault.app.vault.create(cellar, mapFile());
    await creator.assets.addAsset({ type: 'scene', name: 'Cellar', collection: 'source', tags: [], data: { mapPath: cellar } });

    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    expect(preview.files.filter((file) => file.role === 'linked-note').map((file) => file.vaultPath)).toEqual(['Lore/Cave.md']);
    expect(preview.files.find((file) => file.vaultPath === cellar)?.role).toBe('scene-map');
  });

  it('copies pinned notes into the collection, and matches them when a share comes back', async () => {
    const creator = await creatorVault();
    await pinNote(creator, 'Lore/Castle.md', '# Castle');
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    expect(fan.vault.files.get('atlas-vtt/collections/source/notes/Lore/Castle.md')).toBe('# Castle');

    const shared = await exportFrom(fan, { kind: 'share' });
    AssetService.resetInstance();
    const { review } = await reviewImport(creator, shared);
    expect(review).toMatchObject({ upToDate: true, counts: { added: 0 } });
  });

  it('warns the publisher about any newer bundle of their own collection, even one labelled a share', async () => {
    const creator = await creatorVault();
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await (await exportFrom(creator)).arrayBuffer());
    const manifest = JSON.parse(await zip.file('manifest.json')!.async('string')) as { collection: Record<string, unknown>; release: unknown };
    manifest.collection = { ...manifest.collection, version: 5, author: 'Impostor' };
    manifest.release = { kind: 'share' };
    zip.file('manifest.json', JSON.stringify(manifest));
    const { review, apply } = await reviewImport(creator, new Blob([await zip.generateAsync({ type: 'arraybuffer' })]));
    expect(review.publisherWarning).toBe('own-collection');
    await apply();
    expect((await creator.assets.getCollection('source'))?.author).toBeUndefined();
  });
});

describe('third review findings', () => {
  async function installed(): Promise<{ creator: Vault; fan: Vault }> {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    return { creator, fan };
  }

  async function moveCreatorNote(creator: Vault, to: string, content?: string): Promise<void> {
    creator.vault.files.set(to, content ?? creator.vault.files.get(NOTE_PATH)!);
    creator.vault.files.delete(NOTE_PATH);
    const [token] = await creator.assets.getAssets('source', 'token');
    await creator.assets.updateAsset(token!.id, { statblockPath: to });
    const [encounter] = await creator.assets.getAssets('source', 'encounter');
    await creator.assets.updateAsset(encounter!.id, { tokens: [{ id: 'g', name: 'Goblin', imagePath: TOKEN_IMAGE, statblockPath: to }] } as never);
    creator.vault.files.set(MAP_PATH, creator.vault.files.get(MAP_PATH)!.replace(NOTE_PATH, to));
  }

  it('matches a shared copy\'s notes every time the publisher imports one', async () => {
    const creator = await creatorVault();
    await pinNote(creator, 'Lore/Castle.md', '# Castle');
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const shared = await exportFrom(fan, { kind: 'share' });
    AssetService.resetInstance();
    await importInto(creator, shared);
    const again = await reviewImport(creator, shared);
    expect(again.review).toMatchObject({ upToDate: true, counts: { added: 0 } });
    expect(creator.vault.files.has('atlas-vtt/collections/source/notes/Castle.md')).toBe(false);
  });

  it('keeps a moved note while a token placed on a map still names it', async () => {
    const { creator, fan } = await installed();
    creator.vault.files.set('Monsters/Goblin.md', creator.vault.files.get(NOTE_PATH)!);
    creator.vault.files.delete(NOTE_PATH);
    const [token] = await creator.assets.getAssets('source', 'token');
    await creator.assets.updateAsset(token!.id, { statblockPath: 'Monsters/Goblin.md' });
    const result = await (await reviewImport(fan, await exportFrom(creator))).apply();
    expect(result.removed).toBe(0);
    expect(fan.vault.files.has('atlas-vtt/collections/source/statblocks/Goblin.md')).toBe(true);
  });

  it('cleans up a statblock note the creator moved elsewhere', async () => {
    const { creator, fan } = await installed();
    await moveCreatorNote(creator, 'Monsters/Goblin.md');
    const result = await (await reviewImport(fan, await exportFrom(creator))).apply();
    const statblocks = [...fan.vault.files.keys()].filter((path) => path.startsWith('atlas-vtt/collections/source/statblocks/') && path.endsWith('.md'));
    expect(statblocks).toHaveLength(1);
    expect(result.removed).toBe(1);
    const [token] = await fan.assets.getAssets('source', 'token');
    expect(token?.statblockPath).toBe(statblocks[0]);
  });

  it('applies the creator\'s edit to a note moved into the collection folder', async () => {
    const { creator, fan } = await installed();
    await moveCreatorNote(creator, 'atlas-vtt/collections/source/statblocks/Goblin.md', '---\nstatblock: true\nimage: "[[goblin.png]]"\n---\nAn angry goblin.');
    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review.conflicts).toEqual([]);
    await apply();
    expect(fan.vault.files.get('atlas-vtt/collections/source/statblocks/Goblin.md')).toContain('An angry goblin.');
  });

  it('keeps a scene thumbnail with its map when the map is placed under another name', async () => {
    const { creator, fan } = await installed();
    const lair = 'atlas-vtt/collections/source/scenes/Lair.atlasmap';
    await fan.vault.app.vault.create(lair, 'MY LAIR');
    await creator.vault.app.vault.create(lair, '{"creator":true}');
    await creator.vault.app.vault.create('atlas-vtt/collections/source/scenes/Lair.thumb.jpg', 'THUMB');
    await creator.assets.addAsset({ type: 'scene', name: 'Lair', collection: 'source', tags: [], data: { mapPath: lair } });
    await importInto(fan, await exportFrom(creator));
    expect(fan.vault.files.has('atlas-vtt/collections/source/scenes/Lair.thumb.jpg')).toBe(false);
    expect(fan.vault.files.get('atlas-vtt/collections/source/scenes/Lair-2.thumb.jpg')).toBe('THUMB');
  });

  it('keeps scene snapshots with their scene when the map is placed under another name', async () => {
    const { creator, fan } = await installed();
    const lair = 'atlas-vtt/collections/source/scenes/Lair.atlasmap';
    await fan.vault.app.vault.create(lair, 'MY LAIR');
    await creator.vault.app.vault.create(lair, '{"creator":true}');
    const scene = await creator.assets.addAsset({ type: 'scene', name: 'Lair', collection: 'source', tags: [], data: { mapPath: lair } });
    const snapshot = createSnapshot({ version: 4, state: { schema: 'atlas-vtt', version: 4, background: BACKGROUND, grid: null } }, 'snap1', 'Start', 1000);
    await creator.vault.app.vault.create(`${sceneSnapshotFolder('source', scene.id)}/snap1.json`, JSON.stringify(snapshot));
    await creator.vault.app.vault.create(`${sceneSnapshotFolder('source', scene.id)}/snap1.jpg`, 'SNAPJPG');
    await importInto(fan, await exportFrom(creator));
    const installedLair = (await fan.assets.getAssets('source', 'scene')).find((entry) => entry.name !== 'Cave');
    expect(installedLair?.data?.mapPath).toBe('atlas-vtt/collections/source/scenes/Lair-2.atlasmap');
    expect(fan.vault.files.get(`${sceneSnapshotFolder('source', installedLair!.id)}/snap1.jpg`)).toBe('SNAPJPG');
    expect(fan.vault.files.has(`${sceneSnapshotFolder('source', installedLair!.id)}/snap1.json`)).toBe(true);
  });
});

describe('remaining findings', () => {
  it('moves an id-named asset file along when the asset gets a new id', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    const v1 = await exportFrom(creator);
    await importInto(fan, v1);
    await fan.assets.createCollection('mine');
    const [encounter] = await fan.assets.getAssets('source', 'encounter');
    await transferAssets(fan.vault.app, fan.assets, { assetIds: [encounter!.id], targetCollectionId: 'mine', mode: 'move' });

    await (await reviewImport(fan, v1)).apply({ restore: true });
    const [restored] = await fan.assets.getAssets('source', 'encounter');
    expect(restored?.id).not.toBe(encounter!.id);
    expect(fan.vault.files.has(fan.assets.getAssetFilePath(restored!))).toBe(true);
  });

  it('does not pile up copies of artwork for a copy from before install records', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const collection = await fan.assets.getCollection('source');
    fan.vault.files.delete('atlas-vtt/collections/source/install.json');
    creator.vault.files.set(TOKEN_IMAGE, 'NEW IMG');
    await (await reviewImport(fan, await exportFrom(creator))).apply({ restore: true });
    expect([...fan.vault.files.keys()].filter((path) => path.includes('goblin_1-2'))).toEqual([]);
    expect(fan.vault.files.get(TOKEN_IMAGE)).toBe('NEW IMG');
  });

  it('keeps a file the update removes while one of the user\'s own maps still names it', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const oldNote = 'atlas-vtt/collections/source/statblocks/Goblin.md';
    await fan.vault.app.vault.create('Adventures/My.atlasmap', JSON.stringify({ state: { objects: { tokens: { a: { statblockPath: oldNote } } } } }));
    creator.vault.files.set('Monsters/Goblin.md', creator.vault.files.get(NOTE_PATH)!);
    creator.vault.files.delete(NOTE_PATH);
    for (const asset of await creator.assets.getAssets('source')) {
      if (asset.type === 'token') await creator.assets.updateAsset(asset.id, { statblockPath: 'Monsters/Goblin.md' });
      if (asset.type === 'encounter') await creator.assets.updateAsset(asset.id, { tokens: [{ id: 'g', name: 'Goblin', imagePath: TOKEN_IMAGE, statblockPath: 'Monsters/Goblin.md' }] } as never);
    }
    creator.vault.files.set(MAP_PATH, creator.vault.files.get(MAP_PATH)!.replace(NOTE_PATH, 'Monsters/Goblin.md'));

    const result = await (await reviewImport(fan, await exportFrom(creator))).apply();
    expect(result.removed).toBe(0);
    expect(fan.vault.files.has(oldNote)).toBe(true);
  });

  it('does not later claim the user deleted a file the import never wrote', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const [fanToken] = await fan.assets.getAssets('source', 'token');
    await fan.assets.updateAsset(fanToken!.id, { name: 'My goblin' });
    const [token] = await creator.assets.getAssets('source', 'token');
    await creator.vault.app.vault.create('atlas-vtt/assets/thumbnails/goblin_2.webp', 'THUMB 2');
    await creator.assets.updateAsset(token!.id, { name: 'Goblin boss', thumbnailPath: 'atlas-vtt/assets/thumbnails/goblin_2.webp' });
    const v2 = await exportFrom(creator);
    await importInto(fan, v2);

    creator.vault.files.set('atlas-vtt/assets/thumbnails/goblin_2.webp', 'THUMB 3');
    const { review } = await reviewImport(fan, await exportFrom(creator));
    expect(review.conflicts.map((conflict) => conflict.reason)).not.toContain('deleted-by-you');
  });

  it('removes the folders a failed import created, so a retry uses the same place', async () => {
    const fan = await emptyVault();
    let writes = 0;
    const createBinary = fan.vault.app.vault.createBinary.bind(fan.vault.app.vault);
    fan.vault.app.vault.createBinary = vi.fn(async (path: string, data: ArrayBuffer) => {
      if (++writes === 4) throw new Error('Disk full');
      return createBinary(path, data);
    });
    const bundle = await exportFrom(await creatorVault());
    await expect((await reviewImport(fan, bundle)).apply()).rejects.toThrow(/Disk full/);
    expect(fan.vault.app.vault.getAbstractFileByPath('atlas-vtt/collections/source')).toBeNull();
    fan.vault.app.vault.createBinary = createBinary;
    await importInto(fan, bundle);
    expect(await fan.assets.getCollection('source')).not.toBeNull();
  });
});

describe('final review findings', () => {
  it('updates artwork the vault already had identical at install time', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault({ [TOKEN_IMAGE]: 'IMG' });
    await importInto(fan, await exportFrom(creator));
    creator.vault.files.set(TOKEN_IMAGE, 'NEW IMG');
    const { review, apply } = await reviewImport(fan, await exportFrom(creator));
    expect(review.conflicts).toEqual([]);
    await apply();
    expect(fan.vault.files.get(TOKEN_IMAGE)).toBe('NEW IMG');
  });

  it('gives a restored map asset its file after the original moved to another collection', async () => {
    const creator = await creatorVault();
    const mapAsset = await creator.assets.addAsset({ type: 'map', name: 'Region', collection: 'source', tags: [], mapFilePath: BACKGROUND } as never);
    creator.vault.files.set(creator.assets.getAssetFilePath(mapAsset as never), '{"name":"Region"}');
    const fan = await emptyVault();
    const v1 = await exportFrom(creator);
    await importInto(fan, v1);
    await fan.assets.createCollection('mine');
    const [fanMap] = await fan.assets.getAssets('source', 'map');
    await transferAssets(fan.vault.app, fan.assets, { assetIds: [fanMap!.id], targetCollectionId: 'mine', mode: 'move' });

    await (await reviewImport(fan, v1)).apply({ restore: true });
    const [restored] = await fan.assets.getAssets('source', 'map');
    expect(restored?.id).not.toBe(fanMap!.id);
    // The file the bundle carried, with the restored record beside it.
    expect(JSON.parse(fan.vault.files.get(fan.assets.getAssetFilePath(restored!))!)).toMatchObject({ name: 'Region', atlasRecord: { id: restored!.id } });
  });
});

describe('pull request review findings', () => {
  it('leaves the artwork of a token the user moved to another collection alone, and updates it once nothing else uses it', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    await fan.assets.createCollection('mine');
    const [token] = await fan.assets.getAssets('source', 'token');
    await transferAssets(fan.vault.app, fan.assets, { assetIds: [token!.id], targetCollectionId: 'mine', mode: 'move' });
    creator.vault.files.set(TOKEN_IMAGE, 'NEW IMG');

    const v2 = await exportFrom(creator);
    await importInto(fan, v2);
    expect(fan.vault.files.get(TOKEN_IMAGE)).toBe('IMG');

    await fan.assets.deleteAsset(token!.id);
    fan.vault.files.set(TOKEN_IMAGE, 'IMG');
    await importInto(fan, v2, { restore: true });
    expect(fan.vault.files.get(TOKEN_IMAGE)).toBe('NEW IMG');
  });

  it('refuses to apply a review when the vault changed while it was open', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    creator.vault.files.set(MAP_PATH, mapFile(12));
    await creator.assets.renameCollection('source', 'Source Deluxe');

    const map = await reviewImport(fan, await exportFrom(creator, undefined, 'Source Deluxe'));
    expect(map.review.counts.conflict).toBe(0);
    fan.vault.files.set(MAP_PATH, 'PLAYED DURING REVIEW');
    await expect(map.apply()).rejects.toThrow('Your vault changed since the review');
    expect(fan.vault.files.get(MAP_PATH)).toBe('PLAYED DURING REVIEW');

    const name = await reviewImport(fan, await exportFrom(creator, { kind: 'release', version: 2 }, 'Source Deluxe'));
    await fan.assets.renameCollection('source', 'My pack');
    await expect(name.apply()).rejects.toThrow('Your vault changed since the review');
    expect((await fan.assets.getCollection('My pack'))?.name).toBe('My pack');
  });
});

describe('sharing and forking', () => {
  it('shares a fan\'s copy as the same version, which the creator sees as a changed copy', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const [token] = await fan.assets.getAssets('source', 'token');
    await fan.assets.updateAsset(token!.id, { name: 'Fan goblin' });

    const shared = await exportFrom(fan, { kind: 'share' });
    AssetService.resetInstance();
    const { review } = await reviewImport(creator, shared);
    expect(review).toMatchObject({ relation: 'same', kind: 'share', upToDate: false, counts: { updated: 1, added: 0, removed: 0 } });
  });

  it('files a fan added to a renamed copy under the original collection\'s folder when shared back', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await fan.assets.createCollection('source');
    await importInto(fan, await exportFrom(creator), { name: 'source (2)' });
    await fan.vault.app.vault.create('atlas-vtt/collections/source (2)/scenes/Lair.atlasmap', '{}');
    await fan.assets.addAsset({ type: 'scene', name: 'Lair', collection: 'source (2)', tags: [], data: { mapPath: 'atlas-vtt/collections/source (2)/scenes/Lair.atlasmap' } });

    const shared = await exportFrom(fan, { kind: 'share' }, 'source (2)');
    AssetService.resetInstance();
    const { review, apply } = await reviewImport(creator, shared);
    expect(review).toMatchObject({ relation: 'same', counts: { added: 1, removed: 0 } });
    await apply();
    const lair = (await creator.assets.getAssets('source', 'scene')).find((scene) => scene.name === 'Lair');
    expect(lair?.data?.mapPath).toBe('atlas-vtt/collections/source/scenes/Lair.atlasmap');
    expect(creator.vault.files.has('atlas-vtt/collections/source/scenes/Lair.atlasmap')).toBe(true);
  });

  it('publishes a fork as a new collection that no longer follows the original', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    const originalUid = (await fan.assets.getCollection('source'))!.uid;

    const fork = await exportFrom(fan, { kind: 'fork', name: 'Fan edition', author: 'Fan' });
    // A fork takes its new name, and with it a folder of that name.
    expect(await fan.assets.getCollection('source')).toBeNull();
    const forked = await fan.assets.getCollection('Fan edition');
    expect(forked).toMatchObject({ name: 'Fan edition', version: 1, author: 'Fan', publisherId: await fan.assets.getVaultId() });
    expect(forked?.uid).not.toBe(originalUid);
    expect((await prepareCollectionExport(fan.vault.app, fan.assets, 'Fan edition')).publisher).toBe('self');

    AssetService.resetInstance();
    const { review } = await reviewImport(creator, fork);
    expect(review).toMatchObject({ relation: 'new', collectionName: 'Fan edition' });
  });
});

describe('refreshing the index during an import', () => {
  const WOLF_IMAGE = 'atlas-vtt/collections/source/tokens/wolf.webp';
  const tokenNames = async ({ assets }: Vault): Promise<string[]> => (await assets.getAssets('source', 'token')).map((asset) => asset.name).sort();

  /** Asks for a refresh with every file the import writes, the way the asset manager or a file event would. */
  function refreshOnEveryWrite({ vault, assets }: Vault): Promise<void>[] {
    const refreshes: Promise<void>[] = [];
    const createBinary = vault.app.vault.createBinary.bind(vault.app.vault);
    vault.app.vault.createBinary = vi.fn(async (path: string, data: ArrayBuffer) => {
      refreshes.push(assets.refreshMetadata());
      return createBinary(path, data);
    });
    return refreshes;
  }

  /** The index a fresh start of Obsidian would load from disk. */
  async function reloadedTokenNames({ vault }: Vault): Promise<string[]> {
    return tokenNames({ vault, assets: service(vault) });
  }

  async function creatorWithCollectionToken(): Promise<Vault> {
    const creator = await creatorVault();
    await creator.vault.app.vault.create(WOLF_IMAGE, 'WOLF');
    await creator.assets.addTokenAsset({ name: 'Wolf', imagePath: WOLF_IMAGE, collection: 'source', tags: [] });
    return creator;
  }

  it('waits for a new collection to be written, so it gets neither extra nor missing tokens', async () => {
    const fan = await emptyVault();
    const refreshes = refreshOnEveryWrite(fan);
    await importInto(fan, await exportFrom(await creatorWithCollectionToken()));
    await Promise.all(refreshes);

    expect(refreshes.length).toBeGreaterThan(0);
    expect(await tokenNames(fan)).toEqual(['Goblin', 'Wolf']);
    expect(await reloadedTokenNames(fan)).toEqual(['Goblin', 'Wolf']);
  });

  it('waits for an update to be written', async () => {
    const creator = await creatorWithCollectionToken();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    await creator.vault.app.vault.create('atlas-vtt/collections/source/tokens/orc.webp', 'ORC');
    await creator.assets.addTokenAsset({ name: 'Orc', imagePath: 'atlas-vtt/collections/source/tokens/orc.webp', collection: 'source', tags: [] });

    const refreshes = refreshOnEveryWrite(fan);
    await importInto(fan, await exportFrom(creator, { kind: 'release', version: 2 }));
    await Promise.all(refreshes);

    expect(await tokenNames(fan)).toEqual(['Goblin', 'Orc', 'Wolf']);
    expect(await reloadedTokenNames(fan)).toEqual(['Goblin', 'Orc', 'Wolf']);
  });

  it('leaves the index and the collection\'s files as they were when saving an update fails', async () => {
    const creator = await creatorVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    creator.vault.files.set(MAP_PATH, mapFile(12));
    const [token] = await creator.assets.getAssets('source', 'token');
    await creator.assets.updateAsset(token!.id, { name: 'Goblin Boss' });
    const { apply } = await reviewImport(fan, await exportFrom(creator, { kind: 'release', version: 2 }));

    const filesBefore = new Map(fan.vault.files);
    const write = fan.vault.app.vault.adapter.write.bind(fan.vault.app.vault.adapter);
    fan.vault.app.vault.adapter.write = vi.fn(async (path: string, content: string) => {
      if (path.endsWith('assets-metadata.json')) throw new Error('Disk full');
      return write(path, content);
    });
    await expect(apply()).rejects.toThrow('Disk full');

    expect(await tokenNames(fan)).toEqual(['Goblin']);
    expect((await fan.assets.getCollection('source'))?.version).toBe(1);
    const filesAfter = [...fan.vault.files].filter(([path]) => !path.includes('/backups/'));
    expect(new Map(filesAfter)).toEqual(filesBefore);
    expect(await reloadedTokenNames(fan)).toEqual(['Goblin']);
  });
});

describe('extension data on scenes', () => {
  const data = { mapPath: MAP_PATH, extensions: { 'some-extension': { item: 'i'.repeat(22), notes: ['Secret/Plan.md'] } } };

  it('stays out of an exported bundle', async () => {
    const creator = await creatorVault();
    const [scene] = await creator.assets.getAssets('source', 'scene');
    await creator.assets.updateAsset(scene!.id, { data } as never);
    const blob = await exportFrom(creator);
    const { default: JSZip } = await import('jszip');
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    const everything = await Promise.all(Object.values(zip.files).filter((entry) => !entry.dir && /\.json$/.test(entry.name)).map((entry) => entry.async('string')));
    expect(everything.join('\n')).not.toContain('Secret/Plan.md');
    expect(everything.join('\n')).not.toContain('"extensions"');
    // the creator keeps what the extension stored
    expect((await creator.assets.getAssetById(scene!.id))?.data).toEqual(data);
  });
});

describe('notes linked from pinned notes', () => {
  const CAVE = 'Lore/Cave.md';
  const PELOR = 'Lore/Gods/Pelor.md';
  const SUN = 'Lore/Sun.md';
  const PICTURE = 'Lore/cave.png';

  /** Cave (pinned) links Pelor and shows a picture; Pelor links Sun and back to Cave; Sun plays a song. */
  async function loreVault(): Promise<Vault> {
    const creator = await creatorVault();
    await pinNote(creator, CAVE, 'See [[Gods/Pelor]].\n![[cave.png]]');
    for (const [path, content] of Object.entries({
      [PELOR]: 'God of the [[Sun]], worshipped in the [[Cave]].', [SUN]: 'Bright. ![[theme.mp3]]',
      [PICTURE]: 'PNG', 'Lore/theme.mp3': 'MP3', 'Lore/Unrelated.md': 'Nothing links here.',
    })) {
      await creator.vault.app.vault.create(path, content);
    }
    return creator;
  }

  const exportedPaths = async (creator: Vault, excluded: string[]): Promise<string[]> => {
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    const bundle = await exportCollectionBundle(creator.vault.app, creator.assets, preview, { kind: 'release', version: 1, excluded: new Set(excluded) });
    return (await manifestOf(bundle.blob)).files.map((file) => file.vaultPath);
  };

  it('packs every note reached from a pinned note, however deep, with the images they show', async () => {
    const creator = await loreVault();
    const [scene] = await creator.assets.getAssets('source', 'scene');
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    const linked = preview.files.filter((file) => file.vaultPath.startsWith('Lore/'));
    expect(linked).toEqual([
      { vaultPath: CAVE, role: 'linked-note', owners: [scene!.id], linkedFrom: [PELOR] },
      { vaultPath: PELOR, role: 'linked-note', linkedFrom: [CAVE] },
      { vaultPath: PICTURE, role: 'note-attachment', linkedFrom: [CAVE] },
      { vaultPath: SUN, role: 'linked-note', linkedFrom: [PELOR] },
    ]);
  });

  it('leaves out what only a left-out note links to', async () => {
    const creator = await loreVault();
    const [scene] = await creator.assets.getAssets('source', 'scene');
    const lore = (paths: string[]): string[] => paths.filter((path) => path.startsWith('Lore/')).sort();

    expect(lore(await exportedPaths(creator, [`file:${PELOR}`]))).toEqual([CAVE, PICTURE]);
    expect(lore(await exportedPaths(creator, [`file:${CAVE}`]))).toEqual([]);
    expect(lore(await exportedPaths(creator, [`asset:${scene!.id}`]))).toEqual([]);
  });

  it('installs the notes in the folders they had, so the links between them still resolve', async () => {
    const creator = await loreVault();
    const fan = await emptyVault();
    const review = await importInto(fan, await exportFrom(creator));

    const notes = 'atlas-vtt/collections/source/notes';
    expect(fan.vault.files.get(`${notes}/${PELOR}`)).toBe('God of the [[Sun]], worshipped in the [[Cave]].');
    expect(fan.vault.files.get(`${notes}/${PICTURE}`)).toBe('PNG');
    expect(fan.vault.app.metadataCache.resolvedLinks[`${notes}/${CAVE}`]).toEqual({ [`${notes}/${PELOR}`]: 1, [`${notes}/${PICTURE}`]: 1 });
    expect(JSON.parse(fan.vault.files.get(MAP_PATH)!).state.objects.pins.p1.notePath).toBe(`${notes}/${CAVE}`);

    expect(review.contents.find((group) => group.category === 'notes')?.items).toEqual([
      { key: `file:${CAVE}`, name: 'Cave', depth: 0, origin: { kind: 'scene', name: 'Cave', more: 0 }, linked: 2 },
      { key: `file:${PELOR}`, name: 'Pelor', depth: 1, origin: { kind: 'note', name: 'Cave', more: 0 }, linked: 1 },
      { key: `file:${SUN}`, name: 'Sun', depth: 2, origin: { kind: 'note', name: 'Pelor', more: 0 } },
    ]);
  });

  it('lists the images and PDFs the notes show, to be left out one by one or all at once', async () => {
    const creator = await loreVault();
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    const attachments = groupContents(preview.assets, preview.files).find((group) => group.category === 'attachments');
    expect(attachments).toEqual({ category: 'attachments', label: 'Images and PDFs', items: [{ key: `file:${PICTURE}`, name: 'cave.png' }] });
    expect(await exportedPaths(creator, [`file:${PICTURE}`])).not.toContain(PICTURE);
  });

  it('packs a statblock\'s artwork with a statblock note that a kept note links to, whoever else used it', async () => {
    const creator = await creatorVault();
    await pinNote(creator, CAVE, 'A [[Goblin]] lives here.');
    // Without the goblin on the map, only the note's link leads to its statblock.
    const map = JSON.parse(creator.vault.files.get(MAP_PATH)!) as { state: { objects: { tokens: Record<string, unknown> } } };
    map.state.objects.tokens = {};
    creator.vault.files.set(MAP_PATH, JSON.stringify(map));
    const [token] = await creator.assets.getAssets('source', 'token');
    const [encounter] = await creator.assets.getAssets('source', 'encounter');
    const paths = await exportedPaths(creator, [`asset:${token!.id}`, `asset:${encounter!.id}`]);
    expect(paths).toEqual(expect.arrayContaining([CAVE, NOTE_PATH, NOTE_IMAGE]));
  });

  it('lists a chain of thousands of notes, each reached only through the one before', () => {
    const chain = Array.from({ length: 6000 }, (_, index): BundleFile => ({
      vaultPath: `Days/${index}.md`, role: 'linked-note', ...(index === 0 ? { owners: ['cave'] } : { linkedFrom: [`Days/${index - 1}.md`] }),
    }));
    const tree = noteTree(chain, new Map([['cave', 'Cave']]));
    expect(tree).toHaveLength(6000);
    expect(tree[0]).toMatchObject({ depth: 0, linked: 5999 });
    expect(tree[5999]).toEqual({ path: 'Days/5999.md', name: '5999', depth: 5999, origin: { kind: 'note', name: '5998', more: 0 } });
  });

  it('moves a scene to another collection with the notes it opens, and leaves the notes those link to where they are', async () => {
    const creator = await creatorVault();
    const folder = 'atlas-vtt/collections/source/notes';
    const cellar = 'atlas-vtt/collections/source/scenes/Cellar.atlasmap';
    await pinNote(creator, `${folder}/Room1.md`, 'Back to the [[Index]].');
    await creator.vault.app.vault.create(`${folder}/Room2.md`, 'Back to the [[Index]].');
    await creator.vault.app.vault.create(`${folder}/Index.md`, '[[Room1]], [[Room2]]');
    const map = JSON.parse(mapFile()) as { state: { mapPath: string; objects: { pins: Record<string, unknown> } } };
    map.state.mapPath = cellar;
    map.state.objects.pins = { p1: { id: 'p1', kind: 'pin', x: 0, y: 0, notePath: `${folder}/Room2.md` } };
    await creator.vault.app.vault.create(cellar, JSON.stringify(map));
    await creator.assets.addAsset({ type: 'scene', name: 'Cellar', collection: 'source', tags: [], data: { mapPath: cellar } });
    await creator.assets.createCollection('target');
    const cave = (await creator.assets.getAssets('source', 'scene')).find((scene) => scene.name === 'Cave');

    await transferAssets(creator.vault.app, creator.assets, { assetIds: [cave!.id], targetCollectionId: 'target', mode: 'move' });
    const notes = [...creator.vault.files.keys()].filter((path) => path.includes('/notes/')).sort();
    expect(notes).toEqual([`${folder}/Index.md`, `${folder}/Room2.md`, 'atlas-vtt/collections/target/notes/Room1.md']);
  });
});

describe('loot tables', () => {
  const BASE = 'Reference/Items/Items.base';
  const SHIELD = 'Reference/Items/Armor/Shield.md';
  const ROPE = 'Reference/Items/Gear/Rope.md';
  const BASE_TEXT = [
    'filters:', '  and:', '    - file.inFolder("Reference/Items")',
    'views:', '  - type: table', '    name: Armor', '    filters:', '      and:', "        - 'file.inFolder(\"Reference/Items/Armor\")'", '',
  ].join('\n');
  const LOOT = 'atlas-vtt/collections/source/loot';

  /** The creator's vault with a loot base of two items picked in the collection's settings. */
  async function lootVault(): Promise<Vault> {
    const creator = await creatorVault();
    for (const [path, content] of Object.entries({ [BASE]: BASE_TEXT, [SHIELD]: '---\nprice: 10\n---\n', [ROPE]: '---\nprice: 5\n---\n' })) {
      await creator.vault.app.vault.create(path, content);
    }
    lootItems.set(BASE, [SHIELD, ROPE]);
    await creator.assets.updateCollectionSettings('source', { lootBases: [BASE], lootCurrency: 'gp' });
    return creator;
  }

  beforeEach(() => { lootItems.clear(); });

  it('carries the loot bases with their items and installs them where the collection and the bases find them', async () => {
    const creator = await lootVault();
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    expect(preview.files).toEqual(expect.arrayContaining([
      { vaultPath: BASE, role: 'loot-base' },
      { vaultPath: SHIELD, role: 'loot-item', linkedFrom: [BASE] },
      { vaultPath: ROPE, role: 'loot-item', linkedFrom: [BASE] },
    ]));
    const blob = await exportFrom(creator);

    const fan = await emptyVault();
    const review = await importInto(fan, blob);
    expect(review.contents.find((group) => group.category === 'loot')?.items).toEqual([{ key: `file:${BASE}`, name: 'Items' }]);
    expect(fan.vault.files.get(`${LOOT}/${SHIELD}`)).toBe('---\nprice: 10\n---\n');
    expect(fan.vault.files.get(`${LOOT}/${ROPE}`)).toBe('---\nprice: 5\n---\n');
    expect(fan.vault.files.get(`${LOOT}/${BASE}`)).toBe(BASE_TEXT.replaceAll('"Reference/Items', `"${LOOT}/Reference/Items`));
    expect((await fan.assets.getCollection('source'))?.settings).toMatchObject({ lootBases: [`${LOOT}/${BASE}`], lootCurrency: 'gp' });

    expect((await reviewImport(fan, blob)).review).toMatchObject({ upToDate: true, conflicts: [] });
  });

  it('counts a base and its items as one change, and takes an item the publisher adds', async () => {
    const creator = await lootVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));

    const helmet = 'Reference/Items/Armor/Helmet.md';
    await creator.vault.app.vault.create(helmet, '---\nprice: 10\n---\n');
    lootItems.set(BASE, [SHIELD, ROPE, helmet]);
    const { review, apply } = await reviewImport(fan, await exportFrom(creator, { kind: 'release', version: 2 }));
    // The base's unit holds only a new file, which the plan calls added; its three items do not count on their own.
    expect(review).toMatchObject({ relation: 'newer', conflicts: [], counts: expect.objectContaining({ added: 1, updated: 0 }) });
    await apply();
    expect(fan.vault.files.get(`${LOOT}/${helmet}`)).toBe('---\nprice: 10\n---\n');
  });

  it('takes along the notes an item links to, and leaves them behind with the base', async () => {
    const creator = await lootVault();
    const rules = 'Reference/Rules/Armor.md';
    creator.vault.files.set(SHIELD, '---\nsource: "[[Reference/Rules/Armor|Armor]]"\n---\n');
    await creator.vault.app.vault.create(rules, 'A shield gives +1 Armor.');
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    expect(preview.files).toContainEqual({ vaultPath: rules, role: 'linked-note', linkedFrom: [SHIELD] });

    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    expect(fan.vault.files.get(`atlas-vtt/collections/source/notes/${rules}`)).toBe('A shield gives +1 Armor.');
    expect(fan.vault.app.metadataCache.resolvedLinks[`${LOOT}/${SHIELD}`]).toEqual({ [`atlas-vtt/collections/source/notes/${rules}`]: 1 });

    const bundle = await exportCollectionBundle(creator.vault.app, creator.assets, preview, { kind: 'release', version: 2, excluded: new Set([`file:${BASE}`]) });
    expect((await manifestOf(bundle.blob)).files.map((file) => file.vaultPath)).not.toContain(rules);
  });

  it('leaves out a loot base the user excluded, with its items and its place in the settings', async () => {
    const creator = await lootVault();
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    const bundle = await exportCollectionBundle(creator.vault.app, creator.assets, preview, { kind: 'release', version: 1, excluded: new Set([`file:${BASE}`]) });
    const manifest = await manifestOf(bundle.blob);
    const paths = manifest.files.map((file) => file.vaultPath);
    for (const path of [BASE, SHIELD, ROPE]) expect(paths).not.toContain(path);
    expect(manifest.collection.settings).toMatchObject({ lootBases: [], lootCurrency: 'gp' });
  });

  it('keeps an item with its base when a scene that pins it is left out', async () => {
    const creator = await lootVault();
    const map = JSON.parse(creator.vault.files.get(MAP_PATH)!) as { state: { objects: { pins: Record<string, unknown> } } };
    map.state.objects.pins = { p1: { id: 'p1', kind: 'pin', x: 0, y: 0, notePath: SHIELD } };
    creator.vault.files.set(MAP_PATH, JSON.stringify(map));
    const [scene] = await creator.assets.getAssets('source', 'scene');
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    const bundle = await exportCollectionBundle(creator.vault.app, creator.assets, preview, { kind: 'release', version: 1, excluded: new Set([`asset:${scene!.id}`]) });
    expect((await manifestOf(bundle.blob)).files).toContainEqual(expect.objectContaining({ vaultPath: SHIELD, role: 'loot-item' }));
  });

  it('reports a base that is gone or that Obsidian cannot run, and packs neither', async () => {
    const creator = await lootVault();
    await creator.assets.updateCollectionSettings('source', { lootBases: [BASE, 'Reference/Gone.base'] });
    lootItems.delete(BASE);
    const preview = await prepareCollectionExport(creator.vault.app, creator.assets, 'source');
    expect(preview.missing.map((missing) => missing.path)).toEqual([BASE, 'Reference/Gone.base']);
    expect(preview.files.map((file) => file.vaultPath)).not.toContain(BASE);
  });

  it('shares an installed copy under the names the publisher gave its loot', async () => {
    const creator = await lootVault();
    const fan = await emptyVault();
    await importInto(fan, await exportFrom(creator));
    lootItems.set(`${LOOT}/${BASE}`, [`${LOOT}/${SHIELD}`, `${LOOT}/${ROPE}`]);

    const shared = await exportFrom(fan, { kind: 'share' });
    const manifest = await manifestOf(shared);
    expect(manifest.files).toEqual(expect.arrayContaining([
      expect.objectContaining({ vaultPath: BASE, role: 'loot-base' }),
      expect.objectContaining({ vaultPath: SHIELD, role: 'loot-item', linkedFrom: [BASE] }),
    ]));
    expect(manifest.collection.settings).toMatchObject({ lootBases: [BASE] });
    expect((await reviewImport(creator, shared)).review).toMatchObject({ upToDate: true, conflicts: [] });
  });
});

describe('record files of an installed collection', () => {
  it('read as unchanged after Atlas rewrote them for a collection installed under another name', async () => {
    const creator = await creatorVault();
    await creator.assets.addAsset({ type: 'map', name: 'Region', collection: 'source', tags: [], mapFilePath: BACKGROUND });
    const v1 = await exportFrom(creator, { kind: 'release', version: 1 });
    const fan = await emptyVault();
    await fan.assets.createCollection('source');
    await importInto(fan, v1, { name: 'source (2)' });

    expect((await reviewImport(fan, v1)).review).toMatchObject({ relation: 'same', upToDate: true, canRestore: false, conflicts: [] });
  });
});
