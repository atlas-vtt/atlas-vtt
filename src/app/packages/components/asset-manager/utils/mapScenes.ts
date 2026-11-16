import { TFile, type App } from 'obsidian';
import type { AssetService } from '../../../../services/AssetService';
import { sceneBackground } from '../../../../services/sceneBackground';
import { normalizeImagePath } from '../../../../utils/pathUtils';
import { workSlices } from '../../../../utils/workSlices';

/** A scene of a collection, by the map it starts on. */
export interface SceneOnMap {
  id: string;
  name: string;
  /** Vault path of the image the scene's map file shows; null when it shows none or cannot be read. */
  background: string | null;
  /** When the scene was last saved: its map file's modification time. */
  savedAt: number;
}

/** The scene last saved of those that start on the map at `mapFilePath`; null when none does. */
export function latestSceneOn(mapFilePath: string, scenes: readonly SceneOnMap[]): SceneOnMap | null {
  const path = normalizeImagePath(mapFilePath);
  let latest: SceneOnMap | null = null;
  for (const scene of scenes) {
    if (scene.background === path && (!latest || scene.savedAt > latest.savedAt)) latest = scene;
  }
  return latest;
}

interface ReadBackground {
  mtime: number;
  size: number;
  background: string | null;
}

/**
 * The scenes of each collection by the map they start on, read from their map files. A file is parsed again only
 * once its time or size changed, so reading a collection again costs little; what the last read found is kept for
 * menus, which are built at once.
 */
export class MapScenes {
  private static readonly instances = new WeakMap<App, MapScenes>();

  static forApp(app: App): MapScenes {
    let instance = MapScenes.instances.get(app);
    if (!instance) {
      instance = new MapScenes(app);
      MapScenes.instances.set(app, instance);
    }
    return instance;
  }

  private readonly backgrounds = new Map<string, ReadBackground>();
  private readonly known = new Map<string, readonly SceneOnMap[]>();
  private readonly reading = new Map<string, Promise<readonly SceneOnMap[]>>();

  private constructor(private readonly app: App) {}

  /** What the last read found in a collection; null while it has not been read. */
  scenesOf(collectionId: string): readonly SceneOnMap[] | null {
    return this.known.get(collectionId) ?? null;
  }

  /** Reads a collection's scenes as their files are now. Calls while a read of it runs share that read. */
  read(assetService: AssetService, collectionId: string): Promise<readonly SceneOnMap[]> {
    const running = this.reading.get(collectionId);
    if (running) return running;
    const read = this.readNow(assetService, collectionId).finally(() => this.reading.delete(collectionId));
    this.reading.set(collectionId, read);
    return read;
  }

  private async readNow(assetService: AssetService, collectionId: string): Promise<readonly SceneOnMap[]> {
    const pace = workSlices();
    const found: SceneOnMap[] = [];
    for (const scene of await assetService.getAssets(collectionId, 'scene')) {
      const path = scene.data?.mapPath;
      const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
      if (!(file instanceof TFile)) continue;
      found.push({ id: scene.id, name: scene.name, background: await this.backgroundOf(file), savedAt: file.stat.mtime });
      await pace();
    }
    this.known.set(collectionId, found);
    return found;
  }

  private async backgroundOf(file: TFile): Promise<string | null> {
    const { mtime, size } = file.stat;
    const read = this.backgrounds.get(file.path);
    if (read?.mtime === mtime && read.size === size) return read.background;
    const shown = await sceneBackground(this.app, file.path);
    const background = shown ? normalizeImagePath(shown) : null;
    this.backgrounds.set(file.path, { mtime, size, background });
    return background;
  }
}
