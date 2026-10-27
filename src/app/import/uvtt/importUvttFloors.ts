import { COLLECTION_GONE, mapSceneFile, writeMapScene } from '../writeMapScene';
import { NO_STRETCH } from '../../grid/mapStretch';
import { resolveMeasurementSettings } from '../../grid/measurementFormat';
import { t } from '../../i18n';
import type { ProcessedImage } from '../../imageProcessing/imageProcessing';
import { LEVEL_HEIGHT, newLevelId } from '../../levels/levelEdits';
import { sceneFileVersion } from '../../levels/levelFile';
import type { LevelAlignment, SceneLevel } from '../../types/sceneLevelTypes';
import { convertSourceImage, savedSize, type UvttImportDeps } from './importUvttFile';
import { wallsCrowd } from './uvttCrowding';
import { floorPlacement, floorsProblem } from './uvttFloors';
import { CROWDED_WALLS, UNREADABLE_IMAGE, cellSizeOn, refused, type UvttSource } from './uvttSource';
import { uvttToScene, type UvttCounts, type UvttScene, type UvttTarget } from './uvttToScene';
import type { UvttPoint, UvttRefusal } from './uvttTypes';

/** One floor of an import: a file read, and the name its level gets. */
export interface UvttFloor {
  source: UvttSource;
  name: string;
}

export interface UvttFloorsImported {
  ok: true;
  /** The scene's name. */
  name: string;
  scenePath: string;
  levels: number;
  counts: UvttCounts;
  /** Some floor's lights were imported switched off, since its image shows their glow already. */
  lightsOff: boolean;
  /** The files whose images had more pixels than a map keeps and were scaled down. */
  scaledDown: string[];
}

export type UvttFloorsResult = UvttFloorsImported | UvttRefusal;

/** A floor's problem as a sentence that names its file. */
const ofFile = (source: UvttSource, problem: string): UvttRefusal => refused(t('uvttFloors.fileProblem', { file: source.fileName, problem }));

/** Scales that differ by no more than this are the same: a cell's pixels are divided out and back. */
const SAME_SCALE = 1e-9;

/** Checks a floor on its own image, as a file imported alone is checked; null where it passes. */
function floorOnItsImage(source: UvttSource, unit: UvttTarget['unit']): UvttRefusal | null {
  const placed = uvttToScene(source.map, { cellSize: source.cellSize, unit });
  if (placed.onImage === 0 && placed.skipped.outside > 0) {
    return ofFile(source, 'Nothing in the file lies on its map image: its walls, doors and lights are all outside it.');
  }
  return wallsCrowd(Object.values(placed.walls), source.size) ? ofFile(source, CROWDED_WALLS) : null;
}

/** How a floor's image lies on the scene's grid, or none where it lies as the scene's frame does. */
function floorAlignment(at: UvttPoint, sceneCell: number, savedCell: number): LevelAlignment | undefined {
  const scale = sceneCell / savedCell;
  if (at.x === 0 && at.y === 0 && Math.abs(scale - 1) <= SAME_SCALE) return undefined;
  return { offset: { x: at.x * sceneCell, y: at.y * sceneCell }, scale, stretch: NO_STRETCH };
}

function sum(scenes: readonly UvttScene[], key: keyof UvttCounts): number {
  return scenes.reduce((total, scene) => total + scene.counts[key], 0);
}

