import { TFile, type App } from 'obsidian';
import { useEffect, useState } from 'react';
import { AssetService } from '../../../services/AssetService';
import { worldMapArtwork } from '../../../services/worldMap';
import { parseSceneFile } from '../../../services/MapPersistence';
import { levelBackground } from '../../../levels/levelEdits';
import { firstLevelId, resolveLevel } from '../../../levels/sceneLevels';
import type { Asset } from '../../../services/AssetService';
import { mapThumbnailPath } from '../../../utils/dataFileMigration';

/** A scene's thumbnail as a vault resource URL, or null when it has none yet. */
export function sceneThumbnailUrl(app: App, mapPath: string): string | null {
  return resourceUrl(app, mapThumbnailPath(mapPath));
}

/** A vault file as a resource URL, or null when there is no such file. */
export function resourceUrl(app: App, path: string | undefined): string | null {
  const file = path ? app.vault.getAbstractFileByPath(path) : null;
  return file instanceof TFile ? app.vault.getResourcePath(file) : null;
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

/** The image of the upper level a scene file was last shown on, or null: on its first level, or for a file that cannot be read. */
export async function lastShownLevelArtwork(app: App, asset: Asset): Promise<string | null> {
  const file = asset.type === 'scene' && asset.data?.mapPath ? app.vault.getAbstractFileByPath(asset.data.mapPath) : null;
  if (!(file instanceof TFile)) return null;
  try {
    const { levels, background, viewedLevel } = parseSceneFile(await app.vault.read(file)).state;
    const level = resolveLevel(levels, viewedLevel);
    if (level === firstLevelId(levels)) return null;
    const image = levelBackground({ levels, background: background ?? null }, level);
    return image && app.vault.getAbstractFileByPath(image) ? image : null;
  } catch {
    return null;
  }
}

/**
 * The map image a scene opens on, by the scene's asset id; null for none, undefined while it is
 * read. `thumbnail` changes when the scene is saved with another picture, which may be another level.
 */
export function useSceneArtwork(app: App, sceneId: string | null, thumbnail: string | null = null): string | null | undefined {
  const [read, setRead] = useState<{ sceneId: string; path: string | null } | null>(null);

  useEffect(() => {
    if (sceneId === null) return undefined;
    let current = true;
    AssetService.getInstance(app).getAssetById(sceneId)
      .then(async (asset) => (asset ? await lastShownLevelArtwork(app, asset) ?? await worldMapArtwork(app, asset) : null))
      .then((path) => { if (current) setRead({ sceneId, path }); })
      .catch((error: unknown) => {
        console.error('[Dashboard] Reading the scene\'s map failed:', error);
        if (current) setRead({ sceneId, path: null });
      });
    return () => { current = false; };
  }, [app, sceneId, thumbnail]);

  if (sceneId === null) return null;
  return read?.sceneId === sceneId ? read.path : undefined;
}
