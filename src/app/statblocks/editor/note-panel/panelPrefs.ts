/**
 * How the statblock beside a note is shown on this device: the width the
 * user chose by dragging its edge, if any. Stored
 * with `app.saveLocalStorage` (per vault and device, never synced), since what
 * fits depends on the screen. Without a chosen width each view works out its
 * own default from the room it has (`defaultPanelWidth`).
 */

import type { App } from 'obsidian';

/** The narrowest panel; the card's one column needs about this much. */
export const MIN_PANEL_WIDTH = 360;
/** What the note keeps beside the panel at least; the stylesheet's clamp says the same (`$note-min-width`). */
export const NOTE_MIN_WIDTH = 360;
/** Below this width of the view the panel stands above the note instead of beside it. */
export const STACK_BELOW = 720;
/** The widest default: two card columns of a comfortable measure. A width the user drags may be wider. */
export const DEFAULT_MAX_WIDTH = 960;

const STORAGE_KEY = 'atlas-vtt-statblock-panel';

export interface PanelPrefs {
  /** The width the user dragged the panel to; null while each view takes its default. */
  width: number | null;
}

/** The room a view gives the note and its statblock. */
export interface NoteRoom {
  /** The width of the view's content, which the panel shares with the note. */
  available: number;
  /**
   * What the note's text takes with readable line width on (the line and the
   * margins beside it); null while it is off and the text fills any width.
   */
  readableLine: number | null;
}

/** The width a panel may take in a view of `available` pixels: at least the minimum, leaving the note its room. */
export function clampPanelWidth(width: number, available: number): number {
  const max = Math.max(MIN_PANEL_WIDTH, available - NOTE_MIN_WIDTH);
  return Math.round(Math.min(Math.max(width, MIN_PANEL_WIDTH), max));
}

/**
 * The width a panel starts with: half of the view, or everything a readable
 * line leaves empty when that is more, up to `DEFAULT_MAX_WIDTH`, so the
 * card's two columns appear wherever the note does not use the room.
 */
export function defaultPanelWidth({ available, readableLine }: NoteRoom): number {
  const unused = readableLine === null ? 0 : available - readableLine;
  return clampPanelWidth(Math.min(DEFAULT_MAX_WIDTH, Math.max(available / 2, unused)), available);
}

/** The panel's width in a view: the one the user chose, else the view's default; either clamped to the room. */
export function panelWidth(prefs: Pick<PanelPrefs, 'width'>, room: NoteRoom): number {
  return prefs.width === null ? defaultPanelWidth(room) : clampPanelWidth(prefs.width, room.available);
}

/**
 * The stored choices; the defaults for anything missing or not a value this
 * version reads. Earlier builds stored a `width` even when nobody dragged;
 * only `chosenWidth` is a width the user chose.
 */
export function loadPanelPrefs(app: App): PanelPrefs {
  const stored: unknown = app.loadLocalStorage(STORAGE_KEY);
  const record = stored !== null && typeof stored === 'object' ? stored as Record<string, unknown> : {};
  const { chosenWidth } = record;
  return {
    width: typeof chosenWidth === 'number' && Number.isFinite(chosenWidth) ? Math.max(MIN_PANEL_WIDTH, Math.round(chosenWidth)) : null,
  };
}

export function savePanelPrefs(app: App, prefs: PanelPrefs): void {
  app.saveLocalStorage(STORAGE_KEY, { chosenWidth: prefs.width });
}
