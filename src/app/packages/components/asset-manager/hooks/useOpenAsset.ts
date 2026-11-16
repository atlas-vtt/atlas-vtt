import { useEffect } from 'react';
import { TFile, type App } from 'obsidian';
import type { AnyAsset, MapAsset, Tab } from '../types';
import { spawnAndClose, spawnTokenAsset, spawnEncounterTokens, type SpawnContext } from '../utils/tokenSpawnService';
import type { AssetService } from '../../../../services/AssetService';
import type { AtlasView } from '../../../../atlas-view';
import { useStableCallback } from '../../../../react/hooks/useStableCallback';
import { scenePrefillFromMap } from '../utils/sceneCreation';
import { diceRandom } from '../../../../services/offlineDiceInputs';
import { runInBackground } from '../../../../utils/backgroundTask';
import { MapScenes, latestSceneOn } from '../utils/mapScenes';

export interface OpenAssetDeps {
  app: App;
  view: AtlasView | null;
  assetService: AssetService | null;
  onClose: () => void;
  /** The collection shown, whose scenes a map's main action opens. */
  collectionId: string;
}

export type OpenAsset = (asset: AnyAsset, spawnCount: number) => Promise<void>;

/**
 * Opens a scene in the current tab; the asset manager fades out while the scene loads behind it. False when the
 * scene or its map file is gone.
 */
export async function openScene(deps: Omit<OpenAssetDeps, 'collectionId'>, assetId: string): Promise<boolean> {
  const serviceAsset = await deps.assetService?.getAssetById(assetId);
  if (serviceAsset?.type !== 'scene' || !serviceAsset.data?.mapPath) return false;
  const file = deps.app.vault.getAbstractFileByPath(serviceAsset.data.mapPath);
  if (!(file instanceof TFile)) return false;
  deps.onClose();
  await deps.app.workspace.getLeaf(false).openFile(file);
  return true;
}

/**
 * A map's main action: opens the scene of the collection last saved on the map, and starts a new scene on it only
 * where it has none, so playing a map twice never makes a second scene of it.
 */
export async function openMap(deps: OpenAssetDeps, map: MapAsset): Promise<void> {
  const scenes = deps.assetService ? await MapScenes.forApp(deps.app).read(deps.assetService, deps.collectionId) : [];
  const latest = latestSceneOn(map.mapFilePath, scenes);
  if (latest && await openScene(deps, latest.id)) return;
  window.dispatchEvent(new CustomEvent('create-scene-from-map', { detail: scenePrefillFromMap(map) }));
}

/**
 * The primary action of an asset (double-click or its spawn button): tokens
 * and encounters go into the GM's hand to be placed on the map, scenes open,
 * maps open their latest scene or start one (`openMap`). On the Maps tab the
 * collection's scenes are read ahead, so a map's menu can offer its scene.
 * The returned function keeps one identity across renders.
 */
export function useOpenAsset(deps: OpenAssetDeps, tab: Tab): OpenAsset {
  const { app, assetService, collectionId } = deps;
  useEffect(() => {
    if (tab === 'maps' && assetService) runInBackground(MapScenes.forApp(app).read(assetService, collectionId), 'Reading the scenes of the maps');
  }, [app, assetService, collectionId, tab]);

  return useStableCallback(async (asset: AnyAsset, spawnCount: number): Promise<void> => {
    const spawnCtx: SpawnContext = {
      app: deps.app, view: deps.view, assetService: deps.assetService, random: diceRandom,
    };
    switch (asset.type) {
      case 'maps':
        await openMap(deps, asset);
        return;
      case 'tokens':
        await spawnAndClose(spawnCtx, deps.onClose, (ctx) => spawnTokenAsset(ctx, asset, Math.max(1, spawnCount)));
        return;
      case 'scenes':
        await openScene(deps, asset.id);
        return;
      case 'encounters':
        await spawnAndClose(spawnCtx, deps.onClose, (ctx) => spawnEncounterTokens(ctx, asset));
    }
  });
}
