import type { App } from 'obsidian';
import { useEffect, useState } from 'react';
import { AssetService } from '../../../services/AssetService';
import { worldMapArtwork } from '../../../services/worldMap';
import { mapThumbnailPath } from '../../../utils/dataFileMigration';
import { imageSrc } from '../../../utils/imageSource';

/** A scene's thumbnail as a vault resource URL, or null when it has none yet. */
export function sceneThumbnailUrl(app: App, mapPath: string): string | null {
  return resourceUrl(app, mapThumbnailPath(mapPath));
}

/** An image reference as a URL a picture can show (a web address as it is), or null when the vault holds no such file. */
export function resourceUrl(app: App, path: string | undefined): string | null {
  return imageSrc(app, path) || null;
}

/** A map or scene of any collection a campaign may take as its world map. */
export interface WorldMapChoice {
  id: string;
  name: string;
  kind: 'map' | 'scene';
  thumbnailUrl: string | null;
  /** The scene's file, which opens it; maps have none. */
  scenePath?: string;
}

async function readWorldMaps(app: App): Promise<WorldMapChoice[]> {
  const assets = AssetService.getInstance(app);
  const [maps, scenes] = await Promise.all([assets.getAssets(undefined, 'map'), assets.getAssets(undefined, 'scene')]);
  const choices: WorldMapChoice[] = [
    ...scenes.map((scene): WorldMapChoice => {
      const path = scene.data?.mapPath;
      return { id: scene.id, name: scene.name, kind: 'scene', thumbnailUrl: path ? sceneThumbnailUrl(app, path) : null, ...(path && { scenePath: path }) };
    }),
    ...maps.map((map): WorldMapChoice => ({ id: map.id, name: map.name, kind: 'map', thumbnailUrl: resourceUrl(app, map.thumbnailPath) })),
  ];
  return choices.sort((a, b) => a.name.localeCompare(b.name));
}

/** The maps and scenes a campaign may take as its world map; `isLoading` until they were first read. */
export interface WorldMapChoices {
  choices: WorldMapChoice[];
  isLoading: boolean;
}

/** Every map and scene of the library, by name; read again when assets or thumbnails change. */
export function useWorldMaps(app: App): WorldMapChoices {
  const [read, setRead] = useState<WorldMapChoices>({ choices: [], isLoading: true });

  useEffect(() => {
    let current = true;
    const load = (): void => {
      readWorldMaps(app)
        .then((choices) => { if (current) setRead({ choices, isLoading: false }); })
        .catch((error: unknown) => {
          console.error('[Dashboard] Reading the maps failed:', error);
          if (current) setRead((before) => ({ ...before, isLoading: false }));
        });
    };
    load();
    const refs = [app.workspace.on('atlas-vtt:refresh-assets', load), app.workspace.on('atlas-vtt:scene-thumbnail-updated', load)];
    return () => {
      current = false;
      for (const ref of refs) app.workspace.offref(ref);
    };
  }, [app]);

  return read;
}

/** The map image a scene shows (its background), by the scene's asset id; null for none, undefined while it is read. */
export function useSceneArtwork(app: App, sceneId: string | null): string | null | undefined {
  const [read, setRead] = useState<{ sceneId: string; path: string | null } | null>(null);

  useEffect(() => {
    if (sceneId === null) return undefined;
    let current = true;
    AssetService.getInstance(app).getAssetById(sceneId)
      .then((asset) => (asset ? worldMapArtwork(app, asset) : null))
      .then((path) => { if (current) setRead({ sceneId, path }); })
      .catch((error: unknown) => {
        console.error('[Dashboard] Reading the scene\'s map failed:', error);
        if (current) setRead({ sceneId, path: null });
      });
    return () => { current = false; };
  }, [app, sceneId]);

  if (sceneId === null) return null;
  return read?.sceneId === sceneId ? read.path : undefined;
}
