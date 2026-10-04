import type { App, TFile } from 'obsidian';
import type { ViewAtlasState } from '../../storeFactory';
import type { NotePin } from '../../types';

/** What the pin tool's note search shows an add-on. */
export interface PinSearchContext {
  app: App;
  /** The text typed so far (no `#heading` part). */
  query: string;
  /** Every note and map the search lists from. */
  files: readonly TFile[];
  /** The map the pin goes on. */
  mapPath: string | null;
}

/** An extra result of the pin search, listed after the matching notes. */
export interface PinSearchEntry {
  label: string;
  /** Lucide icon id. */
  icon: string;
  cls?: string;
  /** Runs when picked; resolves to the note path the pin links to. */
  pick(): Promise<string>;
}

/** Who looks at the pins: the GM, or the players (player views and the GM's player preview). */
export type PinViewer = 'gm' | 'players';

export interface PinAddonHooks {
  pinSearchEntries?(context: PinSearchContext): PinSearchEntry[];
  /** World scale of a pin at `zoom`; undefined leaves the default readable screen size. */
  pinScale?(pin: NotePin, zoom: number, state: ViewAtlasState): number | undefined;
  /**
   * Whether `viewer` sees the pin at `zoom`; undefined leaves the default
   * (the GM sees every pin, players none). The first add-on with an answer decides.
   */
  pinVisible?(pin: NotePin, viewer: PinViewer, zoom: number, state: ViewAtlasState): boolean | undefined;
}
