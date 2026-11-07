import { COLLECTION_GONE, mapSceneFile, writeMapScene, type MapSceneDeps } from '../writeMapScene';
import { resolveMeasurementSettings } from '../../grid/measurementFormat';
import { imageDimensions } from '../../imageProcessing/imageDimensions';
import type { ProcessedImage } from '../../imageProcessing/imageProcessing';
import type { ScaleDown } from '../../imageProcessing/imageJob';
import { wallsCrowd } from './uvttCrowding';
import { uvttSceneName } from './uvttFileNames';
import { CROWDED_WALLS, UNREADABLE_IMAGE, cellSizeOn, readUvttSource, refused, type UvttSource } from './uvttSource';
import { uvttToScene, type UvttCounts } from './uvttToScene';
import type { UvttRefusal } from './uvttTypes';

export interface UvttImportDeps extends MapSceneDeps {
  /** The file's image as a map stores it, with its thumbnail: the image workers. */
  convertImage: (image: Blob) => Promise<ProcessedImage>;
}

export interface UvttImported {
  ok: true;
  /** The name of the new map and of its scene. */
  name: string;
  scenePath: string;
  counts: UvttCounts;
  /** The lights were imported switched off, since the image shows their glow already. */
  lightsOff: boolean;
  /** Set when the image had more pixels than a map keeps. */
  scaledDown?: ScaleDown;
}

export type UvttImportResult = UvttImported | UvttRefusal;

/** Converts a source's image as a map stores it; null when the workers cannot read it. */
export async function convertSourceImage(deps: Pick<UvttImportDeps, 'convertImage'>, source: UvttSource): Promise<ProcessedImage | null> {
  try {
    return await deps.convertImage(source.image);
  } catch (error) {
    console.error('[Atlas] The image of a Universal VTT file could not be converted', error);
    return null;
  }
}

/** The size a converted image is shown at: the saved image's own, which a large map's was scaled down to. */
export async function savedSize(image: ProcessedImage, source: UvttSource): Promise<{ width: number; height: number }> {
  return (await imageDimensions(image.image)) ?? image.scaledDown?.to ?? source.size;
}

async function importSource(deps: UvttImportDeps, source: UvttSource, collectionId: string): Promise<UvttImportResult> {
  const { map } = source;
  const collection = await deps.assetService.getCollection(collectionId);
  if (!collection) return refused(COLLECTION_GONE);

  // Where things lie on the map does not depend on the size the image is saved at
  const settings = deps.assetService.getCollectionSettings(collection.id);
  const unit = resolveMeasurementSettings(settings.gridDefaults, null);
  const placed = uvttToScene(map, { cellSize: source.cellSize, unit });
  if (placed.onImage === 0 && placed.skipped.outside > 0) {
    return refused('Nothing in the file lies on its map image: its walls, doors and lights are all outside it.');
  }
  if (wallsCrowd(Object.values(placed.walls), source.size)) return refused(CROWDED_WALLS);

  const image = await convertSourceImage(deps, source);
  if (!image) return refused(UNREADABLE_IMAGE);
  const size = await savedSize(image, source);
  const cellSize = cellSizeOn(map, size);
  if (typeof cellSize !== 'number') return cellSize;

  const scene = cellSize === source.cellSize ? placed : uvttToScene(map, { cellSize, unit });
  // A map scaled down has its walls closer together
  if (scene !== placed && wallsCrowd(Object.values(scene.walls), size)) return refused(CROWDED_WALLS);
  if (Object.values(scene.skipped).some((count) => count > 0)) console.debug(`[Atlas] ${source.fileName}: left out what the map does not take`, scene.skipped);
  const written = await writeMapScene(deps, {
    collection,
    baseName: uvttSceneName(source.fileName),
    maps: [{ image, name: (sceneName) => sceneName }],
    content: ([background]) => mapSceneFile(settings, background!, scene),
  });
  if (!written.ok) return written;
  return {
    ...written,
    counts: scene.counts,
    lightsOff: map.bakedLighting && scene.counts.lights > 0,
    ...(image.scaledDown && { scaledDown: image.scaledDown }),
  };
}

/** Imports a file already read (`readUvttSource`) as `importUvttFile` does. Never throws. */
export async function importUvttSource(deps: UvttImportDeps, source: UvttSource, collectionId: string): Promise<UvttImportResult> {
  try {
    return await importSource(deps, source, collectionId);
  } catch (error) {
    console.error('[Atlas] Importing a Universal VTT file failed', error);
    return refused('The file could not be imported.');
  }
}

/**
 * Imports a Universal VTT file into a collection as a map and a scene of the same name, with
 * the file's walls, doors and lights and dynamic lighting on. The file is untrusted: whatever
 * is wrong with it comes back as a problem in plain words, and an import that fails leaves
 * neither a file nor a record. Never throws.
 */
export async function importUvttFile(deps: UvttImportDeps, file: File, collectionId: string): Promise<UvttImportResult> {
  try {
    const source = await readUvttSource(file);
    return 'ok' in source ? source : await importUvttSource(deps, source, collectionId);
  } catch (error) {
    console.error('[Atlas] Importing a Universal VTT file failed', error);
    return refused('The file could not be imported.');
  }
}
