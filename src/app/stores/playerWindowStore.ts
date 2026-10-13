import { createStore, type StoreApi } from 'zustand/vanilla';

export interface PlayerWindowState {
  isOpen: boolean;
  isFrozen: boolean;
  /**
   * Scene tab whose map the open player window shows, or null while it is closed. The scene
   * players are shown is the presented scene (`presentedScene.ts`), which needs no window.
   */
  shownTabId: string | null;
}

export type PlayerWindowStore = StoreApi<PlayerWindowState>;

const INITIAL_STATE: PlayerWindowState = {
  isOpen: false,
  isFrozen: false,
  shownTabId: null,
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
