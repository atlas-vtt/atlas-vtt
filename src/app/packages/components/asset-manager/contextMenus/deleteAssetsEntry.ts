import type * as React from 'react';
import type { App } from 'obsidian';
import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { AnyAsset } from '../types';
import type { AssetService } from '../../../../services/AssetService';
import { confirmAction } from '../../../../ui/confirmDialog';
import { applyTokenDeleteImpact, findTokenDeleteImpact } from '../utils/tokenDeleteImpact';
import { deleteConfirmation } from '../utils/deleteConfirmation';
import { planLeavingFocus } from '../utils/leavingFocus';
import { formatHotkey } from '../../../../keyboard/mapHotkeys';
import { t } from '../../../../i18n';

export interface DeleteAssetsDeps {
  app: App;
  assetService: AssetService | null;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
  deleteAssetFromVault: (asset: { id: string; name: string }) => Promise<boolean>;
  loadAssetsForActiveTab: () => Promise<void>;
}

/** Deletes `assets` once the GM confirmed it, with what goes with them; the menu's Delete and the Delete key. */
export async function deleteAssets(assets: AnyAsset[], deps: DeleteAssetsDeps): Promise<void> {
  const impact = deps.assetService
    ? await findTokenDeleteImpact(deps.app, deps.assetService, assets)
    : null;
  const focus = planLeavingFocus(assets.map((asset) => asset.id));
  const confirmed = await confirmAction(deleteConfirmation(assets, impact));
  if (!confirmed) {
    focus.restore();
    return;
  }

  if (impact) await applyTokenDeleteImpact(deps.app, impact);
  for (const asset of assets) {
    const ok = await deps.deleteAssetFromVault(asset);
    if (ok) {
      deps.setAssets((prev) => prev.filter((x) => x.id !== asset.id));
      deps.setSelectedAssetIds((prev) => prev.filter((id) => id !== asset.id));
    }
  }
  await deps.loadAssetsForActiveTab();
  focus.afterLeaving();
}

/** The menu's Delete row, which names the key that does the same. */
export function deleteAssetsEntry(assets: AnyAsset[], deps: DeleteAssetsDeps): ContextMenuEntry {
  return {
    type: 'item',
    label: assets.length > 1 ? t('am.menu.deleteItems', { count: assets.length }) : t('common.delete'),
    icon: 'trash',
    detail: formatHotkey('Delete'),
    destructive: true,
    onClick: () => deleteAssets(assets, deps),
  };
}
