import { beforeEach, describe, expect, it } from 'vitest';
import { AssetService, type Asset } from '../../src/app/services/AssetService';
import { RECORD_KEY, serializeRecord } from '../../src/app/services/library/recordFile';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const METADATA_PATH = 'atlas-vtt/.atlas-data/assets-metadata.json';

const scene = (id: string, data: object): object => ({ id, type: 'scene', name: id, tags: [], collection: 'Default', createdAt: 1, modifiedAt: 1, data });

function indexWith(assets: object[]): string {
  return JSON.stringify({
    collections: { Default: { id: 'Default', name: 'Default', tags: {}, createdAt: 1, modifiedAt: 1, uid: 'u', version: 1, settings: { conditions: [] } } },
    defaultCollectionId: 'Default',
    assets: Object.fromEntries(assets.map((asset) => [(asset as { id: string }).id, asset])),
    vaultId: 'vault',
    version: 2,
  });
}

function seeded(assets: object[], files: Record<string, string> = {}): InMemoryApp {
  return createInMemoryApp({ folders: ['atlas-vtt/collections', 'atlas-vtt/collections/Default'], files: { [METADATA_PATH]: indexWith(assets), ...files } });
}

/** The vault's files a sync tool carries: everything outside dot folders. */
const syncedFiles = (vault: InMemoryApp): Record<string, string> =>
  Object.fromEntries([...vault.files].filter(([path]) => !path.split('/').some((part) => part.startsWith('.'))));

const dataOf = async (service: AssetService, id: string): Promise<unknown> => ((await service.getAssetById(id)) as { data?: unknown } | null)?.data;

beforeEach(() => { AssetService.resetInstance(); });

describe('record files of scenes', () => {
  const A = 'atlas-vtt/collections/Default/scenes/a.atlasmap';
  const C = 'atlas-vtt/collections/Default/scenes/c.atlasmap';
  const N = 'atlas-vtt/collections/Default/scenes/n.atlasmap';
  const RECORD = 'atlas-vtt/collections/Default/scenes/moved.json';
  const maps = { [A]: '{}', [C]: '{}', [N]: '{}' };

  it('never hold extension data or the extension that added the scene; the index keeps them', async () => {
    const vault = seeded([
      { ...scene('moved', { mapPath: A, extensions: { other: 1 }, createdBy: 'ext', createdImages: ['i.webp'] }), filePath: RECORD },
    ], { ...maps, [RECORD]: JSON.stringify({ mapPath: A, extensions: { other: 1 } }, null, 2) });
    const service = AssetService.getInstance(vault.app);
    await service.initialize();

    const file = JSON.parse(vault.files.get(RECORD)!) as Record<string, unknown>;
    expect(file).toMatchObject({ mapPath: A });
    for (const key of ['extensions', 'createdBy', 'createdImages']) {
      expect(file, key).not.toHaveProperty(key);
      expect(file[RECORD_KEY], key).not.toHaveProperty(key);
    }
    expect(await dataOf(service, 'moved')).toEqual({ mapPath: A, extensions: { other: 1 }, createdBy: 'ext', createdImages: ['i.webp'] });
    expect(vault.files.get(METADATA_PATH)).toContain('"createdBy"');
  });

  it('stay byte for byte the same when an extension saves its data on the scene', async () => {
    const vault = seeded([{ ...scene('moved', { mapPath: A }), filePath: RECORD }], { ...maps, [RECORD]: JSON.stringify({ mapPath: A }) });
    const service = AssetService.getInstance(vault.app);
    await service.initialize();
    const before = vault.files.get(RECORD);

    await service.updateSceneIndexData('moved', { extensions: { ext: { item: 1 } } });
    expect(vault.files.get(RECORD)).toBe(before);
    expect(await dataOf(service, 'moved')).toEqual({ mapPath: A, extensions: { ext: { item: 1 } } });

    const added = await service.addAsset({ type: 'scene', name: 'New', collection: 'Default', tags: [], data: { mapPath: N, extensions: { ext: 1 }, createdBy: 'ext' } });
    const written = JSON.parse(vault.files.get(added.type === 'scene' ? added.filePath! : '')!) as Record<string, unknown>;
    expect(written).toMatchObject({ mapPath: N });
    expect(written).not.toHaveProperty('extensions');
    expect(written).not.toHaveProperty('createdBy');
  });

  it('are the same text with and without extension data', () => {
    const plain = { ...scene('s', { mapPath: A }), filePath: RECORD } as Asset;
    const kept = { ...scene('s', { mapPath: A, extensions: { ext: { a: 1 } }, createdBy: 'ext', createdImages: ['x.webp'] }), filePath: RECORD } as Asset;
    expect(serializeRecord(kept)).toBe(serializeRecord(plain));
  });
});

