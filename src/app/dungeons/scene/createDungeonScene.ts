import type { App } from 'obsidian';
import { resolveMeasurementSettings } from '../../grid/measurementFormat';
import { imageDimensions } from '../../imageProcessing/imageDimensions';
import { IMAGE_PRESETS, optimizeBitmap, type ProcessedImage } from '../../imageProcessing/imageProcessing';
import { mapSceneFile, writeMapScene, type MapSceneDeps, type MapToWrite } from '../../import/writeMapScene';
import { type FloorStack, bottomUp, levelElevation, stackOf } from '../floors/floorStack';
import { LEVEL_HEIGHT } from '../../levels/levelEdits';
import type { SceneLevel } from '../../types/sceneLevelTypes';
import type { AssetService } from '../../services/AssetService';
import { AssetThumbnailService, THUMBNAIL_SPEC } from '../../services/AssetThumbnailService';
import { MAP_THUMBNAIL_SIZE, MapThumbnailService } from '../../services/MapThumbnailService';
import { t } from '../../i18n';
import { INVALID_NAME_CHARACTERS } from '../../services/assetPaths';
import type { DungeonModel, DungeonRequest } from '../model';
import { DEFAULT_PX_PER_CELL, SCENE_MAP_PIXELS, SCENE_MAP_QUALITY, type MapLayout } from '../render/layoutSize';
import type { DungeonStyle, DungeonView } from '../style';
import { DungeonWorkerClient } from '../worker/DungeonWorkerClient';
import type { DungeonJob, DungeonRendered } from '../worker/dungeonJob';
import { holdReveal, SINGLE_LEVEL, type PendingReveal } from '../reveal/pendingReveals';
import { revealPlan } from '../reveal/revealPlan';
import { floorName } from './roomKeys';
import { dungeonNote, roomPins } from './toNote';
import { dungeonSceneThumbnail } from './sceneThumbnail';
import { dungeonScene } from './toScene';
import type { DungeonPlacement } from './toWalls';

export interface DungeonSceneDeps extends MapSceneDeps {
  /** Generates and draws the dungeon: the dungeon worker. */
  render: (job: DungeonJob) => Promise<DungeonRendered>;
  /** The map image as a map stores it, with its thumbnail: the image workers, which take the bitmap over. */
  convertImage: (image: ImageBitmap) => Promise<ProcessedImage>;
}

export interface DungeonSceneOptions {
  /** What the scene and its map are called: the name the GM gave the dungeon. */
  name: string;
  request: DungeonRequest;
  /** The dungeon as the GM last saw it (wings hidden); unset generates it from `request`. */
  model?: DungeonModel;
  style: DungeonStyle;
  view: DungeonView;
  collectionId: string;
  /** Pixels per cell of the map image; less where the image would pass a map's limits. */
  pxPerCell?: number;
}

export type DungeonSceneResult =
  /** `entryLevel`: the entry floor's level, which the scene should open on; unset for a dungeon of one floor. */
  | { ok: true; name: string; scenePath: string; entryLevel?: string }
  | { ok: false; problem: string };

const refused = (problem: string): DungeonSceneResult => ({ ok: false, problem });

const INVALID_CHARACTERS = new RegExp(INVALID_NAME_CHARACTERS.source, 'g');

/** A dungeon's name as a vault file may be called. */
export function dungeonSceneName(given: string): string {
  const name = given.replace(INVALID_CHARACTERS, ' ').replace(/\s+/g, ' ').replace(/^[.\s]+/, '').trim();
  return name || 'Dungeon';
}

/** Where the saved image lies on the grid: the layout's cells, at the pixels per cell of the image as it was saved. */
function placementOn(layout: MapLayout, saved: { width: number }): DungeonPlacement {
  const pxPerCell = saved.width === layout.widthPx ? layout.pxPerCell : saved.width / layout.cellsWide;
  return { originCell: layout.originCell, pxPerCell };
}

/**
 * The scene's levels, bottom first: a Cavern's deepest floor first and its entry floor last, a
 * building's entry floor first and its top floor last; each a floor high, the entry floor from 0
 * up (`levelElevation`), each on its floor's map. "Floor A" is the entry floor either way.
 */
