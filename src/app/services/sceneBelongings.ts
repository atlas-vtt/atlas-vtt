import type { App } from 'obsidian';
import { trashMapMemories } from '../campaigns/exploredFolders';
import { trashSceneSnapshots } from '../snapshots/sceneSnapshotFolders';
import type { SceneAsset } from './AssetService';

/** Trashes what a deleted scene keeps beside its map file: its snapshots, and what players explored of its map in every campaign. */
export async function trashSceneBelongings(app: App, scene: Pick<SceneAsset, 'id' | 'collection'>, mapPath: string | undefined): Promise<void> {
  await trashSceneSnapshots(app, scene);
  if (mapPath !== undefined) await trashMapMemories(app, mapPath);
}
