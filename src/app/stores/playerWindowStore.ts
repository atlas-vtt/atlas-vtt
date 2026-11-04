import { createStore, type StoreApi } from 'zustand/vanilla';

export interface PlayerWindowState {
  isOpen: boolean;
  isFrozen: boolean;
  /**
   * Scene tab whose map the open player window shows, or null while it is closed. The scene
   * players are shown is the presented scene (`presentedScene.ts`), which needs no window.
   */
  shownTabId: string | null;
  /** Whether the open player window is in full screen (`playerWindowDisplay.ts`); false while it is closed. */
  fullScreen: boolean;
  /** Whether a display other than the main Obsidian window's exists, for the TV; read while the player window is open, false while it is closed. */
  secondDisplay: boolean;
  /**
   * Whether the curtain is down: the player window shows black (`PlayerWindowService.setCurtain`).
   * A fact of the window for now; online play could read it to black out its players too.
   */
  curtain: boolean;
  /** Whether the player window shows an image handed out to players (`ImageDisplayService`). */
  imageShown: boolean;
}

export type PlayerWindowStore = StoreApi<PlayerWindowState>;

const INITIAL_STATE: PlayerWindowState = {
  isOpen: false,
  isFrozen: false,
  shownTabId: null,
  fullScreen: false,
  secondDisplay: false,
  curtain: false,
  imageShown: false,
};

/**
 * Reactive mirror of the player window's lifecycle, written by
 * `PlayerWindowService` and read by UI such as the scene tab bar.
 * A single module-level store matches the service's singleton lifetime.
 */
export const playerWindowStore: PlayerWindowStore = createStore<PlayerWindowState>(() => INITIAL_STATE);

export function resetPlayerWindowStore(): void {
  playerWindowStore.setState(INITIAL_STATE);
}