export function floorLevels(levelIds: readonly string[], backgrounds: readonly string[], stack: FloorStack): SceneLevel[] {
  return bottomUp(stack).map((floor): SceneLevel => ({
    id: levelIds[floor]!,
    name: floorName(stack, floor),
    elevation: levelElevation(stack, floor, LEVEL_HEIGHT),
    background: backgrounds[floor] ?? null,
  }));
}

/** How each floor's map grows into being the first time the scene is shown, on the saved image. */
function revealOf(model: DungeonModel, view: DungeonView, layout: MapLayout, placement: DungeonPlacement, saved: { width: number; height: number }, levelIds: readonly string[] | null): PendingReveal {
  const map = { ...layout, ...placement };
  const levels = Object.fromEntries(model.floors.map((_, floor) => [levelIds?.[floor] ?? SINGLE_LEVEL, revealPlan(model, view, map, floor, saved)]));
  return { width: saved.width, height: saved.height, levels };
}

interface DrawnFloors {
  model: DungeonModel;
  layout: MapLayout;
  /** Each floor's map as a map stores it, the entry floor first. */
  images: ProcessedImage[];
}

/** Raised where the dungeon worker answered a floor with something else than asked for. */
class NotDrawn extends Error {}

/**
 * Every floor's map at the same layout, each converted as a map stores it. Every job is asked for
 * at once: a floor's map goes to the image workers as a bitmap as soon as it is drawn, so its
 * conversion runs while the next floor is drawn. The first job generates the dungeon where no
 * model was given; the others draw that one. Null where a floor could not be drawn.
 */
async function drawFloors(deps: DungeonSceneDeps, options: DungeonSceneOptions): Promise<DrawnFloors | null> {
  const size = { pxPerCell: options.pxPerCell ?? DEFAULT_PX_PER_CELL, maxPixels: SCENE_MAP_PIXELS };
  const job = (model: DungeonModel | undefined, output: DungeonJob['output']): DungeonJob => ({
    request: options.request,
    ...(model && { model }),
    style: options.style,
    view: options.view,
    output,
  });
  const mapOf = (floor: number): DungeonJob['output'] => ({ kind: 'map', ...size, bitmap: true, ...(floor > 0 && { floor }) });
  // Every bitmap that arrives goes to a conversion, which takes it over.
  const converted = (drawn: Promise<DungeonRendered>): Promise<ProcessedImage> => drawn.then(({ image }) => {
    if (image.type !== 'bitmap') throw new NotDrawn();
    return deps.convertImage(image.bitmap);
  });
  const first = deps.render(job(options.model, mapOf(0)));
  const firstImage = converted(first);
  const pending: Promise<unknown>[] = [firstImage];
  try {
    const { model, map: layout } = await first;
    const images = [firstImage, ...model.floors.slice(1).map((_, i) => converted(deps.render(job(model, mapOf(i + 1)))))];
    pending.push(...images.slice(1));
    return { model, layout, images: await Promise.all(images) };
  } catch (error) {
    if (error instanceof NotDrawn) return null;
    throw error;
  } finally {
    // Whatever happened to the others, no job asked for is left running or unheard.
    await Promise.allSettled(pending);
  }
}

