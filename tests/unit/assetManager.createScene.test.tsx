import { describe, expect, it, vi } from 'vitest';
import { buildAssetContextMenuEntries, type AssetContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import type { MapAsset } from '../../src/app/packages/components/asset-manager/types';

const keep: MapAsset = { id: 'keep', name: 'Keep', type: 'maps', imageUrl: '', mapFilePath: 'atlas-vtt/assets/keep.jpg', folderId: null, modifiedAt: 0 };

// #156: after adding a map, nothing in the map's menu led to a scene.
describe('creating a scene in the asset manager', () => {
  it('offers Create scene on a map, built on that map', () => {
    const openCreateScene = vi.fn();
    const deps = { app: {}, folders: [], transferTargets: [], selectedAssetIds: ['keep'], assets: [keep], openCreateScene } as unknown as AssetContextMenuDeps;
    const entry = buildAssetContextMenuEntries(keep, [keep], deps)[0];

    expect(entry).toMatchObject({ type: 'item', label: 'Create scene…' });
    if (entry.type === 'item') void entry.onClick();
    expect(openCreateScene).toHaveBeenCalledWith({ backgroundPath: 'atlas-vtt/assets/keep.jpg', defaultName: 'Keep' });
  });
});
