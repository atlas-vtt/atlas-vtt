import { createStore, type StoreApi } from 'zustand/vanilla';
import type { PlayMode } from '../online/protocol/tableMode.ts';

export type { PlayMode };

/**
 * What the GM decides for everyone at the table, the player window and online players alike: the
 * curtain (players see black, and online players are sent no scene), a pause (the player window's
 * camera stays where it is, and online players' moves are refused), and how online players play.
 */
export interface TableControlsState {
  curtain: boolean;
  paused: boolean;
  /** Online players on their own maps (`table`), or each phone a remote for a map everyone watches (`remote`). */
  playMode: PlayMode;
  /** Whether an online table runs, so the player window bar shows without the player window too. */
  online: boolean;
}

/** One table per Obsidian window, as the player window service is one. */
export const tableControlsStore: StoreApi<TableControlsState> = createStore<TableControlsState>(() => ({ curtain: false, paused: false, playMode: 'table', online: false }));
