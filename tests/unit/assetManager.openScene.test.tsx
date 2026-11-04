import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { buildAssetContextMenuEntries, type AssetContextMenuDeps } from '../../src/app/packages/components/asset-manager/contextMenus/assetContextMenu';
import type { SceneAsset } from '../../src/app/packages/components/asset-manager/types';

const keep: SceneAsset = { id: 'scene-keep', name: 'Keep', type: 'scenes', folderId: null, modifiedAt: 0 };
const crypt: SceneAsset = { id: 'scene-crypt', name: 'Crypt', type: 'scenes', folderId: null, modifiedAt: 0 };
const keepFile = new TFile('atlas-vtt/collections/Default/scenes/Keep.atlasmap');

// A scene only opened on double-click, which new users did not find.
describe('opening a scene from the asset manager', () => {
  it('offers Open Scene on a scene, opening it like a double-click', async () => {
    const openFile = vi.fn(async (): Promise<void> => {});
    const onClose = vi.fn();
    const deps = {
      folders: [], transferTargets: [], selectedAssetIds: ['scene-keep'], assets: [keep], onClose,
      app: {
        vault: { getAbstractFileByPath: (path: string) => (path === keepFile.path ? keepFile : null) },
        workspace: { getLeaf: () => ({ openFile }) },
      },
      assetService: { getAssetById: async () => ({ type: 'scene', data: { mapPath: keepFile.path } }) },
    } as unknown as AssetContextMenuDeps;
    const entry = buildAssetContextMenuEntries(keep, [keep], deps)[0];

    expect(entry).toMatchObject({ type: 'item', label: 'Open Scene' });
    if (entry.type === 'item') void entry.onClick();
    await vi.waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(openFile).toHaveBeenCalledWith(keepFile);
  });

  it('leaves Open Scene out while several scenes are selected', () => {
    const deps = {
      folders: [], transferTargets: [], selectedAssetIds: ['scene-keep', 'scene-crypt'], assets: [keep, crypt],
    } as unknown as AssetContextMenuDeps;
    const labels = buildAssetContextMenuEntries(keep, [keep, crypt], deps)
      .map((entry) => ('label' in entry ? entry.label : undefined));

    expect(labels).not.toContain('Open Scene');
  });
});
