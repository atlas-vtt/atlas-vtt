import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Plugin } from 'obsidian';
import { AssetService, type SceneAsset } from '../../src/app/services/AssetService';
import { COPY_SETTLE_MS, libraryClock } from '../../src/app/services/library/libraryState';
import { registerVaultSync } from '../../src/app/plugin/vaultSync';
import { snapshotsOfMap } from '../../src/app/links/atlasLinkAssets';
import { adoptOrphanedSnapshots } from '../../src/app/snapshots/orphanedSnapshots';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { recoveredId } from '../../src/app/services/vault-sync/recoveredIds';
import { createInMemoryApp, type InMemoryApp } from '../mocks/inMemoryVault';

vi.mock('obsidian', async (importOriginal) => ({
  ...await importOriginal<typeof import('obsidian')>(),
  debounce: (callback: () => void) => Object.assign(() => callback(), { cancel: (): void => {} }),
}));
vi.mock('../../src/app/plugin/atlasLeaves', () => ({ closeMapTab: vi.fn(), getLoadedAtlasView: vi.fn(() => null) }));

const CAVE = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';
const CAVE_IMAGE = 'atlas-vtt/assets/cave.webp';
const OLD_FOLDER = sceneSnapshotFolder('c', 'scene-old');

const mapFile = (background: string): string =>
  JSON.stringify({ version: 4, state: { schema: 'atlas-vtt', version: 4, background, objects: { tokens: {} } } });

const snapshotFile = (id: string, background: string): string =>
  JSON.stringify({ format: 1, id, name: `Room ${id}`, createdAt: 1, version: 4, state: { schema: 'atlas-vtt', version: 4, background, objects: { tokens: {} } } });

/** A vault whose scene record is gone: only the map and the snapshots saved under the scene's old id are left. */
function vaultWithOrphan(files: Record<string, string> = {}): InMemoryApp {
  return createInMemoryApp({
    files: {
      [CAVE]: mapFile(CAVE_IMAGE),
      [`${OLD_FOLDER}/s1.json`]: snapshotFile('s1', CAVE_IMAGE),
      [`${OLD_FOLDER}/s1.jpg`]: 'jpg',
      ...files,
    },
  });
}

async function rebuiltScenes(vault: InMemoryApp): Promise<SceneAsset[]> {
  AssetService.resetInstance();
  const assets = AssetService.getInstance(vault.app);
  await assets.initialize();
  return assets.getAssets(undefined, 'scene') as Promise<SceneAsset[]>;
}

const later = (): void => {
  const now = Date.now() + COPY_SETTLE_MS;
  vi.spyOn(libraryClock, 'now').mockReturnValue(now);
};

afterEach(() => {
  vi.restoreAllMocks();
  AssetService.resetInstance();
});

describe('snapshots of a scene whose id changed', () => {
  it('show in the tray again once the rebuilt scene has stood a while, at the next start', async () => {
    const vault = vaultWithOrphan();
    const [scene] = await rebuiltScenes(vault);
    expect(scene!.id).toBe(recoveredId('scene', CAVE));
    expect((await snapshotsOfMap(vault.app, CAVE)).entries).toHaveLength(0);

    later();
    registerVaultSync({ app: vault.app, register: vi.fn(), registerEvent: vi.fn() } as unknown as Plugin);

    await vi.waitFor(async () => expect((await snapshotsOfMap(vault.app, CAVE)).entries.map((entry) => entry.snapshot.id)).toEqual(['s1']));
    const folder = sceneSnapshotFolder('c', scene!.id);
    expect(vault.files.has(`${folder}/s1.jpg`)).toBe(true);
    expect(vault.files.has(`${OLD_FOLDER}/s1.json`)).toBe(false);
  });

  it('stay put while the rebuilt scene is new: the record that keeps the old id may still be on its way', async () => {
    const vault = vaultWithOrphan();
    await adoptOrphanedSnapshots(vault.app, await rebuiltScenes(vault));

    expect(vault.files.has(`${OLD_FOLDER}/s1.json`)).toBe(true);
  });

  it('stay put when their snapshots show another map', async () => {
    const vault = vaultWithOrphan({ [CAVE]: mapFile('atlas-vtt/assets/forest.webp') });
    const scenes = await rebuiltScenes(vault);
    later();
    await adoptOrphanedSnapshots(vault.app, scenes);

    expect(vault.files.has(`${OLD_FOLDER}/s1.json`)).toBe(true);
  });

  it('stay put when two scenes without snapshots show the same map', async () => {
    const vault = vaultWithOrphan({ 'atlas-vtt/collections/c/scenes/Cave copy.atlasmap': mapFile(CAVE_IMAGE) });
    const scenes = await rebuiltScenes(vault);
    expect(scenes).toHaveLength(2);
    later();
    await adoptOrphanedSnapshots(vault.app, scenes);

    expect(vault.files.has(`${OLD_FOLDER}/s1.json`)).toBe(true);
  });

  it('go back to the real scene once its record is back, from the folder of the rebuilt one', async () => {
    const rebuiltFolder = sceneSnapshotFolder('c', recoveredId('scene', CAVE));
    const vault = createInMemoryApp({
      files: {
        [CAVE]: mapFile(CAVE_IMAGE),
        [`${rebuiltFolder}/s1.json`]: snapshotFile('s1', CAVE_IMAGE),
      },
    });
    const real = { id: 'scene-cave', collection: 'c', createdAt: Date.now(), data: { mapPath: CAVE } };
    await adoptOrphanedSnapshots(vault.app, [real]);

    expect(vault.files.has(`${sceneSnapshotFolder('c', 'scene-cave')}/s1.json`)).toBe(true);
    expect(vault.files.has(`${rebuiltFolder}/s1.json`)).toBe(false);
  });

  it('never leave a folder that belongs to a scene of the index', async () => {
    const vault = createInMemoryApp({
      files: {
        [CAVE]: mapFile(CAVE_IMAGE),
        [`${OLD_FOLDER}/s1.json`]: snapshotFile('s1', CAVE_IMAGE),
      },
    });
    const owner = { id: 'scene-old', collection: 'c', createdAt: 0, data: { mapPath: 'atlas-vtt/collections/c/scenes/Other.atlasmap' } };
    const rebuilt = { id: recoveredId('scene', CAVE), collection: 'c', createdAt: 0, data: { mapPath: CAVE } };
    await adoptOrphanedSnapshots(vault.app, [owner, rebuilt]);

    expect(vault.files.has(`${OLD_FOLDER}/s1.json`)).toBe(true);
  });
});
