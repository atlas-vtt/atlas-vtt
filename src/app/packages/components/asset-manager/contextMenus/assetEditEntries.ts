import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { AnyAsset } from '../types';
import type { AssetContextMenuDeps } from './assetContextMenu';
import { renameScene } from '../../../../services/sceneRename';
import { runInBackground } from '../../../../utils/backgroundTask';
import { tokenSizeSubmenu } from '../../../../react/components/context-menu/tokenSizeMenu';
import { createStatblockEntry } from '../../../../statblocks/editor/create/entryPoints';
import { copyAssetLink } from '../../../../links/atlasLinkText';
import { t } from '../../../../i18n';

/** Edit token, Edit encounter or Rename for the clicked asset. */
function editEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  if (asset.type === 'encounters' && selectedAssets.length <= 1) {
    entries.push({ type: 'item', label: t('am.menu.editEncounter'), icon: 'swords', onClick: () => deps.editEncounter(asset) });
  }
  if (asset.type === 'tokens') {
    entries.push({
      type: 'item',
      label: t('am.menu.editToken'),
      icon: 'edit',
      onClick: () => {
        deps.setEditingToken(asset);
        deps.setIsTokenCreatorOpen(true);
      },
    });
    return entries;
  }
  const label =
    asset.type === 'encounters' ? t('am.menu.renameEncounter')
    : asset.type === 'maps' ? t('am.menu.renameMap')
    : asset.type === 'scenes' ? t('am.menu.renameScene')
    : t('am.menu.rename');
  entries.push({ type: 'item', label, icon: 'edit', onClick: () => askToRename(asset, deps) });
  return entries;
}

function askToRename(asset: AnyAsset, deps: AssetContextMenuDeps): void {
  deps.setInputModalState({
    isOpen: true,
    title: t('am.menu.renameTitle', { name: asset.name }),
    placeholder: t('am.menu.newName'),
    defaultValue: asset.name,
    onConfirm: (newName: string) => {
      if (newName.trim() === asset.name) return;
      if (asset.type === 'scenes') {
        const { assetService } = deps;
        if (!assetService) return;
        runInBackground(
          renameScene(deps.app, assetService, asset.id, newName).then(() => deps.loadAssetsForActiveTab()),
          `Renaming scene ${asset.id}`,
          t('am.menu.renameSceneFailed'),
        );
        return;
      }
      deps.setAssets((prev) => prev.map((a) => (a.id === asset.id ? { ...a, name: newName.trim() } : a)));
      if (deps.assetService) {
        runInBackground(deps.assetService.updateAsset(asset.id, { name: newName.trim() }), `Renaming asset ${asset.id}`);
      }
    },
  });
}

/** The default size of every selected token. */
function sizeEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  if (asset.type !== 'tokens') return [];
  const tokenIds = selectedAssets.filter((a) => a.type === 'tokens').map((a) => a.id);
  return [tokenSizeSubmenu(asset.size, (size) => {
    deps.setAssets((prev) => prev.map((a) => (tokenIds.includes(a.id) ? { ...a, size } : a)));
    const service = deps.assetService;
    if (!service) return;
    for (const id of tokenIds) {
      runInBackground(service.updateAsset(id, { size }), `Updating size of asset ${id}`);
    }
  })];
}

/** Open, change, unlink or create the statblock of a single token. */
function statblockEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  if (asset.type !== 'tokens' || selectedAssets.length !== 1) return [];
  if (asset.statblockPath) {
    return [
      { type: 'item', label: t('assetGrid.openStatblock'), icon: 'scroll-text', onClick: () => deps.openStatblock(asset) },
      { type: 'item', label: t('am.menu.changeStatblock'), icon: 'file-text', onClick: () => deps.openStatblockLinkModal(asset) },
      { type: 'item', label: t('am.menu.unlinkStatblock'), icon: 'unlink', onClick: () => deps.unlinkStatblock(asset) },
    ];
  }
  const entries: ContextMenuEntry[] = [
    { type: 'item', label: t('am.menu.linkStatblock'), icon: 'file-text', onClick: () => deps.openStatblockLinkModal(asset) },
  ];
  const token = { imagePath: asset.imagePath ?? asset.imageUrl, name: asset.name };
  const create = createStatblockEntry(deps.app, { collectionId: deps.collectionId, from: 'asset-manager', token, onStart: deps.onClose });
  if (create) entries.push(create);
  return entries;
}

/** A link to a single scene or encounter, for a note. */
function copyLinkEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  const { assetService } = deps;
  if ((asset.type !== 'scenes' && asset.type !== 'encounters') || selectedAssets.length > 1 || !assetService) return [];
  return [{
    type: 'item',
    label: t('atlasLinks.copyLink'),
    icon: 'link',
    onClick: () => runInBackground(copyAssetLink(deps.app, assetService, asset.id), `Copying a link to ${asset.id}`),
  }];
}

/** The menu's group that changes the asset itself: its name or token, size, statblock, and a link to it. */
export function assetEditEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: AssetContextMenuDeps): ContextMenuEntry[] {
  return [
    ...editEntries(asset, selectedAssets, deps),
    ...sizeEntries(asset, selectedAssets, deps),
    ...statblockEntries(asset, selectedAssets, deps),
    ...copyLinkEntries(asset, selectedAssets, deps),
  ];
}
