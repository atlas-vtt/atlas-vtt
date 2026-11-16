import { normalizePath, type App, type TFile } from 'obsidian';
import { ensureFolder } from '../plugin/vaultFolders';
import { normalizeImagePath } from '../utils/pathUtils';
import type { Asset, AssetService } from './AssetService';
import { newSceneFile } from './newSceneFile';
import { SettingsService } from './SettingsService';

/** What a new scene is made of: its name, the collection it belongs to, the image it starts on and its tags. */
export interface SceneDraft {
  readonly name: string;
  readonly collectionId: string;
  readonly background: string | null;
  readonly tags?: readonly string[];
}

/** A scene's name that another scene of its collection already has. */
export class SceneNameTakenError extends Error {
  constructor(readonly sceneName: string) {
    super(`A scene named "${sceneName}" already exists.`);
  }
}

/** Where a scene of this name lies in its collection. */
export const scenePathFor = (collectionId: string, name: string): string => normalizePath(`atlas-vtt/collections/${collectionId}/scenes/${name.trim()}.atlasmap`);

/** `name`, or the first of "name 2", "name 3"… that no scene of the collection has yet. */
export function freeSceneName(app: App, collectionId: string, name: string): string {
  const base = name.trim();
  let candidate = base;
  for (let count = 2; app.vault.getAbstractFileByPath(scenePathFor(collectionId, candidate)); count += 1) candidate = `${base} ${count}`;
  return candidate;
}

/**
 * Makes an empty scene on a draft's image: its map file and its record, written as one step, so the
 * vault check never finds the new map without a scene and adds a second one. Throws for a collection
 * that no longer exists and a name its collection already has (`SceneNameTakenError`).
 */
export async function createScene(app: App, assetService: AssetService, draft: SceneDraft): Promise<{ file: TFile; asset: Asset }> {
  const collection = await assetService.getCollection(draft.collectionId);
  if (!collection) throw new Error(`Collection "${draft.collectionId}" no longer exists. Select another collection and try again.`);
  const name = draft.name.trim();
  const mapData = newSceneFile(
    assetService.getCollectionSettings(collection.id),
    draft.background ? normalizeImagePath(draft.background) : null,
    SettingsService.forApp(app)?.detectsGridOnNewScenes() ?? true,
  );
  const scenePath = scenePathFor(collection.id, name);
  if (app.vault.getAbstractFileByPath(scenePath)) throw new SceneNameTakenError(name);
  return assetService.runExclusive(async () => {
    await ensureFolder(app, scenePath.substring(0, scenePath.lastIndexOf('/')));
    const file = await app.vault.create(scenePath, JSON.stringify(mapData, null, 2));
    const asset = await assetService.addAsset({ type: 'scene', name, collection: collection.id, tags: [...(draft.tags ?? [])], data: { mapPath: scenePath } });
    return { file, asset };
  });
}

/** A map a scene is made on: the name the scene takes and the image it starts on. */
export interface SceneMap {
  readonly name: string;
  readonly mapFilePath: string;
}

/**
 * Makes one scene on each map, named like its map ("Cave 2" where the collection has a "Cave"),
 * one after the other, so no two take the same name. Returns the scenes made.
 */
export async function createScenesFromMaps(app: App, assetService: AssetService, collectionId: string, maps: readonly SceneMap[]): Promise<Asset[]> {
  const scenes: Asset[] = [];
  for (const map of maps) {
    const name = freeSceneName(app, collectionId, map.name);
    const { asset } = await createScene(app, assetService, { name, collectionId, background: map.mapFilePath });
    scenes.push(asset);
  }
  return scenes;
}
