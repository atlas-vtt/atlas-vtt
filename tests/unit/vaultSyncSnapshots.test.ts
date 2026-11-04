import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, type Plugin } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { registerVaultSync } from '../../src/app/plugin/vaultSync';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

// The check runs at once instead of after the vault went quiet.
vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  debounce: (callback: () => void) => Object.assign(() => callback(), { cancel: (): void => {} }),
}));
vi.mock('../../src/app/plugin/atlasLeaves', () => ({ closeMapTab: vi.fn(), getLoadedAtlasView: vi.fn(() => null) }));

const MAP_PATH = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const MAP = JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, objects: { tokens: {} } } });

async function syncedVault(): Promise<{ vault: InMemoryApp; assets: AssetService; folder: string }> {
  const vault = createInMemoryApp({ files: { [MAP_PATH]: MAP } });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  const [scene] = await assets.getAssets('c', 'scene');
  const folder = sceneSnapshotFolder('c', scene!.id);
  await vault.app.vault.create(`${folder}/s1.json`, '{}');
  const plugin = { app: vault.app, register: vi.fn(), registerEvent: vi.fn() } as unknown as Plugin;
  registerVaultSync(plugin);
  return { vault, assets, folder };
}

afterEach(() => AssetService.resetInstance());

describe('snapshots of a map deleted outside Atlas', () => {
  it('stay: a deletion may be another device renaming the map, and a trash here would sync back to it', async () => {
    const { vault, assets, folder } = await syncedVault();

    vault.files.delete(MAP_PATH);
    vault.emit('delete', new TFile(MAP_PATH));

    await vi.waitFor(async () => expect(await assets.getAssets('c', 'scene')).toHaveLength(1));
    // Let the rest of the check run.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vault.files.has(`${folder}/s1.json`)).toBe(true);
  });

  it('stay while the map only moved and its scene follows it', async () => {
    const { vault, assets, folder } = await syncedVault();
    const moved = 'atlas-vtt/collections/c/scenes/Old/Cave.atlasmap';

    await vault.app.vault.adapter.rename(MAP_PATH, moved);
    vault.emit('delete', new TFile(MAP_PATH));

    await vi.waitFor(async () => expect((await assets.getAssets('c', 'scene'))[0]?.data?.mapPath).toBe(moved));
    // Let the rest of the check run, which would trash them.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(vault.files.has(`${folder}/s1.json`)).toBe(true);
  });
});