describe('a scene record file another device or a sync tool changed', () => {
  const A = 'atlas-vtt/collections/Default/scenes/a.atlasmap';
  const C = 'atlas-vtt/collections/Default/scenes/c.atlasmap';
  const RECORD = 'atlas-vtt/collections/Default/scenes/moved.json';
  const FOREIGN = 'atlas-vtt/collections/Default/scenes/foreign.json';

  async function started(files: Record<string, string>, metadata?: string): Promise<{ vault: InMemoryApp; service: AssetService }> {
    AssetService.resetInstance();
    const vault = createInMemoryApp({ folders: ['atlas-vtt/collections', 'atlas-vtt/collections/Default'], files: { ...files, ...(metadata ? { [METADATA_PATH]: metadata } : {}) } });
    const service = AssetService.getInstance(vault.app);
    await service.initialize();
    return { vault, service };
  }

  const editedFile = (text: string, edit: (file: Record<string, unknown>, record: Record<string, unknown>) => void): string => {
    const file = JSON.parse(text) as Record<string, unknown>;
    edit(file, file[RECORD_KEY] as Record<string, unknown>);
    return JSON.stringify(file, null, 2);
  };

  it('brings its own content and keeps what extensions keep on this device', async () => {
    const local = { ...scene('moved', { mapPath: A, extensions: { ext: { item: 1 } }, createdBy: 'ext', createdImages: ['i.webp'] }), filePath: RECORD };
    const { vault, service } = await started({ [A]: '{}' }, indexWith([local]));
    // Another device renamed the scene; its file never carried the extension data.
    await vault.app.vault.adapter.write(RECORD, editedFile(vault.files.get(RECORD)!, (_file, record) => { record.name = 'Renamed'; record.modifiedAt = 5; }));
    await service.refreshMetadata();

    const asset = await service.getAssetById('moved');
    expect(asset?.name).toBe('Renamed');
    expect((asset as { data?: unknown }).data).toEqual({ mapPath: A, extensions: { ext: { item: 1 } }, createdBy: 'ext', createdImages: ['i.webp'] });
  });

  it('drops the creator and images, keeping extension data, when a file points the scene at another map', async () => {
    const local = { ...scene('moved', { mapPath: A, extensions: { ext: { item: 1 } }, createdBy: 'ext', createdImages: ['i.webp'] }), filePath: RECORD };
    const { vault, service } = await started({ [A]: '{}', [C]: '{}' }, indexWith([local]));
    // A forged or sync-conflicted file names the GM's own map: replaceMap must not follow it there.
    await vault.app.vault.adapter.write(RECORD, editedFile(vault.files.get(RECORD)!, (file, record) => { file.mapPath = C; record.modifiedAt = 5; }));
    await service.refreshMetadata();

    expect(await dataOf(service, 'moved')).toEqual({ mapPath: C, extensions: { ext: { item: 1 } } });
  });

  it('never hands an extension, a creator or images to a scene, whatever the file says', async () => {
    const first = await started({ [A]: '{}' }, indexWith([{ ...scene('moved', { mapPath: A }), filePath: RECORD }]));
    // A device that never had the scene in its cache builds it from the synced file alone, with hand-added keys in it.
    const synced = syncedFiles(first.vault);
    synced[RECORD] = editedFile(synced[RECORD]!, (file) => { file.extensions = { ext: { item: 'forged' } }; file.createdBy = 'ext'; file.createdImages = ['../../notes.md']; });
    synced[FOREIGN] = editedFile(synced[RECORD]!, (_file, record) => { record.id = 'foreign'; record.name = 'Foreign'; });
    const { service } = await started(synced);
    await service.refreshMetadata();

    expect(await dataOf(service, 'moved')).toEqual({ mapPath: A });
    expect(await dataOf(service, 'foreign')).toEqual({ mapPath: A });
  });

  it('a copy a sync tool made carries no extension data', async () => {
    const local = { ...scene('moved', { mapPath: A, extensions: { ext: { item: 1 } }, createdBy: 'ext' }), filePath: RECORD };
    const { vault, service } = await started({ [A]: '{}' }, indexWith([local]));
    const copy = 'atlas-vtt/collections/Default/scenes/moved (copy).json';
    await vault.app.vault.adapter.write(copy, editedFile(vault.files.get(RECORD)!, (file) => { file.extensions = { ext: { item: 2 } }; file.createdBy = 'ext'; }));
    await service.reconcileWithVault();

    for (const asset of await service.getAssets('Default', 'scene')) {
      if (asset.id === 'moved') continue;
      expect((asset as { data?: Record<string, unknown> }).data).not.toHaveProperty('extensions');
      expect((asset as { data?: Record<string, unknown> }).data).not.toHaveProperty('createdBy');
    }
    expect(await dataOf(service, 'moved')).toEqual({ mapPath: A, extensions: { ext: { item: 1 } }, createdBy: 'ext' });
  });
});
