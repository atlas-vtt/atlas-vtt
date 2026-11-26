import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, type Plugin } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { registerVaultSync } from '../../src/app/plugin/vaultSync';
import { presentedSceneOf } from '../../src/app/services/presentedScene';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

vi.mock('../../src/app/plugin/atlasLeaves', () => ({ closeMapTab: vi.fn(), getLoadedAtlasView: vi.fn(() => null) }));

const CAVE = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const CRYPT = 'atlas-vtt/collections/c/scenes/Crypt.atlasmap';
const MAP = JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, objects: { tokens: {} } } });

/** A vault with two scenes, the cave presented to players. */
async function presentingCave(): Promise<{ vault: InMemoryApp; assets: AssetService }> {
  const vault = createInMemoryApp({ files: { [CAVE]: MAP, [CRYPT]: MAP } });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  presentedSceneOf(vault.app).set({ tabId: 'tab-cave', filePath: CAVE });
  registerVaultSync({ app: vault.app, register: vi.fn(), registerEvent: vi.fn() } as unknown as Plugin);
  return { vault, assets };
}

const deleted = (vault: InMemoryApp, path: string): void => {
  vault.files.delete(path);
  vault.emit('delete', new TFile(path));
};

/** Past the second the vault has to stay quiet before Atlas checks it. */
const settled = (): Promise<void> => vi.advanceTimersByTimeAsync(1500);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

afterEach(() => {
  vi.useRealTimers();
  AssetService.resetInstance();
});

describe('the presented scene when a map is deleted', () => {
  it('is presented no longer once its map is gone, so a scene made later at its path is not shown to players unasked', async () => {
    const { vault } = await presentingCave();
    deleted(vault, CAVE);
    await settled();
    expect(presentedSceneOf(vault.app).get()).toBeNull();
    await vault.app.vault.create(CAVE, MAP);
    expect(presentedSceneOf(vault.app).get()).toBeNull();
  });

  it('stays while another map is deleted', async () => {
    const { vault, assets } = await presentingCave();
    deleted(vault, CRYPT);
    await settled();
    expect(await assets.getAssets('c', 'scene')).toHaveLength(1);
    expect(presentedSceneOf(vault.app).get()).toEqual({ tabId: 'tab-cave', filePath: CAVE });
  });

  it('stays while its map only moved, as a sync delivers another device\'s rename', async () => {
    const { vault, assets } = await presentingCave();
    const moved = 'atlas-vtt/collections/c/scenes/Old/Cave.atlasmap';
    await vault.app.vault.adapter.rename(CAVE, moved);
    vault.emit('delete', new TFile(CAVE));
    await settled();
    expect((await assets.getAssets('c', 'scene')).some((scene) => scene.data?.mapPath === moved)).toBe(true);
    expect(presentedSceneOf(vault.app).get()?.tabId).toBe('tab-cave');
  });
});