async function importFloors(deps: UvttImportDeps, floors: readonly UvttFloor[], sceneName: string, collectionId: string): Promise<UvttFloorsResult> {
  const sources = floors.map((floor) => floor.source);
  const problem = floorsProblem(sources);
  if (problem) return refused(problem);
  const collection = await deps.assetService.getCollection(collectionId);
  if (!collection) return refused(COLLECTION_GONE);
  const settings = deps.assetService.getCollectionSettings(collection.id);
  const unit = resolveMeasurementSettings(settings.gridDefaults, null);
  for (const source of sources) {
    const refusal = floorOnItsImage(source, unit);
    if (refusal) return refusal;
  }

  // Every conversion at once: the image workers keep to their memory budget themselves
  const images = await Promise.all(sources.map((source) => convertSourceImage(deps, source)));
  const saved: { image: ProcessedImage; cellSize: number }[] = [];
  for (const [index, source] of sources.entries()) {
    const image = images[index];
    if (!image) return ofFile(source, UNREADABLE_IMAGE);
    const cellSize = cellSizeOn(source.map, await savedSize(image, source));
    if (typeof cellSize !== 'number') return ofFile(source, cellSize.problem);
    saved.push({ image, cellSize });
  }

  // The scene's grid is the floor its corner lies at: its image needs no alignment of its own
  const { at } = floorPlacement(sources.map((source) => source.map));
  const reference = Math.max(0, at.findIndex((point) => point.x === 0 && point.y === 0));
  const sceneCell = saved[reference]!.cellSize;
  const levels: SceneLevel[] = floors.map((floor, index) => ({
    id: newLevelId(),
    name: floor.name,
    elevation: { bottom: index * LEVEL_HEIGHT, top: (index + 1) * LEVEL_HEIGHT },
    background: null,
  }));
  const scenes: UvttScene[] = [];
  for (const [index, source] of sources.entries()) {
    const scene = uvttToScene(source.map, { cellSize: sceneCell, unit, at: at[index]!, level: { id: levels[index]!.id, index } });
    const extent = { width: (at[index]!.x + source.map.size.x) * sceneCell, height: (at[index]!.y + source.map.size.y) * sceneCell };
    if (wallsCrowd(Object.values(scene.walls), extent)) return ofFile(source, CROWDED_WALLS);
    if (Object.values(scene.skipped).some((count) => count > 0)) console.debug(`[Atlas] ${source.fileName}: left out what the map does not take`, scene.skipped);
    scenes.push(scene);
  }

  const written = await writeMapScene(deps, {
    collection,
    baseName: sceneName,
    maps: saved.map(({ image }, index) => ({ image, name: (scene) => t('uvttFloors.mapName', { scene, level: floors[index]!.name }) })),
    content: (paths) => {
      const [bottom] = scenes;
      const content = mapSceneFile(settings, paths[0]!, {
        // The grid is the same from every floor; the light of the scene is the bottom floor's
        grid: scenes[reference]!.grid,
        walls: Object.fromEntries(scenes.flatMap((scene) => Object.entries(scene.walls))),
        lights: Object.fromEntries(scenes.flatMap((scene) => Object.entries(scene.lights))),
        lighting: bottom!.lighting,
      });
      content.state.levels = levels.map((level, index) => {
        const alignment = floorAlignment(at[index]!, sceneCell, saved[index]!.cellSize);
        return { ...level, background: paths[index]!, ...(alignment && { alignment }) };
      });
      content.version = content.state.version = sceneFileVersion(content.state.levels);
      return content;
    },
  });
  if (!written.ok) return written;
  return {
    ...written,
    levels: levels.length,
    counts: { walls: sum(scenes, 'walls'), doors: sum(scenes, 'doors'), lights: sum(scenes, 'lights') },
    lightsOff: sources.some((source, index) => source.map.bakedLighting && scenes[index]!.counts.lights > 0),
    scaledDown: sources.filter((_, index) => saved[index]!.image.scaledDown).map((source) => source.fileName),
  };
}

/**
 * Imports Universal VTT files as the floors of one scene, bottom first: a map of each floor's image
 * and one scene with a level per floor, whose walls, doors and lights stand on it. The scene's grid
 * is the files' one grid; a floor that begins elsewhere than the scene's corner, or whose image was
 * saved at another size, gets an alignment that places its image there. The light of the scene is
 * the bottom floor's. Every file is untrusted: what is wrong comes back as a sentence naming the
 * file, and an import that fails leaves neither a file nor a record. Never throws.
 */
export async function importUvttFloors(deps: UvttImportDeps, floors: readonly UvttFloor[], sceneName: string, collectionId: string): Promise<UvttFloorsResult> {
  try {
    return await importFloors(deps, floors, sceneName, collectionId);
  } catch (error) {
    console.error('[Atlas] Importing Universal VTT floors failed', error);
    return refused(t('uvttFloors.failed'));
  }
}
