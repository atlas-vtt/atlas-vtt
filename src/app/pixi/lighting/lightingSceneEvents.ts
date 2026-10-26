import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { bindHoldHotkey } from '../../keyboard/holdHotkey';
import { DEFAULT_MAP_HOTKEYS } from '../../keyboard/mapHotkeys';
import { SettingsService } from '../../services/SettingsService';
import { findAtlasLeafByViewId } from '../../utils/atlasLeafLookup';
import { followWindow } from '../../utils/followWindow';

export interface LightingSceneEvents {
  eventBus: EventEmitter;
  obsApp: App;
  viewId: string;
  /** The map's canvas: the peek key is heard on its window, which a popout has of its own. */
  canvas: HTMLElement;
  /** The GM asked to forget the explored memory. */
  resetExplored: () => void;
  /** The GM asked to mark the whole map as explored. */
  revealExplored: () => void;
  /** The key that shows the players' lighting (`lightingPeek`) was pressed or let go. */
  peek: (held: boolean) => void;
  /** Ends whatever is being edited: a drag, a zone half drawn, a stroke, an open popover. */
  stopEditing: () => void;
  /** The scene is about to go: what is pending of it is saved first. */
  beforeMapUnload: () => void;
}

/**
 * What the lighting hears from outside the store: the requests to forget the explored memory
 * and to mark all of it explored, the peek key,
 * the scene unloading, and another Obsidian tab coming to the front (by a key, without a press
 * that would close a popover). Returns what stops listening.
 */
export function listenToLightingSceneEvents({ eventBus, obsApp, viewId, canvas, resetExplored, revealExplored, peek, stopEditing, beforeMapUnload }: LightingSceneEvents): Array<() => void> {
  const peekKey = (): string => (SettingsService.forApp(obsApp)?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS).lightingPeek;
  const cleanups: Array<() => void> = [followWindow(canvas, (win) => bindHoldHotkey(win, peekKey, viewId, peek))];
  const on = (event: string, handler: () => void): void => {
    eventBus.on(event, handler);
    cleanups.push(() => eventBus.off(event, handler));
  };
  on('lighting-reset-explored', resetExplored);
  on('lighting-reveal-explored', revealExplored);
  on('map-unloading', () => {
    stopEditing();
    beforeMapUnload();
  });
  const leafChange = obsApp.workspace.on('active-leaf-change', (leaf) => {
    if (leaf !== findAtlasLeafByViewId(obsApp.workspace, viewId)) stopEditing();
  });
  cleanups.push(() => obsApp.workspace.offref(leafChange));
  return cleanups;
}
