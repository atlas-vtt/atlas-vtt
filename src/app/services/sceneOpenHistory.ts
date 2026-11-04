import type { App } from 'obsidian';
import { AssetService } from './AssetService';

const STORAGE_KEY = 'atlas-vtt:scene-opens';
/** Opens kept, the most recent ones; a scene dropped from them sorts by its record's date again. */
const MAX_SCENES = 50;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Trust boundary: local storage may hold data from another Atlas version, or nothing. */
function readOpens(value: unknown): Map<string, number> {
  if (!isRecord(value)) return new Map();
  return new Map(Object.entries(value)
    .filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
    .sort((a, b) => b[1] - a[1])
    .slice(0, MAX_SCENES));
}

/** A scene as a recent-scenes list orders it. */
export interface SceneRecency {
  /** When the scene was last opened on this device; null if never. */
  openedAt: number | null;
  /** When its record last changed (created, imported, renamed). */
  modifiedAt: number;
}

/**
 * Orders scenes for "Continue your adventure": the scenes opened on this device,
 * the last one first, then the ones never opened here by their record's date.
 */
export function byLastOpened(a: SceneRecency, b: SceneRecency): number {
  if (a.openedAt !== null && b.openedAt !== null) return b.openedAt - a.openedAt;
  if (a.openedAt !== null) return -1;
  if (b.openedAt !== null) return 1;
  return b.modifiedAt - a.modifiedAt;
}

/**
 * When each scene was last opened in a map view, keyed by its asset id (moves
 * and renames keep it). Kept in the vault's local storage: what was played last
 * belongs to this device, like the asset manager's place.
 */
export class SceneOpenHistory {
  private static readonly instances = new WeakMap<App, SceneOpenHistory>();

  static forApp(app: App): SceneOpenHistory {
    let history = SceneOpenHistory.instances.get(app);
    if (!history) {
      history = new SceneOpenHistory(app);
      SceneOpenHistory.instances.set(app, history);
    }
    return history;
  }

  private readonly opens: Map<string, number>;

  private constructor(private readonly app: App) {
    this.opens = readOpens(app.loadLocalStorage(STORAGE_KEY));
  }

  /** When the scene was last opened, or null if never on this device. */
  openedAt(sceneId: string): number | null {
    return this.opens.get(sceneId) ?? null;
  }

  /** Notes that the scene stored at `mapPath` was opened now. A file no scene record names is ignored. */
  async recordOpened(mapPath: string): Promise<void> {
    const scenes = await AssetService.getInstance(this.app).getAssets(undefined, 'scene');
    const scene = scenes.find((asset) => asset.data?.mapPath === mapPath);
    if (!scene) return;

    this.opens.set(scene.id, Date.now());
    while (this.opens.size > MAX_SCENES) {
      const oldest = [...this.opens].reduce((a, b) => (b[1] < a[1] ? b : a))[0];
      this.opens.delete(oldest);
    }
    this.app.saveLocalStorage(STORAGE_KEY, Object.fromEntries(this.opens));
    this.app.workspace.trigger('atlas-vtt:scene-opened', scene.id);
  }
}
