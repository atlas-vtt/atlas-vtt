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
import { MOVE_PROBLEM_TOAST_MS, showMove, type ShownMove } from './optimisticMove';
import { MOVED_TOAST_MS, movedWhat } from './moveNotice';
import { planLeavingFocus } from './leavingFocus';

export interface CollectionTransferContext {
  app: ObsidianApp;
  assetService: AssetService | null;
  setAssets: React.Dispatch<React.SetStateAction<AnyAsset[]>>;
  setSelectedAssetIds: React.Dispatch<React.SetStateAction<string[]>>;
  /** Shows a collection with the assets `assetIds` in it selected: what the notice of the transfer offers. */
  openCollection?: (collectionId: string, assetIds: readonly string[]) => void;
}

/** Collections by name, as the picker lists them ("Book 2" before "Book 10"). */
export function collectionsByName(collections: readonly CollectionOption[]): CollectionOption[] {
  return [...collections].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}

/** The collections assets shown for `currentCollectionId` can go to, by name. */
export function transferTargets(collections: readonly CollectionOption[], currentCollectionId: string): CollectionOption[] {
  return collectionsByName(collections.filter((collection) => collection.id !== currentCollectionId));
}

/** A Move or Copy to collection… the GM is choosing the collection of (decision #41): what goes, and how it goes there. */
export interface CollectionPick {
  mode: TransferMode;
  assets: readonly AnyAsset[];
  /** Moves or copies the assets into the chosen collection (`transferToCollection`). */
  transfer: (target: CollectionOption) => void;
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
 * are linked with are offered along. Moved assets leave the grid as soon as the
 * GM has chosen (#30), and come back with the reason if the move fails; the
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
  const chosen = movedWhat(assets);
  // Read while the cards are still there: the menu that asked gave focus back to one of them.
  const focus = planLeavingFocus(assets.map((asset) => asset.id));
  let what = chosen;
  let shown: ShownMove | null = null;
  let assetIds: string[] | null = null;
  try {
    assetIds = await idsToTransfer(context.app, assetService, assets, target, mode);
    if (!assetIds) return;
    const along = assetIds.length - assets.length;
    if (along > 0) what = t('transfer.andScenes', { what: chosen, count: along });
    if (mode === 'move') {
      shown = showMove(context.setAssets, assetIds, () => null);
      const leaving = new Set(assetIds);
      context.setSelectedAssetIds((prev) => prev.filter((id) => !leaving.has(id)));
      focus.afterLeaving();
    }
    const result = await transferAssets(context.app, assetService, { assetIds, targetCollectionId: target.id, mode });
    const moved = new Set(result.assets.map((record) => record.id));
    shown?.restore(assetIds.filter((id) => !moved.has(id)));
    const message = t(mode === 'move' ? 'transfer.moved' : 'transfer.copied', { what, target: target.name });
    const { openCollection } = context;
    const arrived = result.assets.map((record) => record.id);
    if (openCollection) showAtlasToast(message, MOVED_TOAST_MS, { label: t('transfer.openCollection'), run: () => openCollection(target.id, arrived) });
    else showAtlasToast(message);
  } catch (error) {
    console.error(`[Atlas] Could not ${mode} assets to ${target.id}:`, error);
    if (assetIds) shown?.restore(assetIds);
    showAtlasToast(t(`transfer.${mode}Failed`, { what, error: error instanceof Error ? error.message : String(error) }), MOVE_PROBLEM_TOAST_MS);
  }
}
