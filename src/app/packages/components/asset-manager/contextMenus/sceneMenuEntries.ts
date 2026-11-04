import type { App } from 'obsidian';
import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { AnyAsset, MapAsset } from '../types';
import type { AssetService } from '../../../../services/AssetService';
import { createScenesFromMaps } from '../../../../services/createScene';
import type { CreateScenePrefill } from '../hooks/useAssetCrud';
import { scenePrefillFromMap } from '../utils/sceneCreation';
import { showNotice } from '../../../../ui/notice';
import { t } from '../../../../i18n';

export interface SceneMenuDeps {
  app: App;
  assetService: AssetService | null;
  /** The collection shown, which the new scenes belong to. */
  collectionId: string;
  openCreateScene: (prefill: CreateScenePrefill) => void;
  loadAssetsForActiveTab: () => Promise<void>;
}

/**
 * The map menu's way to a scene: one map opens the New scene dialog on it; several selected maps
 * each become a scene of their own, named like their map.
 */
export function sceneMenuEntries(asset: AnyAsset, selectedAssets: AnyAsset[], deps: SceneMenuDeps): ContextMenuEntry[] {
  if (asset.type !== 'maps') return [];
  const maps = selectedAssets.filter((selected): selected is MapAsset => selected.type === 'maps');
  if (maps.length <= 1) {
    return [{ type: 'item', label: t('am.menu.createScene'), icon: 'clapperboard', onClick: () => deps.openCreateScene(scenePrefillFromMap(asset)) }];
  }
  return [{
    type: 'item',
    label: t('am.menu.createScenes', { count: maps.length }),
    icon: 'clapperboard',
    onClick: () => createScenes(deps, maps),
  }];
}

async function createScenes(deps: SceneMenuDeps, maps: readonly MapAsset[]): Promise<void> {
  const { assetService } = deps;
  if (!assetService) return;
  try {
    const scenes = await createScenesFromMaps(deps.app, assetService, deps.collectionId, maps);
    showNotice(t('am.scene.createdMany', { count: scenes.length }));
  } catch (error) {
    console.error('[sceneMenuEntries] Error creating scenes:', error);
    showNotice(t('am.scene.createFailed', { error: error instanceof Error ? error.message : String(error) }));
  } finally {
    await deps.loadAssetsForActiveTab();
  }
}
