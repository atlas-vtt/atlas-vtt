import { normalizePath, TFile, type App } from 'obsidian';
import type { AssetService } from '../app/services/AssetService';
import { collectionFolderPath } from '../app/services/assetPaths';
import { trashVaultItem } from '../app/utils/trashVaultItem';
import { savedMapText } from './savedMap';
import { checkMapGrid } from './savedMapGrid';
import { inputCopy, isImageData, isPlainRelative } from './savedMapFields';
import { isInside, sceneFieldsOf, withImagePaths } from './sceneImport';
import type { SavedMapInput } from './types/scenes';
import type { ViewTracker } from './viewTracker';

/** What `ScenesApi.replaceMap` takes beside the scene id. */
interface ReplaceInput { map: SavedMapInput; images: ReadonlyArray<{ path: string; data: ArrayBuffer }> }

function fail(message: string): never {
  throw new Error(`[Atlas API] scenes.replaceMap: ${message}`);
}

/** Whether any open map view has `mapPath` loaded or among its scene tabs. */
function isOpenInAView(views: ViewTracker | null, mapPath: string): boolean {
  return (views?.views() ?? []).some((view) => view.atlasStore.getState().mapPath === mapPath
    || view.tabMetaStore.getState().tabs.some((tab) => tab.filePath === mapPath));
}

/** `path`, or `stem (2).ext`, `stem (3).ext`, … while a file is there or this call already chose the name. */
function freeFilePath(app: App, path: string, chosen: ReadonlySet<string>): string {
  const dot = path.lastIndexOf('.');
  const [stem, ext] = dot > path.lastIndexOf('/') ? [path.slice(0, dot), path.slice(dot)] : [path, ''];
  let candidate = path;
  for (let n = 2; chosen.has(candidate.toLowerCase()) || app.vault.getAbstractFileByPath(candidate); n++) candidate = `${stem} (${n})${ext}`;
  return candidate;
}

/**
 * Whether anything besides the scene `sceneId` uses a path: another asset record, another scene's map, or a note
 * linking it. The records and maps are read once, when the first path is asked about, however many paths follow.
 */
function usedElsewhere(app: App, assets: AssetService, sceneId: string): (path: string) => Promise<boolean> {
  let texts: Promise<string[]> | null = null;
  const read = async (): Promise<string[]> => {
    const others = (await assets.getAssets()).filter((asset) => asset.id !== sceneId);
    const found = others.map((asset) => JSON.stringify(asset));
    for (const asset of others) {
      const otherMap = asset.type === 'scene' ? asset.data?.mapPath : undefined;
      const file = otherMap ? app.vault.getAbstractFileByPath(otherMap) : null;
      if (file instanceof TFile) found.push(await app.vault.read(file));
    }
    return found;
  };
  return async (path) => {
    texts ??= read();
    const quoted = JSON.stringify(path);
    if ((await texts).some((text) => text.includes(quoted))) return true;
    const links = (app.metadataCache as { resolvedLinks?: Record<string, Record<string, number>> } | undefined)?.resolvedLinks ?? {};
    return Object.values(links).some((targets) => Object.hasOwn(targets, path));
  };
}

/**
 * Trashes the images Atlas wrote for the scene (`created`) that the new map does not name and nothing else uses; a
 * failure is logged and the image kept. Returns those that stay. No other file is ever removed.
 */
async function removeOldImages(app: App, assets: AssetService, sceneId: string, created: readonly string[], newText: string): Promise<string[]> {
  const kept: string[] = [];
  const isUsedElsewhere = usedElsewhere(app, assets, sceneId);
  for (const path of created) {
    const file = app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) continue;
    try {
      if (newText.includes(JSON.stringify(path)) || await isUsedElsewhere(path)) kept.push(path);
      else await trashVaultItem(app, file);
    } catch (error) {
      console.error('[Atlas API] replaceMap could not remove an old image:', path, error);
      kept.push(path);
    }
  }
  return kept;
}

/** The GM's own play on the scene, kept across a replace: the note link, dice log, pinned previews and loot roller. Explored memory is not: it belongs to the old map. */
const LOCAL_PLAY_FIELDS = ['dmNotePath', 'diceLog', 'pinnedNotePreviews', 'lootRoller'] as const;

/** `newText` with the GM's local play fields of `oldText` copied in. */
function withLocalPlay(newText: string, oldText: string): string {
  let old: { state?: Record<string, unknown> };
  try {
    old = JSON.parse(oldText) as { state?: Record<string, unknown> };
  } catch {
    return newText;
  }
  const kept = Object.fromEntries(LOCAL_PLAY_FIELDS.flatMap((field) => (old.state?.[field] !== undefined ? [[field, old.state[field]]] : [])));
  if (Object.keys(kept).length === 0) return newText;
  const next = JSON.parse(newText) as { state: Record<string, unknown> };
  next.state = { ...next.state, ...kept };
  return JSON.stringify(next, null, 2);
}