async function create(deps: DungeonSceneDeps, options: DungeonSceneOptions): Promise<DungeonSceneResult> {
  const { style, view } = options;
  const collection = await deps.assetService.getCollection(options.collectionId);
  if (!collection) return refused(t('dungeon.problem.collectionGone'));

  const drawn = await drawFloors(deps, options);
  if (!drawn) return refused(t('dungeon.problem.notDrawn'));
  const { model, layout, images } = drawn;
  // A map within the limits is kept as drawn; one the workers scaled down has smaller cells
  const sizes = await Promise.all(images.map(async (image) => (await imageDimensions(image.image)) ?? image.scaledDown?.to ?? { width: layout.widthPx, height: layout.heightPx }));
  const saved = sizes[0]!;
  // Every floor lies on one grid: their images must have one size
  if (sizes.some((size) => size.width !== saved.width || size.height !== saved.height)) return refused(t('dungeon.problem.notDrawn'));
  const placement = placementOn(layout, saved);
  const settings = deps.assetService.getCollectionSettings(collection.id);
  const parts = dungeonScene(model, style, view, placement, saved, resolveMeasurementSettings(settings.gridDefaults, null));
  if (!parts) return refused(t('dungeon.problem.crowdedWalls'));
  if (parts.unplaced > 0) console.debug(`[Atlas] ${options.name}: ${parts.unplaced} doors had no walls beside them and were left open`);

  const { levelIds, rooms } = parts;
  const maps: MapToWrite[] = images.map((image, floor) => ({
    image,
    name: (scene) => (levelIds ? t('dungeonScene.mapName', { scene, floor: floorName(stackOf(model), floor) }) : scene),
  }));
  const written = await writeMapScene(deps, {
    collection,
    baseName: dungeonSceneName(options.name),
    maps,
    note: { text: () => dungeonNote(options.name.trim() || dungeonSceneName(options.name), rooms) },
    content: (paths, notePath) => {
      const levels = levelIds && floorLevels(levelIds, paths, stackOf(model));
      // The first level's map is the scene's background
      const background = levels?.[0]?.background ?? paths[0]!;
      return mapSceneFile(settings, background, { ...parts.scene, ...(levels && { levels }), pins: roomPins(rooms, notePath!) });
    },
  });
  if (!written.ok) {
    console.error('[Atlas] Saving a dungeon scene failed:', written.problem);
    return refused(t('dungeon.createFailed'));
  }
  holdReveal(deps.app, written.scenePath, revealOf(model, view, layout, placement, saved, levelIds));
  return { ok: true, name: written.name, scenePath: written.scenePath, ...(levelIds?.[0] && { entryLevel: levelIds[0] }) };
}

/**
 * Turns a dungeon into a scene of a collection, named as the GM named it: each floor's plan as a
 * map image (a level per floor where there are several, with stairs between them), a grid that
 * fits it by construction, its walls and doors, the outlines of its tall objects, dynamic lighting
 * in daylight, and a note with a heading per room that a GM-only numbered pin in each room links.
 * All of it is written together or not at all. Never throws: what went wrong comes back as a problem.
 */
export async function createDungeonSceneWith(deps: DungeonSceneDeps, options: DungeonSceneOptions): Promise<DungeonSceneResult> {
  try {
    return await create(deps, options);
  } catch (error) {
    console.error('[Atlas] Creating a dungeon scene failed', error);
    return refused(t('dungeon.createFailed'));
  }
}

/**
 * Gives a new scene the thumbnail a scene gets when its view is first shown, so a note pin that
 * links it shows the map before anyone opened it. A thumbnail that cannot be made leaves the
 * scene as it is: the next time it is shown makes one.
 */
async function giveSceneThumbnail(app: App, client: DungeonWorkerClient, scenePath: string, options: DungeonSceneOptions): Promise<void> {
  try {
    const bytes = await dungeonSceneThumbnail((job) => client.render(job), options, MAP_THUMBNAIL_SIZE);
    if (bytes) await new MapThumbnailService(app).saveThumbnail(scenePath, bytes);
  } catch (error) {
    console.warn('[Atlas] The new dungeon scene got no thumbnail yet', error);
  }
}

/**
 * `createDungeonSceneWith` on the app's dungeon worker and image workers, with the scene's
 * thumbnail; the asset manager is told of the new scene.
 */
export async function createDungeonScene(app: App, assetService: AssetService, options: DungeonSceneOptions): Promise<DungeonSceneResult> {
  const client = DungeonWorkerClient.forApp(app);
  const result = await createDungeonSceneWith(
    {
      app,
      assetService,
      render: (job) => client.render(job),
      // A generated map is all fine grain, which a PNG cannot pack: stored as WebP, a thirtieth of the size
      convertImage: (image) => optimizeBitmap(image, { ...IMAGE_PRESETS.map, quality: SCENE_MAP_QUALITY }, { thumbnail: THUMBNAIL_SPEC }),
      thumbnails: AssetThumbnailService.getInstance(app, assetService),
    },
    options,
  );
  if (result.ok) {
    await giveSceneThumbnail(app, client, result.scenePath, options);
    app.workspace.trigger('atlas-vtt:refresh-assets');
  }
  return result;
}
