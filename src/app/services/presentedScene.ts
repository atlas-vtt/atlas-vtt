import type { App } from 'obsidian';

/** The scene tab players are shown: picked with the eye on a scene tab or "Send current map to player view". */
export interface PresentedScene {
  /** The scene tab, as its Atlas view's tabs name it (tab ids are saved with the view). */
  readonly tabId: string;
  /** The tab's map file, which finds the scene again when no open tab has the id. */
  readonly filePath: string;
}

/** The presented scene for code that only reads it, such as the eye on each scene tab. */
export interface PresentedSceneSource {
  /** The presented scene, or null while nothing is presented. */
  get(): PresentedScene | null;
  /** Calls `listener` with every change of the presented scene; returns the call that stops it. */
  onChange(listener: (scene: PresentedScene | null) => void): () => void;
}

type DeviceStorage = Pick<App, 'loadLocalStorage' | 'saveLocalStorage'>;

/** Local storage key: which scene this device shows its players is a fact about this device. */
export const PRESENTED_SCENE_KEY = 'atlas-vtt-presented-scene';

const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

/** A presented scene read from storage, or null for anything that is none. */
export function readPresentedScene(value: unknown): PresentedScene | null {
  if (typeof value !== 'object' || value === null) return null;
  const tabId: unknown = 'tabId' in value ? value.tabId : undefined;
  const filePath: unknown = 'filePath' in value ? value.filePath : undefined;
  return isText(tabId) && isText(filePath) ? { tabId, filePath } : null;
}

/**
 * The scene this device presents to its players. It does not depend on the player window:
 * presenting works the same whether the window is open or not, and the window shows the
 * presented scene whenever it is open. Kept in the vault's local storage, never synced, so a
 * reload keeps it and another device presents its own.
 */
export class PresentedSceneStore implements PresentedSceneSource {
  private scene: PresentedScene | null;
  private readonly listeners = new Set<(scene: PresentedScene | null) => void>();

  constructor(private readonly storage: DeviceStorage) {
    this.scene = this.read();
  }

  get(): PresentedScene | null {
    return this.scene;
  }

  onChange(listener: (scene: PresentedScene | null) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Present `scene`, or nothing for null. Only the presenter calls this. */
  set(scene: PresentedScene | null): void {
    const next = scene ? { tabId: scene.tabId, filePath: scene.filePath } : null;
    if (next?.tabId === this.scene?.tabId && next?.filePath === this.scene?.filePath) return;
    this.scene = next;
    this.write(next);
    this.listeners.forEach((listener) => listener(next));
  }

  private read(): PresentedScene | null {
    try {
      return readPresentedScene(this.storage.loadLocalStorage(PRESENTED_SCENE_KEY));
    } catch (error) {
      console.error('[Atlas] Could not read the presented scene', error);
      return null;
    }
  }

  private write(scene: PresentedScene | null): void {
    try {
      this.storage.saveLocalStorage(PRESENTED_SCENE_KEY, scene);
    } catch (error) {
      console.error('[Atlas] Could not save the presented scene', error);
    }
  }
}

const stores = new WeakMap<object, PresentedSceneStore>();

/** The presented scene of `app`'s vault on this device, read from local storage on first use. */
export function presentedSceneOf(app: DeviceStorage): PresentedSceneStore {
  let store = stores.get(app);
  if (!store) {
    store = new PresentedSceneStore(app);
    stores.set(app, store);
  }
  return store;
}
