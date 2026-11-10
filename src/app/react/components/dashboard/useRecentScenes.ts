import type { App } from 'obsidian';
import { useEffect, useState } from 'react';
import { AssetService } from '../../../services/AssetService';
import { byLastOpened, SceneOpenHistory, type SceneRecency } from '../../../services/sceneOpenHistory';
import { sceneThumbnailUrl } from './libraryPictures';

export interface RecentScene extends SceneRecency {
  id: string;
  path: string;
  name: string;
  collectionName: string;
  collectionId: string;
  thumbnailUrl: string | null;
}

const RECENT_SCENES = 8;

/** When the scene was last played, or else when its record last changed. */
export const lastActivity = (scene: RecentScene): number => scene.openedAt ?? scene.modifiedAt;

async function readRecentScenes(app: App): Promise<RecentScene[]> {
  const assetService = AssetService.getInstance(app);
  const collections = await assetService.getCollections();
  const openHistory = SceneOpenHistory.forApp(app);

  // Only scenes open in the Atlas view; a map asset is an image to build a scene from
  const perCollection = await Promise.all(collections.map(async (collection) => {
    const assets = await assetService.getAssets(collection.id, 'scene');
    return assets.map((asset): RecentScene => {
      const path = asset.data?.mapPath ?? '';
      return {
        id: asset.id,
        path,
        name: asset.name,
        collectionName: collection.name,
        collectionId: collection.id,
        openedAt: openHistory.openedAt(asset.id),
        modifiedAt: asset.modifiedAt,
        thumbnailUrl: path ? sceneThumbnailUrl(app, path) : null,
      };
    });
  }));

  return perCollection.flat().filter((scene) => scene.path !== '').sort(byLastOpened).slice(0, RECENT_SCENES);
}

/** The scenes played or changed last, read again when assets, thumbnails or the open scene change. */
export function useRecentScenes(app: App): { scenes: RecentScene[]; isLoading: boolean } {
  const [scenes, setScenes] = useState<RecentScene[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let current = true;
    const load = (): void => {
      readRecentScenes(app)
        .then((next) => { if (current) setScenes(next); })
        .catch((error: unknown) => console.error('[Dashboard] Error loading recent scenes:', error))
        .finally(() => { if (current) setIsLoading(false); });
    };
    load();
    const refs = [
      app.workspace.on('atlas-vtt:refresh-assets', load),
      app.workspace.on('atlas-vtt:scene-thumbnail-updated', load),
      app.workspace.on('atlas-vtt:scene-opened', load),
    ];
    return () => {
      current = false;
      for (const ref of refs) app.workspace.offref(ref);
    };
  }, [app]);

  return { scenes, isLoading };
}
