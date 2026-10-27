import { TFile, type App } from 'obsidian';
import { NO_STRETCH } from '../grid/mapStretch';
import { hexLayoutOfGrid, pinDisplayPoint } from '../grid/hexLinks';
import { t } from '../i18n';
import type { WorldMapEntrance, WorldMapLevel, WorldMapQuest, WorldMapTree } from '../online/gm/book/worldMapGate.ts';
import { noteFile } from '../online/gm/pins/foundNotes.ts';
import { sentPinFace } from '../online/gm/pins/sentPinFace.ts';
import { readQuest } from '../campaigns/quests/questProperties';
import { linksReadableNote, pinNoteLink } from '../tools/pinNoteLink';
import type { NotePin } from '../types';
import type { GridState } from '../types/gridTypes';
import type { SceneLevel } from '../types/sceneLevelTypes';
import { isRecord } from '../utils/guards';
import { AssetService, type Asset } from './AssetService';
import { isPersistedMapEnvelope } from './MapPersistence';
import { linkedMapPath, sceneLinkTarget } from './sceneLinks';
import { worldMapArtwork } from './worldMap';
import { readSceneLevels } from '../levels/levelFile';
import { levelAlignmentsOf, levelImagePlacement } from '../levels/levelAlignment';
import { pinSceneLevel } from '../levels/pinSceneLevel';
import { firstLevelId, levelById, onLevel } from '../levels/sceneLevels';
import { levelLabel } from '../react/components/levels/levelEditing';

/** The world map's maps as read, and the scene files and notes they were read from, whose changes may change them. */
export interface WorldMapTreeRead {
  readonly tree: WorldMapTree;
  readonly scenePaths: readonly string[];
  /** The notes the world map's pins link that are not scenes: a quest's id is read from its note. */
  readonly notePaths: readonly string[];
}

/** A map of the tree: a plain map or a scene, and of a scene with several levels the floor shown (null: its first). */
interface TreeMap {
  readonly asset: Asset;
  readonly floor: string | null;
}

/** The key of a map of the tree: the asset's id, with the floor where it is not the scene's first. */
const keyOf = ({ asset, floor }: TreeMap): string => (floor === null ? asset.id : `${asset.id}#${floor}`);

/** A scene file as the tree reads it: its state, and its levels with the first one's map in place. */
interface SceneRead {
  readonly state: Record<string, unknown>;
  readonly levels: SceneLevel[] | undefined;
}

/** A scene file's pins that are shown (not the GM's alone), with a link and a place that can be read, on floor `floor`, whose map they stand on. */
function shownPins({ state, levels }: SceneRead, floor: string | null): NotePin[] {
  const objects = isRecord(state.objects) ? state.objects : {};
  const pins = isRecord(objects.pins) ? Object.values(objects.pins) : [];
  return pins
    .filter((pin): pin is NotePin => isRecord(pin) && pin.gmOnly !== true && typeof pin.notePath === 'string' && Number.isFinite(pin.x) && Number.isFinite(pin.y))
    .filter((pin) => floor === null || onLevel(pin, floor, levels));
}

/** The saved state of a scene file, or null when it cannot be read. */
async function readScene(app: App, mapPath: string): Promise<SceneRead | null> {
  const file = app.vault.getAbstractFileByPath(mapPath);
  if (!(file instanceof TFile)) return null;
  try {
    const envelope: unknown = JSON.parse(await app.vault.cachedRead(file));
    if (!isPersistedMapEnvelope(envelope) || !isRecord(envelope.state)) return null;
    const { state } = envelope;
    return { state, levels: readSceneLevels(state.levels, typeof state.background === 'string' ? state.background : null) };
  } catch {
    return null;
  }
}

/** The note a pin on the map at `mapPath` links (no scene), with the id of its quest; no id where the note is no quest or has none yet. */
function linkedNote(app: App, pin: NotePin, mapPath: string): { path: string; id: string | undefined } | null {
  if (!linksReadableNote(pin)) return null;
  const file = noteFile(app, pinNoteLink(pin.notePath).linkpath, mapPath);
  if (file === null) return null;
  const frontmatter: unknown = app.metadataCache.getFileCache(file)?.frontmatter;
  const quest = readQuest({ path: file.path, basename: file.basename, created: file.stat.ctime, modified: file.stat.mtime }, frontmatter);
  return { path: file.path, id: quest?.id };
}

/** The map image of a floor above a scene's first, as the scene file names it; null where the floor has none. */
function floorImage(levels: SceneLevel[] | undefined, floor: string): string | null {
  return levelById(levels, floor)?.background ?? null;
}

/**
 * The tree's maps, each scene file read once. A pin that opens its scene on a floor above the first
 * (`pinSceneLevel`) leads into that floor's map, whose own pins lead on; one whose floor has no map
 * players may be shown leads into the first floor.
 */
class TreeReader {
  private readonly scenes = new Map<string, Promise<SceneRead | null>>();
  /** The notes the pins read so far link, besides scenes. */
  readonly notePaths = new Set<string>();

  constructor(private readonly app: App, private readonly sceneAssets: ReadonlyMap<string, Asset>) {}

  scene(mapPath: string): Promise<SceneRead | null> {
    let read = this.scenes.get(mapPath);
    if (!read) {
      read = readScene(this.app, mapPath);
      this.scenes.set(mapPath, read);
    }
    return read;
  }

