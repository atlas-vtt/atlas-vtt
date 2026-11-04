import type { App } from 'obsidian';
import { AssetService, type EncounterAsset, type SceneAsset } from '../services/AssetService';
import { primaryPath } from '../services/vault-sync/assetFiles';
import { SceneSnapshotService, type SceneSnapshotEntry } from '../snapshots/SceneSnapshotService';
import { sceneOfMap, snapshotFolderForMap } from '../snapshots/sceneSnapshotFolders';
import { findByLinkName } from './atlasLinkTargets';

/** The encounter whose JSON is the file at `path`, or null when it is none. */
export async function encounterOfFile(assets: AssetService, path: string): Promise<EncounterAsset | null> {
  const encounters = await assets.getAssets(undefined, 'encounter');
  return encounters.find((asset): asset is EncounterAsset => asset.type === 'encounter' && primaryPath(asset) === path) ?? null;
}

/** The scene record of the map at `mapPath`; null for a map outside every collection. */
export function sceneOfMapFile(app: App, mapPath: string): Promise<SceneAsset | null> {
  return sceneOfMap(AssetService.getInstance(app), mapPath);
}

export interface SceneSnapshots {
  service: SceneSnapshotService;
  /** Newest first. */
  entries: SceneSnapshotEntry[];
}

/** The snapshots of the map at `mapPath`. */
export async function snapshotsOfMap(app: App, mapPath: string): Promise<SceneSnapshots> {
  const service = new SceneSnapshotService(app);
  const folder = await snapshotFolderForMap(AssetService.getInstance(app), mapPath);
  return { service, entries: await service.list(folder) };
}

/** The snapshot a link names (`snapshotNameOfSubpath`), or null when the scene has none of that name. */
export function findSnapshot(entries: readonly SceneSnapshotEntry[], linkName: string): SceneSnapshotEntry | null {
  return findByLinkName(entries, linkName, (entry) => entry.snapshot.name);
}
