import { normalizePath, type App } from 'obsidian';
import type { ProcessedImage } from '../imageProcessing/imageProcessing';
import { prebuildMosaicCanvasAt } from '../pixi/mosaicCanvas/prebuildMosaicCanvas';
import { AssetService, type CollectionMetadata, type MapAsset, type SceneAsset } from '../services/AssetService';
import type { AssetThumbnailService } from '../services/AssetThumbnailService';
import { discardAssetFiles, writeAssetImage } from '../services/assetImageFiles';
import { collectionFolderPath } from '../services/assetPaths';
import { TransferFiles } from '../services/assetTransfer/transferFiles';
import { newSceneFile, type NewSceneFile } from '../services/newSceneFile';
import { JSON_FOLDERS, defaultJsonPath } from '../services/vault-sync/assetFiles';
import type { CollectionSettings } from '../types/collectionSettingsTypes';
import type { GridState } from '../types/gridTypes';
import type { LightSource, SceneLighting } from '../types/lightingTypes';
import type { WallSegment } from '../types/wallTypes';
import type { NotePin } from '../types';
import type { MapFeature } from '../types/mapFeatureTypes';
import type { LiquidSurface } from '../types/liquidTypes';
import type { LevelLink, LevelSurface, SceneLevel } from '../types/sceneLevelTypes';
import { sceneFileVersion } from '../levels/levelFile';
import { t } from '../i18n';

export const COLLECTION_GONE = t('uvtt.collectionGone');

/** What a scene file takes of a map Atlas made or imported: a grid that fits its image, and what stands on it, in world pixels. */
export interface MapSceneParts {
  /** `visible` only where the map's own drawing makes Atlas's grid a second one. */
  grid: Pick<GridState, 'size' | 'offsetX' | 'offsetY'> & Partial<Pick<GridState, 'visible'>>;
  walls: Record<string, WallSegment>;
  lights: Record<string, LightSource>;
  lighting: SceneLighting;
  /** The scene's floors, bottom first, each on its own map; unset for a scene of one. */
  levels?: SceneLevel[];
  /** Stairs between the floors. */
  levelLinks?: Record<string, LevelLink>;
  /** Openings to the floors below, and floor laid over them. */
  levelSurfaces?: Record<string, LevelSurface>;
  pins?: Record<string, NotePin>;
  mapFeatures?: Record<string, MapFeature>;
  /** Water, lava and acid that move while maps are animated. */
  liquids?: Record<string, LiquidSurface>;
}

/**
 * A new scene of a collection with `settings` on `background`, holding `parts`. The map states its
 * grid, so there is none to detect. A scene of several floors is written as the file version that
 * holds them; one of one floor stays as every scene before floors.
 */
export function mapSceneFile(settings: CollectionSettings, background: string, parts: MapSceneParts): NewSceneFile {
  const content = newSceneFile(settings, background);
  const { autoDetect: _autoDetect, ...grid } = content.state.grid;
  content.state.grid = { ...grid, ...parts.grid };
  content.state.objects = {
    ...content.state.objects,
    walls: parts.walls,
    lights: parts.lights,
    ...(parts.pins && { pins: parts.pins }),
    ...(parts.levelLinks && { levelLinks: parts.levelLinks }),
    ...(parts.levelSurfaces && { levelSurfaces: parts.levelSurfaces }),
    ...(parts.mapFeatures && { mapFeatures: parts.mapFeatures }),
    ...(parts.liquids && { liquids: parts.liquids }),
  };
  content.state.lighting = parts.lighting;
  if (parts.levels) {
    content.state.levels = parts.levels;
    content.version = content.state.version = sceneFileVersion(parts.levels);
  }
  return content;
}

/** What writing a scene needs of the app: the vault, the index, and where thumbnails are stored. */
export interface MapSceneDeps {
  app: App;
  assetService: AssetService;
  thumbnails: Pick<AssetThumbnailService, 'tryThumbnailForImage'>;
}

/** One map image of the scene: a map asset of its own. */
export interface MapToWrite {
  image: ProcessedImage;
  /** The map asset's name, given the name the scene gets. */
  name: (sceneName: string) => string;
}

/** A Markdown note that comes with the scene: in the collection's notes folder, named as the scene is. */
export interface NoteToWrite {
  /** The note's text, given the name the scene gets. */
  text: (sceneName: string) => string;
}

export interface MapScenePlan {
  collection: CollectionMetadata;
  /** The scene's name; numbered where a scene of the collection (or its note) carries it already. */
  baseName: string;
  maps: readonly MapToWrite[];
  note?: NoteToWrite;
  /** The scene file, given where each map's image was written (in the order of `maps`) and the note's path, where the plan has a note. */
  content: (mapFilePaths: readonly string[], notePath: string | null) => NewSceneFile;
}