  /** The map a pin of the scene at `mapPath` opens, or null where it opens no scene of the tree. */
  async target(mapPath: string, pin: NotePin): Promise<TreeMap | null> {
    const linked = linkedMapPath(pin.notePath);
    const asset = linked === null ? undefined : this.sceneAssets.get(sceneLinkTarget(mapPath, linked) ?? '');
    const targetPath = asset?.type === 'scene' ? asset.data?.mapPath : undefined;
    if (asset === undefined || targetPath === undefined) return null;
    const levels = (await this.scene(targetPath))?.levels;
    const floor = pinSceneLevel(pin, levels);
    return { asset, floor: floor === null || floor === firstLevelId(levels) || floorImage(levels, floor) === null ? null : floor };
  }

  /** One map of the tree and the maps its pins open; null when it has no artwork. */
  async read(map: TreeMap): Promise<{ level: WorldMapLevel; leadsTo: TreeMap[] } | null> {
    const { asset, floor } = map;
    const mapPath = asset.type === 'scene' ? asset.data?.mapPath : undefined;
    const scene = mapPath ? await this.scene(mapPath) : null;
    const image = floor === null ? await worldMapArtwork(this.app, asset) : floorImage(scene?.levels, floor);
    if (image === null) return null;
    const key = keyOf(map);
    const level = levelById(scene?.levels, floor);
    const title = scene?.levels && level ? t('levels.worldMapFloor', { scene: asset.name, level: levelLabel(scene.levels, level) }) : asset.name;
    if (!mapPath || scene === null) return { level: { key, title, image, stretch: NO_STRETCH, entrances: [] }, leadsTo: [] };
    const grid = isRecord(scene.state.grid) ? (scene.state.grid as Partial<GridState>) : null;
    const layout = hexLayoutOfGrid(grid && typeof grid.size === 'number' ? (grid as GridState) : null);
    const shown = floor ?? firstLevelId(scene.levels);
    const placement = levelImagePlacement({ levels: scene.levels, grid: grid as GridState | null, levelAlignments: levelAlignmentsOf(scene.levels) }, shown);
    const entrances: WorldMapEntrance[] = [];
    const leadsTo: TreeMap[] = [];
    const quests: WorldMapQuest[] = [];
    for (const pin of shownPins(scene, shown)) {
      const point = pinDisplayPoint(pin, layout);
      const note = linkedNote(this.app, pin, mapPath);
      if (note !== null) {
        this.notePaths.add(note.path);
        if (note.id !== undefined) quests.push({ x: point.x, y: point.y, id: note.id });
        continue;
      }
      const target = await this.target(mapPath, pin);
      const to = target === null ? key : keyOf(target);
      if (target === null || to === key) continue;
      entrances.push({ x: point.x, y: point.y, to, ...sentPinFace(pin) });
      if (!leadsTo.some((known) => keyOf(known) === to)) leadsTo.push(target);
    }
    return { level: { key, title, image, stretch: placement, entrances, ...(quests.length > 0 && { quests }) }, leadsTo };
  }
}

/**
 * The world map of a campaign, by its asset id, with every scene its pins lead into and theirs in
 * turn, nearest first, each once, `maxLevels` of them at most besides the world map. A pin leads on
 * where players may see it (not the GM's alone) and it opens a scene of the same collection (an older
 * link into another collection opens the scene at the same place in its own, as on the map); a map
 * without scene has no pins. A pin that opens its scene on a floor above the first leads into that
 * floor's map, a map of its own in the tree, as it opens on the GM's map. Every image must be its
 * map's artwork (a floor's: the map its scene file names for it), wherever it lies in the vault: a
 * map without one is left out with the maps only it leads to, and a world map without one is none. A pin that links a quest note places
 * the quest on its map (`WorldMapLevel.quests`) once the note has its id.
 */
export async function worldMapTree(app: App, assetId: string, maxLevels: number): Promise<WorldMapTreeRead | null> {
  const assets = AssetService.getInstance(app);
  const root = await assets.getAssetById(assetId);
  if (root?.id !== assetId || (root.type !== 'map' && root.type !== 'scene')) return null;
  const scenes = new Map((await assets.getAssets(undefined, 'scene')).flatMap((scene) => (scene.type === 'scene' && scene.data?.mapPath ? [[scene.data.mapPath, scene] as const] : [])));
  const reader = new TreeReader(app, scenes);
  const levels: WorldMapLevel[] = [];
  const scenePaths: string[] = [];
  const queue: TreeMap[] = [{ asset: root, floor: null }];
  const seen = new Set([keyOf(queue[0]!)]);
  for (let index = 0; index < queue.length && levels.length <= maxLevels; index++) {
    const map = queue[index]!;
    const mapPath = map.asset.type === 'scene' ? map.asset.data?.mapPath : undefined;
    if (mapPath && !scenePaths.includes(mapPath)) scenePaths.push(mapPath);
    const read = await reader.read(map);
    if (read === null && index === 0) return null;
    if (read === null) continue;
    levels.push(read.level);
    for (const next of read.leadsTo) {
      if (seen.has(keyOf(next))) continue;
      seen.add(keyOf(next));
      queue.push(next);
    }
  }
  return { tree: { root: root.id, levels }, scenePaths, notePaths: [...reader.notePaths] };
}
