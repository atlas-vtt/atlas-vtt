import { afterEach, describe, expect, it, vi } from 'vitest';
import { TFile, TFolder, type Plugin, type TAbstractFile } from 'obsidian';
import { AssetService } from '../../src/app/services/AssetService';
import { registerVaultSync } from '../../src/app/plugin/vaultSync';
import { folderIdOf, readTabFolders, tabFolderPath } from '../../src/app/packages/components/asset-manager/utils/assetFolders';
import { renameAssetFolder } from '../../src/app/packages/components/asset-manager/utils/assetFolderRename';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

// The check runs at once instead of after the vault went quiet.
vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  debounce: (callback: () => void) => Object.assign(() => callback(), { cancel: (): void => {} }),
}));
vi.mock('../../src/app/plugin/atlasLeaves', () => ({ closeMapTab: vi.fn(), getLoadedAtlasView: vi.fn(() => null) }));

const SCENES = tabFolderPath('c', 'scenes');
const TOKENS = tabFolderPath('c', 'tokens');
const MAP = JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, objects: { tokens: {} } } });

/** Whether Obsidian asks about the links to the renamed files, which holds its rename's promise until answered. */
const asks = { aboutLinks: false };

/** Lets a rename report itself as Obsidian does: the folder and every file in it, in the task that renamed them. */
function reportRenames(vault: InMemoryApp): void {
  const rename = vi.mocked(vault.app.fileManager.renameFile);
  const move = rename.getMockImplementation()!;
  rename.mockImplementation(async (file: TAbstractFile, newPath: string) => {
    const from = file.path;
    const inside = [...vault.files.keys()].filter((path) => path.startsWith(`${from}/`));
    await move(file, newPath);
    vault.emit('rename', file instanceof TFolder ? new TFolder(newPath) : new TFile(newPath), from);
    for (const path of inside) vault.emit('rename', new TFile(newPath + path.slice(from.length)), path);
    if (asks.aboutLinks) await new Promise<void>(() => {});
  });
}

async function syncedVault(): Promise<{ vault: InMemoryApp; assets: AssetService }> {
  const vault = createInMemoryApp({
    files: { [`${SCENES}/Act 1/Cave.atlasmap`]: MAP, [`${TOKENS}/Villains/lich.webp`]: 'IMG' },
  });
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  registerVaultSync({ app: vault.app, register: vi.fn(), registerEvent: vi.fn() } as unknown as Plugin);
  reportRenames(vault);
  return { vault, assets };
}

/** Lets the rename events' own passes and the vault check they ask for run to their end. */
const settled = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 50));

afterEach(() => {
  AssetService.resetInstance();
  asks.aboutLinks = false;
});

describe('a folder renamed in the asset manager, once Atlas has followed the rename events', () => {
  it('holds its scene under the new name, once, and the old folder is not back', async () => {
    const { vault, assets } = await syncedVault();
    const [scene] = await assets.getAssets('c', 'scene');

    await renameAssetFolder(vault.app, assets, folderIdOf(`${SCENES}/Act 1`), 'Prologue');
    // What the asset manager reads right after the rename, before any event was followed to its end.
    expect((await assets.getAssets('c', 'scene'))[0]?.data?.mapPath).toBe(`${SCENES}/Prologue/Cave.atlasmap`);
    await settled();

    expect(readTabFolders(vault.app, 'c', 'scenes').map((folder) => folder.path)).toEqual(['Prologue']);
    expect(await assets.getAssets('c', 'scene')).toEqual([expect.objectContaining({ id: scene!.id, data: expect.objectContaining({ mapPath: `${SCENES}/Prologue/Cave.atlasmap` }) })]);
    expect(vault.folders.has(`${SCENES}/Act 1`)).toBe(false);
    expect([...vault.files.keys()].filter((path) => path.startsWith(`${SCENES}/Act 1/`))).toEqual([]);
  });

  it('holds its token under the new name, once', async () => {
    const { vault, assets } = await syncedVault();
    const [token] = await assets.getAssets('c', 'token');

    await renameAssetFolder(vault.app, assets, folderIdOf(`${TOKENS}/Villains`), 'Foes');
    await settled();

    expect(readTabFolders(vault.app, 'c', 'tokens').map((folder) => folder.path)).toEqual(['Foes']);
    expect(await assets.getAssets('c', 'token')).toEqual([expect.objectContaining({ id: token!.id, imagePath: `${TOKENS}/Foes/lich.webp` })]);
    expect(vault.folders.has(`${TOKENS}/Villains`)).toBe(false);
  });

  it('is renamed while Obsidian still asks whether to update the links to its files', async () => {
    const { vault, assets } = await syncedVault();
    asks.aboutLinks = true;

    const renamed = await renameAssetFolder(vault.app, assets, folderIdOf(`${SCENES}/Act 1`), 'Prologue');

    expect(renamed).toBe(folderIdOf(`${SCENES}/Prologue`));
    expect((await assets.getAssets('c', 'scene'))[0]?.data?.mapPath).toBe(`${SCENES}/Prologue/Cave.atlasmap`);
    // The index is free again for the vault check and for the next edit.
    await expect(assets.runExclusive(async () => 'free')).resolves.toBe('free');
  });
});
