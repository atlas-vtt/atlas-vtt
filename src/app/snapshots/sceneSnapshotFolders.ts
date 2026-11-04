import { TFile, TFolder, type App } from 'obsidian';
import type { AssetService, SceneAsset } from '../services/AssetService';
import { trashVaultItem } from '../utils/trashVaultItem';
import { SceneSnapshotService } from './SceneSnapshotService';
import { snapshotStorageFor } from './snapshotStorage';
import { collectionSnapshotsFolder, isSnapshotJsonPath, legacySnapshotFolderFor, parentFolderOf, sceneSnapshotFolder } from './snapshotPaths';
import { removeEmptyHiddenFolders } from '../utils/hiddenVaultFiles';
import { COLLECTIONS_DIR } from '../services/assetPaths';
import { ensureAdapterFolder, ensureFolder } from '../plugin/vaultFolders';

type SceneKey = Pick<SceneAsset, 'id' | 'collection'>;

/** The folder holding the snapshots of `scene`. */
export const snapshotFolderOf = (scene: SceneKey): string => sceneSnapshotFolder(scene.collection, scene.id);

/** The scene record whose map is the file at `mapPath`, or null when the map belongs to no scene. */
export async function sceneOfMap(assets: AssetService, mapPath: string): Promise<SceneAsset | null> {
  return (await assets.getAssets(undefined, 'scene')).find((scene) => scene.data?.mapPath === mapPath) ?? null;
}

/**
 * The snapshot folder of the map at `mapPath`: its scene's folder in its
 * collection, keyed by the scene's id. A map that belongs to no scene (an
 * `.atlasmap` placed outside every collection) keeps its snapshots where every
 * map kept them before, in the hidden folder beside it, on this device only.
 */
export async function snapshotFolderForMap(assets: AssetService, mapPath: string): Promise<string> {
  const scene = await sceneOfMap(assets, mapPath);
  return scene ? snapshotFolderOf(scene) : legacySnapshotFolderFor(mapPath);
}

/** A map that belongs to no scene keeps its snapshots beside it; they follow it when it is renamed or moved. */
export async function followLegacySnapshots(app: App, from: string, to: string): Promise<void> {
  const { adapter } = app.vault;
  const [source, target] = [legacySnapshotFolderFor(from), legacySnapshotFolderFor(to)];
  if (source === target || !(await adapter.exists(source)) || await adapter.exists(target)) return;
  await ensureAdapterFolder(app, parentFolderOf(target));
  await adapter.rename(source, target);
  await removeEmptyHiddenFolders(app, parentFolderOf(source), parentFolderOf(parentFolderOf(source)));
}

/** Moves a deleted scene's snapshots to the trash. */
export async function trashSceneSnapshots(app: App, scene: SceneKey): Promise<void> {
  const folder = app.vault.getFolderByPath(snapshotFolderOf(scene));
  if (folder) await trashVaultItem(app, folder);
}

/**
 * Moves the snapshots of scenes whose collection changed outside Atlas (a map
 * dragged into another collection's folder) to their collection's folder, so
 * they stay with the scene. A scene whose folder is in place is left alone.
 */
export async function followSceneSnapshots(app: App, scenes: readonly SceneKey[]): Promise<void> {
  const collections = (app.vault.getFolderByPath(COLLECTIONS_DIR)?.children ?? []).filter((child) => child instanceof TFolder);
  for (const scene of scenes) {
    const target = snapshotFolderOf(scene);
    if (app.vault.getFolderByPath(target)) continue;
    const found = collections
      .map((collection) => app.vault.getFolderByPath(sceneSnapshotFolder(collection.name, scene.id)))
      .find((folder): folder is TFolder => folder !== null);
    if (!found) continue;
    await ensureFolder(app, parentFolderOf(target));
    await app.fileManager.renameFile(found, target);
  }
}

/** Moves a scene's snapshot folder to the trash once nothing is left in it. */
export async function trashEmptySnapshotFolder(app: App, folderPath: string): Promise<void> {
  const folder = app.vault.getFolderByPath(folderPath);
  if (folder && folder.children.length === 0) await trashVaultItem(app, folder);
}

/** The snapshot files of every scene of a collection. */
export function collectionSnapshotFiles(app: App, collectionId: string): string[] {
  const scenes = app.vault.getFolderByPath(collectionSnapshotsFolder(collectionId))?.children ?? [];
  return scenes
    .filter((child): child is TFolder => child instanceof TFolder)
    .flatMap((scene) => app.vault.getFolderByPath(scene.path)?.children ?? [])
    .filter((child) => child instanceof TFile && isSnapshotJsonPath(child.path))
    .map((file) => file.path);
}

/** The snapshot files of every scene in the vault. */
export function allSnapshotFiles(app: App): string[] {
  return app.vault.getFiles().map((file) => file.path).filter(isSnapshotJsonPath);
}

/** The snapshot files in the hidden folders beside `mapPaths`: maps outside every collection, and folders still waiting for their migration. */
export async function hiddenSnapshotFiles(app: App, mapPaths: readonly string[]): Promise<string[]> {
  const listed = await Promise.all(mapPaths.map((mapPath) => {
    const folder = legacySnapshotFolderFor(mapPath);
    return snapshotStorageFor(app, folder).list(folder);
  }));
  return listed.flat().filter((path) => path.endsWith('.json'));
}

/** Runs `rewrite` over the snapshots of every scene of a collection (`SceneSnapshotService.rewriteFiles`). */
export function rewriteCollectionSnapshots(app: App, collectionId: string, rewrite: (content: string) => string | null): Promise<boolean> {
  return new SceneSnapshotService(app).rewriteFiles(collectionSnapshotFiles(app, collectionId), rewrite);
}
