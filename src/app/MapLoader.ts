import { App, TFile, normalizePath } from 'obsidian';
import type { MapFile } from './services/MapPersistence';
import { migrateMapFile, parseSceneFile } from './services/MapPersistence';
import { SceneFileError } from './services/sceneFileProblems';
import { AssetValidationService, type MissingAsset } from './services/AssetValidationService';
import type { MapImageSource } from './pixi/mapImage/mapImageTypes';
import { resolveLevel } from './levels/sceneLevels';
import { levelBackground } from './levels/levelEdits';
import { isVideoMapPath } from './pixi/mapImage/video/videoMapFiles';

export interface LoadedMap {
  mapData: MapFile;
  /** What the scene shows under its tokens on `level`; nothing of it is decoded yet. */
  image: MapImageSource;
  /** The level shown: the one asked for where the scene has it, else the first; null for a scene without levels. */
  level: string | null;
  missingAssets?: MissingAsset[]; // Track missing assets for reporting
}

/** Cells a side of the empty world of a scene without a map image. */
const EMPTY_MAP_CELLS = 20;

/**
 * What a scene whose background is `background` shows: the image file, the video
 * of an animated map, the missing-image placeholder when the file is gone, or an empty world of 20 × 20
 * cells without a background.
 */
export function mapImageSourceFor(app: App, background: string | null | undefined, gridSize: number | undefined): MapImageSource {
  if (!background) {
    const side = (gridSize || 70) * EMPTY_MAP_CELLS;
    return { kind: 'none', width: side, height: side };
  }
  const file = app.vault.getAbstractFileByPath(normalizePath(background));
  if (file instanceof TFile) return isVideoMapPath(file.path) ? { kind: 'video', file } : { kind: 'file', file };
  console.error(`[MapLoader] Background image not found: ${background}`);
  return { kind: 'placeholder' };
}

/**
 * Pure helper that reads the .atlasmap JSON and finds its map image.
 * All vault / IO logic lives here so AtlasView remains an orchestrator only.
 */
export class MapLoader {
  /** Reads the scene at `mapFilePath` and finds the map image of `level` (unset: the first). */
  static async load(app: App, mapFilePath: string, level?: string): Promise<LoadedMap> {
    const assetValidationService = new AssetValidationService({ app });
    // Read and parse the map JSON file from the vault
    const file = app.vault.getAbstractFileByPath(normalizePath(mapFilePath));
    if (!(file instanceof TFile)) {
      throw new Error(`[MapLoader] Map file not found: ${mapFilePath}`);
    }
    let raw: string;
    try {
      raw = await app.vault.read(file);
    } catch (error) {
      console.error(`[MapLoader] Error reading map file ${mapFilePath}:`, error);
      throw new SceneFileError('unreadable');
    }

    // The same check the store's storage makes, so a file never shows as a map that then loads empty.
    // Apply migration to convert app:// URLs to relative paths
    const mapData = migrateMapFile(parseSceneFile(raw).state);

    const validationResult = await assetValidationService.validateMapAssets(mapData);
    if (!validationResult.valid) {
      assetValidationService.showMissingAssetsNotice(validationResult.missingAssets);
    }

    const shownLevel = resolveLevel(mapData.levels, level);
    return {
      mapData,
      level: shownLevel,
      image: mapImageSourceFor(app, levelBackground(mapData, shownLevel), mapData.grid?.size),
      missingAssets: validationResult.missingAssets,
    };
  }
}
