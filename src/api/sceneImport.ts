import { normalizePath, type App, type TAbstractFile } from 'obsidian';
import { ensureFolder } from '../app/plugin/vaultFolders';
import type { AssetService, CollectionMetadata } from '../app/services/AssetService';
import { collectionFolderName, collectionFolderPath, collectionNameProblemKey } from '../app/services/assetPaths';
import { mapStrings } from '../app/utils/mapStrings';
import { en } from '../app/i18n/locales/en';
import { trashVaultItem } from '../app/utils/trashVaultItem';
import { savedMapText } from './savedMap';
import { checkMapGrid } from './savedMapGrid';
import { checkedSceneFields, inputCopy, isImageData, isPlainRelative, setsSceneFields, type SceneFields } from './savedMapFields';
import type { SavedMapInput, ScenesApi } from './types/scenes';

type AddInput = Parameters<ScenesApi['addToCollection']>[0];

export const isInside = (path: string, folder: string): boolean => normalizePath(path).startsWith(`${normalizePath(folder)}/`);

/** The optional fields of `map`, checked (throws before anything is written); null when it sets none, so the file is as before. */
export function sceneFieldsOf(map: SavedMapInput): SceneFields | null {
  return setsSceneFields(map) ? checkedSceneFields(map) : null;
}

/**
 * `map`'s scene with every string naming an uploaded image (by its path relative to the folder) turned into its vault
 * path. Only the scene's own parts are rewritten: a pin's `notePath` and the other optional fields are vault data.
 */
export function withImagePaths(map: SavedMapInput, imagePaths: ReadonlyMap<string, string>): SavedMapInput {
  const rewrite = (text: string): string => imagePaths.get(text) ?? text;
  const { background, grid, objects, widgets, initiative, lighting } = map;
  const scene = mapStrings({ background, grid, objects, widgets, initiative }, rewrite);
  return { ...scene, ...(lighting ? { lighting: mapStrings(lighting, rewrite) } : {}) };
}

/** The collection `ref` names; a name no collection has creates it. */
async function resolveCollection(assets: AssetService, ref: AddInput['collection']): Promise<{ id: string; created: boolean }> {
  const known = await assets.getCollections();
  if ('id' in ref) {
    if (!known.some((collection) => collection.id === ref.id)) throw new Error(`[Atlas API] scenes.addToCollection: there is no collection with the id "${String(ref.id)}".`);
    return { id: ref.id, created: false };
  }
  // In English whatever Atlas's language: the error is for the extension's author.
  const problem = typeof ref.name === 'string' ? collectionNameProblemKey(ref.name) : 'names.enter';
  if (problem) throw new Error(`[Atlas API] scenes.addToCollection: the collection name cannot be used: ${String(en[problem])}`);
  const key = ref.name.trim().toLowerCase();
  const match = known.find((collection: CollectionMetadata) => collection.id.toLowerCase() === key || collection.name.toLowerCase() === key);
  if (match) return { id: match.id, created: false };
  return { id: (await assets.createCollection(ref.name.trim())).id, created: true };
}

/** `folder/stem.atlasmap`, or `stem (2)`, `stem (3)`, … while a file, a record of the index or a name differing only by case is there. */
function freeMapPath(app: App, folder: string, name: string, indexed: ReadonlySet<string>): string {
  const taken = new Set((app.vault.getFolderByPath(folder)?.children ?? []).map((child) => child.name.toLowerCase()));
  for (const path of indexed) if (path.toLowerCase().startsWith(`${folder.toLowerCase()}/`)) taken.add(path.slice(folder.length + 1).toLowerCase());
  const stem = collectionFolderName(name);
  let file = `${stem}.atlasmap`;
  for (let n = 2; taken.has(file.toLowerCase()); n++) file = `${stem} (${n}).atlasmap`;
  return `${folder}/${file}`;
}

/** The first folder of `folder`'s path that does not exist yet; null when all of it does. */
function firstMissingFolder(app: App, folder: string): string | null {
  const parts = folder.split('/');
  for (let length = 1; length <= parts.length; length++) {
    const path = parts.slice(0, length).join('/');
    if (!app.vault.getAbstractFileByPath(path)) return path;
  }
  return null;
}