export type MapSceneWritten = { ok: true; name: string; scenePath: string } | { ok: false; problem: string };

const refused = (problem: string): { ok: false; problem: string } => ({ ok: false, problem });

/** The folder of a collection's notes. */
const NOTES_FOLDER = 'notes';

/** The scene file and, where one comes with it, the note of a scene called `name`. */
function scenePaths(collectionId: string, name: string): { scene: string; note: string } {
  const folder = collectionFolderPath(collectionId);
  return {
    scene: normalizePath(`${folder}/${JSON_FOLDERS.scene}/${name}.atlasmap`),
    note: normalizePath(`${folder}/${NOTES_FOLDER}/${name}.md`),
  };
}

/** The first of `base`, `base 2`, `base 3`… that names no scene file of the collection, nor its note where one comes with it. */
async function freeSceneName(app: App, collectionId: string, base: string, withNote: boolean): Promise<string> {
  for (let number = 1; ; number++) {
    const name = number === 1 ? base : `${base} ${number}`;
    const paths = scenePaths(collectionId, name);
    if (await app.vault.adapter.exists(paths.scene)) continue;
    if (withNote && (await app.vault.adapter.exists(paths.note))) continue;
    return name;
  }
}

function newIdentity<T extends 'map' | 'scene'>(type: T, collectionId: string): { id: string; type: T; filePath: string } {
  const id = AssetService.newAssetId(type);
  return { id, type, filePath: defaultJsonPath(type, collectionId, id) };
}

/**
 * Writes a new scene and its maps (an import, a generated dungeon): each map's image and
 * thumbnail, its note where the plan has one, the scene file, and every record in one save of the index. All of it happens under the index lock, so the vault check never sees
 * the new scene without its record and adds a second one. A failure takes back every file
 * written so far, still under the lock, and leaves the index as it was.
 */
export function writeMapScene({ app, assetService, thumbnails }: MapSceneDeps, plan: MapScenePlan): Promise<MapSceneWritten> {
  const { collection } = plan;
  return assetService.runExclusive(async (): Promise<MapSceneWritten> => {
    // Deleted while the images were converted: writing now would bring its folders back
    if (!(await assetService.getCollection(collection.id))) return refused(COLLECTION_GONE);
    const files = new TransferFiles(app);
    const images: string[] = [];
    try {
      const name = await freeSceneName(app, collection.id, plan.baseName, plan.note !== undefined);
      const paths = scenePaths(collection.id, name);
      const scenePath = paths.scene;
      const now = Date.now();
      const shared = { tags: [], collection: collection.id, createdAt: now, modifiedAt: now };

      const maps: MapAsset[] = [];
      for (const map of plan.maps) {
        const mapName = map.name(name);
        const mapFilePath = await writeAssetImage(app, mapName, await map.image.image.arrayBuffer());
        images.push(mapFilePath);
        const thumbnailPath = await thumbnails.tryThumbnailForImage(mapFilePath, map.image.thumbnail);
        if (thumbnailPath) images.push(thumbnailPath);
        maps.push({ ...newIdentity('map', collection.id), ...shared, name: mapName, mapFilePath, ...(thumbnailPath && { thumbnailPath }) });
      }

      const notePath = plan.note ? paths.note : null;
      if (plan.note) await files.write(paths.note, plan.note.text(name));
      const content = plan.content(maps.map((map) => map.mapFilePath), notePath);
      await files.write(scenePath, JSON.stringify(content, null, 2));
      const sceneRecord: SceneAsset = { ...newIdentity('scene', collection.id), ...shared, name, data: { mapPath: scenePath } };
      const records = [...maps, sceneRecord];
      for (const record of records) {
        const recordFile = assetService.pendingRecordFile(record);
        if (recordFile) await files.write(recordFile.path, recordFile.content);
      }
      await assetService.commitAssetTransfer({ collectionId: collection.id, records, tags: [] });
      for (const map of maps) prebuildMosaicCanvasAt(app, map.mapFilePath);
      return { ok: true, name, scenePath };
    } catch (error) {
      console.error('[Atlas] Saving a new scene and its maps failed', error);
      const left = await files.undo();
      await discardAssetFiles(app, images);
      left.push(...images.filter((path) => app.vault.getAbstractFileByPath(path) !== null));
      return refused(`The map could not be saved.${left.length > 0 ? ` These files could not be removed again: ${left.join(', ')}.` : ' Nothing was added.'}`);
    }
  });
}
