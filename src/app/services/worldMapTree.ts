import { TFile, type App } from 'obsidian';
import { readMapStretch, NO_STRETCH } from '../grid/mapStretch';
import { hexLayoutOfGrid, pinDisplayPoint } from '../grid/hexLinks';
import type { WorldMapEntrance, WorldMapLevel, WorldMapQuest, WorldMapTree } from '../online/gm/book/worldMapGate.ts';
import { noteFile } from '../online/gm/pins/foundNotes.ts';
import { sentPinFace } from '../online/gm/pins/sentPinFace.ts';
import { readQuest } from '../campaigns/quests/questProperties';
import { linksReadableNote, pinNoteLink } from '../tools/pinNoteLink';
import type { NotePin } from '../types';
import type { GridState } from '../types/gridTypes';
import { isRecord } from '../utils/guards';
import { AssetService, type Asset } from './AssetService';
import { isPersistedMapEnvelope } from './MapPersistence';
import { linkedMapPath, sceneLinkTarget } from './sceneLinks';
import { worldMapArtwork } from './worldMap';

/** The world map's maps as read, and the scene files and notes they were read from, whose changes may change them. */
export interface WorldMapTreeRead {
  readonly tree: WorldMapTree;
  readonly scenePaths: readonly string[];
  /** The notes the world map's pins link that are not scenes: a quest's id is read from its note. */
  readonly notePaths: readonly string[];
}

/** A scene file's pins that are shown (not the GM's alone), with a link and a place that can be read. */
function shownPins(state: Record<string, unknown>): NotePin[] {
  const objects = isRecord(state.objects) ? state.objects : {};
  const pins = isRecord(objects.pins) ? Object.values(objects.pins) : [];
  return pins.filter((pin): pin is NotePin => isRecord(pin) && pin.gmOnly !== true && typeof pin.notePath === 'string' && Number.isFinite(pin.x) && Number.isFinite(pin.y));
}

/** The saved state of a scene file, or null when it cannot be read. */
async function readScene(app: App, mapPath: string): Promise<Record<string, unknown> | null> {
  const file = app.vault.getAbstractFileByPath(mapPath);
  if (!(file instanceof TFile)) return null;
  try {
    const envelope: unknown = JSON.parse(await app.vault.cachedRead(file));
    if (!isPersistedMapEnvelope(envelope) || !isRecord(envelope.state)) return null;
    return envelope.state;
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

/** The tree's maps, each scene file read once. */
class TreeReader {
  private readonly scenes = new Map<string, Promise<Record<string, unknown> | null>>();
  /** The notes the pins read so far link, besides scenes. */
  readonly notePaths = new Set<string>();

  constructor(private readonly app: App, private readonly sceneAssets: ReadonlyMap<string, Asset>) {}

  scene(mapPath: string): Promise<Record<string, unknown> | null> {
    let read = this.scenes.get(mapPath);
    if (!read) {
      read = readScene(this.app, mapPath);
      this.scenes.set(mapPath, read);
    }
    return read;
  }

  /** The scene a pin of the scene at `mapPath` opens, or null where it opens no scene of the tree. */
  target(mapPath: string, pin: NotePin): Asset | null {
    const linked = linkedMapPath(pin.notePath);
    const asset = linked === null ? undefined : this.sceneAssets.get(sceneLinkTarget(mapPath, linked) ?? '');
    return asset?.type === 'scene' && asset.data?.mapPath !== undefined ? asset : null;
  }

  /** One map of the tree and the maps its pins open; null when it has no artwork. */
  async read(asset: Asset): Promise<{ level: WorldMapLevel; leadsTo: Asset[] } | null> {
    const image = await worldMapArtwork(this.app, asset);
    if (image === null) return null;
    const key = asset.id;
    const title = asset.name;
    const mapPath = asset.type === 'scene' ? asset.data?.mapPath : undefined;
    const state = mapPath ? await this.scene(mapPath) : null;
    if (!mapPath || state === null) return { level: { key, title, image, stretch: NO_STRETCH, entrances: [] }, leadsTo: [] };
    const grid = isRecord(state.grid) ? (state.grid as Partial<GridState>) : null;
    const layout = hexLayoutOfGrid(grid && typeof grid.size === 'number' ? (grid as GridState) : null);
    const entrances: WorldMapEntrance[] = [];
    const leadsTo: Asset[] = [];
    const quests: WorldMapQuest[] = [];
    for (const pin of shownPins(state)) {
      const point = pinDisplayPoint(pin, layout);
      const note = linkedNote(this.app, pin, mapPath);
      if (note !== null) {
        this.notePaths.add(note.path);
        if (note.id !== undefined) quests.push({ x: point.x, y: point.y, id: note.id });
        continue;
      }
      const target = this.target(mapPath, pin);
      if (target === null || target.id === key) continue;
      entrances.push({ x: point.x, y: point.y, to: target.id, ...sentPinFace(pin) });
      if (!leadsTo.some((known) => known.id === target.id)) leadsTo.push(target);
    }
    return { level: { key, title, image, stretch: readMapStretch(grid?.mapStretch), entrances, ...(quests.length > 0 && { quests }) }, leadsTo };
  }
}

/**
 * The world map of a campaign, by its asset id, with every scene its pins lead into and theirs in
 * turn, nearest first, each once, `maxLevels` of them at most besides the world map. A pin leads on
 * where players may see it (not the GM's alone) and it opens a scene of the same collection (an older
 * link into another collection opens the scene at the same place in its own, as on the map); a map
 * without scene has no pins. Every image must be its map's artwork in Atlas's own folders: a map without one is left out with the
 * maps only it leads to, and a world map without one is none. A pin that links a quest note places
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
  const queue: Asset[] = [root];
  const seen = new Set([root.id]);
  for (let index = 0; index < queue.length && levels.length <= maxLevels; index++) {
    const map = queue[index]!;
    const mapPath = map.type === 'scene' ? map.data?.mapPath : undefined;
    if (mapPath && !scenePaths.includes(mapPath)) scenePaths.push(mapPath);
    const read = await reader.read(map);
    if (read === null && index === 0) return null;
    if (read === null) continue;
    levels.push(read.level);
    for (const next of read.leadsTo) {
      if (seen.has(next.id)) continue;
      seen.add(next.id);
      queue.push(next);
    }
  }
  return { tree: { root: root.id, levels }, scenePaths, notePaths: [...reader.notePaths] };
}
