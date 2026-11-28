import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AssetService } from '../../src/app/services/AssetService';
import { sceneSnapshotFolder } from '../../src/app/snapshots/snapshotPaths';
import { createInMemoryApp } from '../mocks/inMemoryVault';

/*
 * A delete goes on when Obsidian cannot answer on the way: what could not be checked stays in the vault, the rest
 * goes, and the asset leaves the index. A delete that stopped halfway would leave an entry whose record is gone.
 */

const IMAGE = 'atlas-vtt/assets/region.webp';
const MAP = 'atlas-vtt/collections/c/scenes/Cave.atlasmap';

beforeEach(() => {
  AssetService.resetInstance();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('a delete while Obsidian cannot answer', () => {
  it('keeps a map\'s image and removes the map when the notes\' links cannot be read', async () => {
    const vault = createInMemoryApp({ files: { [IMAGE]: 'IMG' } });
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    const map = await assets.addAsset({ type: 'map', name: 'Region', collection: AssetService.defaultCollectionId(), tags: [], mapFilePath: IMAGE });
    Object.defineProperty(vault.app.metadataCache, 'resolvedLinks', { get: () => { throw new Error('links not ready'); }, configurable: true });

    await assets.deleteAsset(map.id);

    expect(await assets.getAssetById(map.id)).toBeFalsy();
    expect(vault.files.get(IMAGE)).toBe('IMG');
    expect([...vault.files.keys()].some((path) => path.includes(map.id))).toBe(false);
  });

  it('keeps a scene\'s map, trashes its snapshots and removes the scene when a note tab cannot say what it shows', async () => {
    const vault = createInMemoryApp();
    const assets = AssetService.getInstance(vault.app);
    await assets.initialize();
    await assets.createCollection('c');
    await vault.app.vault.create(MAP, '{}');
    const scene = await assets.addAsset({ type: 'scene', name: 'Cave', collection: 'c', tags: [], data: { mapPath: MAP } });
    const snapshot = `${sceneSnapshotFolder('c', scene.id)}/snap1.json`;
    await vault.app.vault.create(snapshot, '{}');
    const leaf = { view: { getState: (): never => { throw new Error('view not ready'); } }, detach: (): void => undefined };
    (vault.app.workspace as unknown as { getLeavesOfType: () => unknown[] }).getLeavesOfType = () => [leaf];

    await assets.deleteAsset(scene.id);

    expect(await assets.getAssetById(scene.id)).toBeFalsy();
    expect(vault.files.has(MAP)).toBe(true);
    expect(vault.files.has(snapshot)).toBe(false);
    expect([...vault.files.keys()].some((path) => path.endsWith(`${scene.id}.json`))).toBe(false);
  });
});