/**
 * Replaces the map of the scene `sceneId`, which extension `owner` added with `addToCollection`, under the asset index
 * lock: the new images go beside the map file (a name already taken gets a number), then the map file is rewritten
 * (keeping the GM's note link, dice log, pinned previews and loot roller; explored memory resets), then the images
 * Atlas wrote for the scene earlier that nothing uses any more are removed. The index notes which images it wrote. The scene keeps its id, name, collection and map path. Refused
 * (throws, writing nothing) for another scene, one open in a map view, or malformed input; a failed write removes the
 * images this call wrote and puts the old map back.
 */
export function replaceSceneMap(
  app: App, assets: AssetService, views: ViewTracker | null, owner: string, sceneId: string, given: ReplaceInput,
): Promise<{ sceneId: string; mapPath: string }> {
  return assets.runExclusive(async () => {
    const input = inputCopy(given, 'scenes.replaceMap');
    const scene = typeof sceneId === 'string' ? await assets.getAssetById(sceneId) : null;
    if (scene?.type !== 'scene') fail(`there is no scene with the id "${String(sceneId)}".`);
    if (scene.data?.createdBy !== owner) fail('only a scene this extension added with addToCollection can be replaced.');
    const mapPath = scene.data.mapPath;
    const file = mapPath ? app.vault.getAbstractFileByPath(mapPath) : null;
    if (!mapPath || !(file instanceof TFile)) fail('the scene has no map file.');
    // Only a map inside the scene's own collection folder: a record that points elsewhere never makes replaceMap write there.
    if (!isInside(mapPath, collectionFolderPath(scene.collection))) fail("the scene's map file is not inside its collection's folder.");
    if (isOpenInAView(views, mapPath)) fail('the scene is open in a map view; close its tab first.');
    if (!input || !input.map || !Array.isArray(input.images)) fail('it needs { map, images }.');
    const fields = sceneFieldsOf(input.map);
    await checkMapGrid(app, input.map, input.images, fail);
    const folder = mapPath.slice(0, mapPath.lastIndexOf('/'));
    const chosen = new Set<string>();
    const targets = new Map<string, { target: string; data: ArrayBuffer }>();
    for (const image of input.images as ReplaceInput['images']) {
      const path: unknown = image?.path;
      if (!isPlainRelative(path) || !isInside(`${folder}/${path}`, folder) || targets.has(path)) fail(`the image path "${String(path)}" must stay inside the folder, once.`);
      if (!isImageData(image.data)) fail(`the image "${path}" needs its data as an ArrayBuffer.`);
      const target = freeFilePath(app, normalizePath(`${folder}/${path}`), chosen);
      chosen.add(target.toLowerCase());
      targets.set(path, { target, data: image.data });
    }
    const oldText = await app.vault.read(file);
    const imagePaths = new Map([...targets].map(([path, { target }]) => [path, target]));
    const newText = withLocalPlay(savedMapText(withImagePaths(input.map, imagePaths), mapPath, scene.name, fields), oldText);
    const written: string[] = [];
    try {
      for (const { target, data } of targets.values()) {
        await app.vault.createBinary(target, data);
        // Listed once written: a failed write must not let the undo trash a file another wrote at that path meanwhile.
        written.push(target);
      }
      // Again just before writing: a tab opened meanwhile would save the old map over the new one.
      if (isOpenInAView(views, mapPath)) fail('the scene is open in a map view; close its tab first.');
      await app.vault.process(file, () => newText);
    } catch (error) {
      try {
        if ((await app.vault.read(file)) !== oldText) await app.vault.process(file, () => oldText);
        for (const path of written.reverse()) {
          const image = app.vault.getAbstractFileByPath(path);
          if (image) await trashVaultItem(app, image);
        }
      } catch (cleanup) {
        console.error('[Atlas API] Could not undo a failed replaceMap:', cleanup);
      }
      throw error;
    }
    const kept = await removeOldImages(app, assets, sceneId, scene.data.createdImages ?? [], newText);
    try {
      // Only the image list is ours to change; the method patches it onto the record as the index holds it now
      // (a rename, a move or setData may have landed during the awaits).
      await assets.updateSceneIndexData(sceneId, { createdImages: [...new Set([...kept, ...written])] });
    } catch (error) {
      console.error('[Atlas API] replaceMap could not note the images it wrote:', error);
    }
    return { sceneId, mapPath };
  });
}
