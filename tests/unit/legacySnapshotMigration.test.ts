import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { migrateLegacySnapshots, SNAPSHOT_MIGRATION_KEY } from '../../src/app/snapshots/legacySnapshotMigration';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const LEGACY = 'atlas-vtt/collections/c/scenes/.snapshots/Cave';
const MAP = JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, objects: { tokens: {} } } });

interface Setup { vault: InMemoryApp; assets: AssetService; folder: string }

/** A vault whose scene `Cave` has two snapshot files in the hidden folder earlier versions used. */
async function legacyVault(extra: Record<string, string> = {}): Promise<Setup> {
  const vault = createInMemoryApp({ files: { [MAP_PATH]: MAP, ...extra } });
  for (const [name, content] of [['s1.json', '{"id":"s1"}'], ['s1.jpg', 'JPG']]) {
    await vault.app.vault.adapter.write(`${LEGACY}/${name}`, content);
  }
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  const [scene] = await assets.getAssets('c', 'scene');
  return { vault, assets, folder: sceneSnapshotFolder('c', scene!.id) };
}

afterEach(() => {
  AssetService.resetInstance();
  vi.restoreAllMocks();
});

describe('carrying snapshots over from their hidden folders', () => {
  it('moves them into the collection folder of their scene, through the vault, and drops the hidden copies', async () => {
    const { vault, assets, folder } = await legacyVault();

    const result = await migrateLegacySnapshots(vault.app, assets);

    expect(result).toEqual({ moved: 2, duplicates: 0, leftovers: [] });
    expect(vault.files.get(`${folder}/s1.json`)).toBe('{"id":"s1"}');
    expect(vault.files.get(`${folder}/s1.jpg`)).toBe('JPG');
    expect(vault.app.vault.createBinary).toHaveBeenCalledTimes(2);
    expect([...vault.files.keys()].some((path) => path.includes('.snapshots'))).toBe(false);
    expect(vault.folders.has('atlas-vtt/collections/c/scenes/.snapshots')).toBe(false);
    expect(vault.localStorage.get(SNAPSHOT_MIGRATION_KEY)).toBe(1);
  });

  it('runs once per device', async () => {
    const { vault, assets, folder } = await legacyVault();
    await migrateLegacySnapshots(vault.app, assets);
    await vault.app.vault.adapter.write(`${LEGACY}/s2.json`, '{"id":"s2"}');

    expect(await migrateLegacySnapshots(vault.app, assets)).toBeNull();
    expect(vault.files.has(`${folder}/s2.json`)).toBe(false);
  });

  it('keeps what another device carried over and synced, and drops the local duplicate', async () => {
    const { vault, assets, folder } = await legacyVault();
    await vault.app.vault.create(`${folder}/s1.json`, '{"id":"s1","fromOtherDevice":true}');

    const result = await migrateLegacySnapshots(vault.app, assets);

    expect(result).toEqual({ moved: 1, duplicates: 1, leftovers: [] });
    expect(vault.files.get(`${folder}/s1.json`)).toBe('{"id":"s1","fromOtherDevice":true}');
    expect(vault.files.get(`${folder}/s1.jpg`)).toBe('JPG');
    expect([...vault.files.keys()].some((path) => path.includes('.snapshots'))).toBe(false);
  });

  it('leaves the folders of maps that belong to no scene where they are, which is where those maps keep them', async () => {
    const { vault, assets } = await legacyVault({ 'Elsewhere/Loose.atlasmap': MAP });
    await vault.app.vault.adapter.write('Elsewhere/.snapshots/Loose/s9.json', '{}');
    await vault.app.vault.adapter.write('atlas-vtt/collections/c/scenes/.snapshots/Gone/s8.json', '{}');

    const result = await migrateLegacySnapshots(vault.app, assets);

    expect(result?.leftovers.sort()).toEqual(['Elsewhere/.snapshots/Loose', 'atlas-vtt/collections/c/scenes/.snapshots/Gone']);
    expect(vault.files.get('Elsewhere/.snapshots/Loose/s9.json')).toBe('{}');
    expect(vault.files.get('atlas-vtt/collections/c/scenes/.snapshots/Gone/s8.json')).toBe('{}');
    expect(result?.moved).toBe(2);
    // The map of the folder inside a collection is gone, so nothing waits for a later start.
    expect(await migrateLegacySnapshots(vault.app, assets)).toBeNull();
  });

  it('carries over at a later start a folder whose map has no scene yet', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { vault, assets } = await legacyVault({ 'atlas-vtt/collections/c/scenes/Later.atlasmap': MAP });
    await vault.app.vault.adapter.write('atlas-vtt/collections/c/scenes/.snapshots/Later/s7.json', '{}');
    vi.spyOn(assets, 'getAssets').mockResolvedValueOnce([]);

    await migrateLegacySnapshots(vault.app, assets);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('wait for their scene'), expect.arrayContaining(['atlas-vtt/collections/c/scenes/.snapshots/Later']));
    expect(await migrateLegacySnapshots(vault.app, assets)).not.toBeNull();
  });
});
