/**
 * Where hosts outside a note view (the template editor) read and set the
 * statblock panel's width, so it is the one the user chose beside their notes.
 * `NoteStatblockPanels` registers itself while Atlas runs; without it the
 * stored choices are read directly (`panelPrefs.ts`).
 */

import type { App } from 'obsidian';
import type { PanelPrefs } from './panelPrefs';

export interface PanelPrefsSource {
  /** The device's choices, with the width of an edge being dragged. */
  panelPrefs(): PanelPrefs;
  /** Sets the width from another host's edge; `done` stores it for every view. */
  setPanelWidth(width: number, done: boolean): void;
  resetPanelWidth(): void;
  /** Calls `listener` whenever the stored choices change; returns the unsubscribe. */
  onPrefsChange(listener: () => void): () => void;
}

const sources = new WeakMap<App, PanelPrefsSource>();

export function setPanelPrefsSource(app: App, source: PanelPrefsSource | null): void {
  if (source) sources.set(app, source);
  else sources.delete(app);
}

export function panelPrefsSource(app: App): PanelPrefsSource | null {
  return sources.get(app) ?? null;
}
