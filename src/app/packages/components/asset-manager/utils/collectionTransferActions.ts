import type * as React from 'react';
import type { App as ObsidianApp } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { transferAssets } from '../../../../services/assetTransfer/assetTransfer';
import { linkedScenesFor } from '../../../../services/assetTransfer/linkedScenes';
import type { TransferMode } from '../../../../services/assetTransfer/transferPlan';
import { showAtlasToast } from '../../../../react/components/AtlasToast';
import { chooseAction } from '../../../../ui/confirmDialog';
import type { AnyAsset, CollectionOption } from '../types';
import { t } from '../../../../i18n';

export interface CollectionTransferContext {
  app: ObsidianApp;
  assetService: AssetService | null;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
}

/** Toasts with more than a confirmation to read stay longer. */
const LONG_TOAST_DURATION = 6000;

/** The collections assets shown for `currentCollectionId` can go to, by name. */
export function transferTargets(collections: readonly CollectionOption[], currentCollectionId: string): CollectionOption[] {
  return collections
    .filter((collection) => collection.id !== currentCollectionId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/**
 * The ids to transfer: `assets`, plus the scenes they are linked with if the
 * user takes those along (declining removes the links, since links never cross
 * collections); null when cancelled.
 */
async function idsToTransfer(app: ObsidianApp, assetService: AssetService, assets: readonly AnyAsset[], target: CollectionOption, mode: TransferMode): Promise<string[] | null> {
  const ids = assets.map((asset) => asset.id);
  const linked = await linkedScenesFor(app, assetService, ids, target.id, mode);
  if (linked.length === 0) return ids;

  const subject = assets.length === 1 ? t('common.quoted', { name: assets[0]!.name }) : t('transfer.selection');
  const names = linked.map((scene) => t('common.quoted', { name: scene.name })).join(', ');
  const choice = await chooseAction({
    title: t('transfer.linked.title'),
    message: [
      t(`transfer.linked.${mode}`, { subject, count: linked.length, names }),
      t('transfer.linked.rule', { target: target.name }),
    ],
    choices: [
      { label: t(`transfer.${mode}.withoutLinks`), value: 'unlink' as const },
      { label: t(`transfer.${mode}.withScenes`, { count: linked.length }), value: 'along' as const, style: 'cta' },
    ],
  });
  if (choice === null) return null;
  return choice === 'along' ? [...ids, ...linked.map((scene) => scene.id)] : ids;
}

/**
 * Moves or copies `assets` into `target` and reports the outcome. Scenes they
 * are linked with are offered along. Moved assets leave the grid at once; the
 * refresh that follows the transfer shows the rest.
 */
export async function transferToCollection(
  context: CollectionTransferContext,
  assets: readonly AnyAsset[],
  target: CollectionOption,
  mode: TransferMode,
): Promise<void> {
  const { assetService } = context;
  if (!assetService || assets.length === 0) return;
  const chosen = assets.length === 1 ? t('common.quoted', { name: assets[0]!.name }) : t('count.items', { count: assets.length });
  let what = chosen;
  try {
    const assetIds = await idsToTransfer(context.app, assetService, assets, target, mode);
    if (!assetIds) return;
    const along = assetIds.length - assets.length;
    if (along > 0) what = t('transfer.andScenes', { what: chosen, count: along });
    const result = await transferAssets(context.app, assetService, { assetIds, targetCollectionId: target.id, mode });
    if (mode === 'move') {
      const moved = new Set(result.assets.map((record) => record.id));
      context.setAssets((prev) => prev.filter((asset) => !moved.has(asset.id)));
      context.setSelectedAssetIds((prev) => prev.filter((id) => !moved.has(id)));
    }
    showAtlasToast(t(mode === 'move' ? 'transfer.moved' : 'transfer.copied', { what, target: target.name }));
  } catch (error) {
    console.error(`[Atlas] Could not ${mode} assets to ${target.id}:`, error);
    showAtlasToast(t(`transfer.${mode}Failed`, { what, error: error instanceof Error ? error.message : String(error) }), LONG_TOAST_DURATION);
  }
}
