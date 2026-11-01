import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { AssetService, type SoundAsset } from '../../../src/app/services/AssetService';
import { transferAssets } from '../../../src/app/services/assetTransfer/assetTransfer';
import { recordFilePath } from '../../../src/app/services/vault-sync/assetFiles';
import { createInMemoryApp, type InMemoryApp } from '../../mocks/inMemoryVault';

const SOURCE = 'atlas-vtt/collections/source';
const TARGET = 'atlas-vtt/collections/target';

let vault: InMemoryApp;
let assets: AssetService;

async function sound(audioPath: string, fields: Partial<SoundAsset> = {}): Promise<SoundAsset> {
  if (!vault.files.has(audioPath)) await vault.app.vault.create(audioPath, 'AUDIO');
  const added = await assets.addAsset({ type: 'sound', name: 'Rain', collection: 'source', tags: [], audioPath, kind: 'music', licence: 'unknown', streaming: 'unknown', ...fields });
  return added as SoundAsset;
}

const transfer = (ids: string[], mode: 'move' | 'copy'): ReturnType<typeof transferAssets> =>
  transferAssets(vault.app, assets, { assetIds: ids, targetCollectionId: 'target', mode });

beforeEach(async () => {
  vault = createInMemoryApp({ folders: ['atlas-vtt/collections'] });
  (vault.app.vault as { readBinary: unknown }).readBinary = async (file: TFile): Promise<ArrayBuffer> =>
    new TextEncoder().encode(vault.files.get(file.path) ?? '').buffer as ArrayBuffer;
  AssetService.resetInstance();
  assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  await assets.createCollection('source');
  await assets.createCollection('target');
});

describe('moving a sound to another collection', () => {
  it('keeps its id, moves its record and its audio from the source\'s folder', async () => {
    const original = await sound(`${SOURCE}/sounds/rain.mp3`, { trimDb: -2, credit: 'X' });
    const { assets: [moved] } = await transfer([original.id], 'move');
    expect(moved).toMatchObject({ id: original.id, collection: 'target', audioPath: `${TARGET}/sounds/rain.mp3`, trimDb: -2, credit: 'X' });
    expect(vault.files.has(`${TARGET}/sounds/rain.mp3`)).toBe(true);
    expect(vault.files.has(`${SOURCE}/sounds/rain.mp3`)).toBe(false);
    expect(vault.files.has(recordFilePath(moved!))).toBe(true);
    expect(vault.files.has(`${SOURCE}/sounds/${original.id}.json`)).toBe(false);
  });

  it('leaves audio outside the source\'s folder where it lies', async () => {
    const original = await sound('Library/rain.mp3');
    const { assets: [moved] } = await transfer([original.id], 'move');
    expect(moved).toMatchObject({ audioPath: 'Library/rain.mp3', collection: 'target' });
    expect(vault.files.has('Library/rain.mp3')).toBe(true);
    expect(vault.app.vault.createBinary).not.toHaveBeenCalled();
  });

  it('copies audio a sound staying behind still uses', async () => {
    const leaving = await sound(`${SOURCE}/music/rain.mp3`);
    await sound(`${SOURCE}/music/rain.mp3`, { name: 'Other' });
    const { assets: [moved] } = await transfer([leaving.id], 'move');
    expect((moved as SoundAsset).audioPath).toBe(`${TARGET}/music/rain.mp3`);
    expect(vault.files.has(`${SOURCE}/music/rain.mp3`)).toBe(true);
    expect(vault.files.has(`${TARGET}/music/rain.mp3`)).toBe(true);
  });

  it('registers the tags it carries in the target', async () => {
    await assets.createTag('source', 'sounds', 'Weather');
    const original = await sound('Library/rain.mp3', { tags: ['Weather'] });
    await transfer([original.id], 'move');
    expect((await assets.getCollectionTags('target', 'sounds')).map((tag) => tag.name)).toEqual(['Weather']);
    expect(await assets.getCollectionTags('target', 'tokens')).toEqual([]);
  });

  it('puts everything back when the commit fails', async () => {
    const original = await sound(`${SOURCE}/sounds/rain.mp3`);
    const refuse = vi.spyOn(assets, 'commitAssetTransfer').mockRejectedValueOnce(new Error('disk full'));
    await expect(transfer([original.id], 'move')).rejects.toThrow('disk full');
    refuse.mockRestore();
    expect(vault.files.has(`${SOURCE}/sounds/rain.mp3`)).toBe(true);
    expect((await assets.getAssetById(original.id))?.collection).toBe('source');
  });
});

describe('copying a sound to another collection', () => {
  it('gets a new id and shares audio that lies outside the source\'s folder', async () => {
    const original = await sound('Library/rain.mp3');
    const { assets: [copied] } = await transfer([original.id], 'copy');
    expect(copied?.id).not.toBe(original.id);
    expect((copied as SoundAsset).audioPath).toBe('Library/rain.mp3');
    expect(vault.files.has(recordFilePath(copied!))).toBe(true);
    expect(await assets.getAssetById(original.id)).not.toBeNull();
    expect(vault.app.vault.createBinary).not.toHaveBeenCalled();
  });

  it('copies audio inside the source\'s folder, so the target never depends on it', async () => {
    const original = await sound(`${SOURCE}/sounds/rain.mp3`);
    const { assets: [copied] } = await transfer([original.id], 'copy');
    expect((copied as SoundAsset).audioPath).toBe(`${TARGET}/sounds/rain.mp3`);
    expect(vault.files.has(`${SOURCE}/sounds/rain.mp3`)).toBe(true);
    expect(vault.files.has(`${TARGET}/sounds/rain.mp3`)).toBe(true);
  });

  it('a sound whose file is missing goes anyway and keeps waiting', async () => {
    const original = await sound('Library/rain.mp3');
    vault.files.delete('Library/rain.mp3');
    const { assets: [moved] } = await transfer([original.id], 'move');
    expect(moved).toMatchObject({ collection: 'target', audioPath: 'Library/rain.mp3' });
  });
});
