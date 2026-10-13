import { App, TFile, normalizePath } from 'obsidian';
import type { MapFile } from './services/MapPersistence';
import { migrateMapFile, parseSceneFile } from './services/MapPersistence';
import { SceneFileError } from './services/sceneFileProblems';
import { AssetValidationService, type MissingAsset } from './services/AssetValidationService';
import type { MapImageSource } from './pixi/mapImage/mapImageTypes';

export interface LoadedMap {
  mapData: MapFile;
  /** What the scene shows under its tokens; nothing of it is decoded yet. */
  image: MapImageSource;
  missingAssets?: MissingAsset[]; // Track missing assets for reporting
}

/** Cells a side of the empty world of a scene without a map image. */
const EMPTY_MAP_CELLS = 20;

/**
 * What a scene whose background is `background` shows: the image file, the
 * missing-image placeholder when the file is gone, or an empty world of 20 × 20
 * cells without a background.
 */
export function mapImageSourceFor(app: App, background: string | null | undefined, gridSize: number | undefined): MapImageSource {
  if (!background) {
    const side = (gridSize || 70) * EMPTY_MAP_CELLS;
    return { kind: 'none', width: side, height: side };
  }
  const file = app.vault.getAbstractFileByPath(normalizePath(background));
  if (file instanceof TFile) return { kind: 'file', file };
  console.error(`[MapLoader] Background image not found: ${background}`);
  return { kind: 'placeholder' };
}

/**
 * Pure helper that reads the .atlasmap JSON and finds its map image.
 * All vault / IO logic lives here so AtlasView remains an orchestrator only.
 */
export class MapLoader {
  static async load(app: App, mapFilePath: string): Promise<LoadedMap> {
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

    return {
      mapData,
      image: mapImageSourceFor(app, mapData.background, mapData.grid?.size),
      missingAssets: validationResult.missingAssets,
    };
  }
}