/** Removes what a failed call wrote, last first; a failing cleanup is logged and never hides the error that made it necessary. */
async function undo(app: App, assets: AssetService, created: { files: readonly string[]; folder: string | null; collection: string | null; mapPath: string; knownScenes: ReadonlySet<string> }): Promise<void> {
  const { files: written, folder, collection, mapPath, knownScenes } = created;
  const attempt = async (step: () => Promise<void>): Promise<void> => {
    try {
      await step();
    } catch (error) {
      console.error('[Atlas API] Could not remove what a failed addToCollection wrote:', error);
    }
  };
  // Only a record this call added: one that was in the index before, even at this path, is not ours to delete.
  if (mapPath) {
    await attempt(async () => {
      const added = (await assets.getAssets(undefined, 'scene')).filter((asset) => !knownScenes.has(asset.id) && asset.data?.mapPath === mapPath);
      for (const scene of added) await assets.deleteAsset(scene.id);
    });
  }
  for (const path of [...written].reverse()) {
    await attempt(async () => {
      const file: TAbstractFile | null = app.vault.getAbstractFileByPath(path);
      if (file) await trashVaultItem(app, file);
    });
  }
  if (folder) {
    await attempt(async () => {
      const dir = app.vault.getAbstractFileByPath(folder);
      if (dir) await trashVaultItem(app, dir);
    });
  }
  if (collection) await attempt(() => assets.deleteCollection(collection));
}

/**
 * Adds a scene with its images under the asset index lock, so the vault check never adopts the map as a second
 * scene and two calls never pick the same file name. The index notes `owner`, the extension, as the scene's creator
 * (`replaceMap`). Everything is checked before the first write; a failure afterwards removes what this call wrote
 * (including a folder or collection it created) and rethrows.
 */
export function addSceneToCollection(app: App, assets: AssetService, given: AddInput, owner: string): Promise<{ sceneId: string; mapPath: string }> {
  return assets.runExclusive(async () => {
    const input = inputCopy(given, 'scenes.addToCollection');
    if (!input || typeof input.name !== 'string' || !input.name.trim() || !input.map || !Array.isArray(input.images)) {
      throw new Error('[Atlas API] scenes.addToCollection: the input must be { collection, name, folder, map, images }.');
    }
    const collection = await resolveCollection(assets, input.collection);
    const written: string[] = [];
    const scenes = await assets.getAssets(undefined, 'scene');
    const knownScenes = new Set(scenes.map((scene) => scene.id));
    let createdFolder: string | null = null;
    let mapPath = '';
    try {
      const folder = typeof input.folder === 'string' ? normalizePath(input.folder) : '';
      if (!isPlainRelative(folder) || !isInside(`${folder}/x`, collectionFolderPath(collection.id))) {
        throw new Error(`[Atlas API] scenes.addToCollection: the folder must lie inside the collection's folder, ${collectionFolderPath(collection.id)}.`);
      }
      const fields = sceneFieldsOf(input.map);
      await checkMapGrid(app, input.map, input.images, (message) => { throw new Error(`[Atlas API] scenes.addToCollection: ${message}`); });
      const targets = new Map<string, ArrayBuffer>();
      for (const image of input.images as AddInput['images']) {
        const path: unknown = image?.path;
        if (!isPlainRelative(path) || !isInside(`${folder}/${path}`, folder)) throw new Error(`[Atlas API] scenes.addToCollection: the image path "${String(path)}" must stay inside the folder.`);
        if (!isImageData(image.data)) throw new Error(`[Atlas API] scenes.addToCollection: the image "${path}" needs its data as an ArrayBuffer.`);
        const target = `${folder}/${path}`;
        if (targets.has(target) || app.vault.getAbstractFileByPath(target)) throw new Error(`[Atlas API] scenes.addToCollection: there is already a file at ${target}.`);
        targets.set(target, image.data);
      }
      createdFolder = firstMissingFolder(app, folder);
      await ensureFolder(app, folder);
      for (const [target, data] of targets) {
        await app.vault.createBinary(target, data);
        // Listed once written: a failed write must not let the undo trash a file another wrote at that path meanwhile.
        written.push(target);
      }
      mapPath = freeMapPath(app, folder, input.name, new Set(scenes.flatMap((scene) => (scene.data?.mapPath ? [scene.data.mapPath] : []))));
      const imagePaths = new Map([...targets.keys()].map((target) => [target.slice(folder.length + 1), target]));
      await app.vault.create(mapPath, savedMapText(withImagePaths(input.map, imagePaths), mapPath, input.name.trim(), fields));
      written.push(mapPath);
      const scene = await assets.addAsset({ type: 'scene', name: input.name.trim(), collection: collection.id, tags: [], data: { mapPath, createdBy: owner, createdImages: [...targets.keys()] } });
      return { sceneId: scene.id, mapPath };
    } catch (error) {
      await undo(app, assets, { files: written, folder: createdFolder, collection: collection.created ? collection.id : null, mapPath, knownScenes });
      throw error;
    }
  });
}
