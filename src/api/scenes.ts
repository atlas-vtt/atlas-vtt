import type { App } from 'obsidian';
import { AssetService, type SceneAsset } from '../app/services/AssetService';
import type { ExtensionScope } from './extension';
import { frozenCopy } from './frozen';
import { readSavedMap } from './savedMap';
import { addSceneToCollection } from './sceneImport';
import type { Json } from './types/common';
import { plainJson } from './plainJson';
import { replaceSceneMap } from './sceneReplace';
import type { SceneRecord, ScenesApi } from './types/scenes';
import type { ViewTracker } from './viewTracker';

/** The asset index, once it has loaded; the API is published even when it failed, and then scene functions reject. */
export async function loadedAssets(app: App): Promise<AssetService> {
  const assets = AssetService.getInstance(app);
  try {
    await assets.initialize();
  } catch (error) {
    throw new Error(`[Atlas API] The asset index is not available: ${error instanceof Error ? error.message : String(error)}`);
  }
  return assets;
}

function recordOf(scene: SceneAsset): SceneRecord {
  return { id: scene.id, name: scene.name, collectionId: scene.collection, mapPath: scene.data?.mapPath ?? null };
}

/** `views` tells `replaceMap` which maps are open; none without it. */
export function scenesApi(app: App, scope: Pick<ExtensionScope, 'id'>, views: ViewTracker | null = null): ScenesApi {
  const scenes = async (): Promise<SceneAsset[]> => (await loadedAssets(app)).getAssets(undefined, 'scene');
  return Object.freeze({
    list: async (): Promise<SceneRecord[]> => (await scenes()).map((scene) => frozenCopy(recordOf(scene))),
    findByMap: async (mapPath: string): Promise<SceneRecord | null> => {
      const scene = (await scenes()).find((candidate) => candidate.data?.mapPath === mapPath);
      return scene ? frozenCopy(recordOf(scene)) : null;
    },
    getData: async (sceneId: string): Promise<Json | undefined> => {
      const scene = await (await loadedAssets(app)).getAssetById(sceneId);
      const extensions = scene?.type === 'scene' ? scene.data?.extensions : undefined;
      return extensions && Object.hasOwn(extensions, scope.id) ? frozenCopy(extensions[scope.id]) : undefined;
    },
    setData: async (sceneId: string, value: Json | null): Promise<void> => {
      const assets = await loadedAssets(app);
      const copy = value === null ? null : plainJson('scenes.setData', value);
      // Re-read right before writing and patch only this extension's key: never anyone else's data, never the scene's own.
      await assets.runExclusive(async () => {
        const scene = await assets.getAssetById(sceneId);
        if (scene?.type !== 'scene') throw new Error(`[Atlas API] scenes.setData: there is no scene with the id "${String(sceneId)}".`);
        const current = scene.data?.extensions;
        const next = Object.fromEntries(Object.entries(current ?? {}).filter(([key]) => key !== scope.id));
        if (copy !== null) Object.defineProperty(next, scope.id, { value: copy, enumerable: true, writable: true, configurable: true });
        await assets.updateSceneIndexData(sceneId, { extensions: Object.keys(next).length > 0 ? next : undefined });
      });
    },
    readMap: async (mapPath: string) => {
      await loadedAssets(app);
      return readSavedMap(app, mapPath);
    },
    addToCollection: async (input: Parameters<ScenesApi['addToCollection']>[0]) => addSceneToCollection(app, await loadedAssets(app), input, scope.id),
    replaceMap: async (sceneId: string, input: Parameters<typeof replaceSceneMap>[5]) =>
      replaceSceneMap(app, await loadedAssets(app), views, scope.id, sceneId, input),
  });
}
