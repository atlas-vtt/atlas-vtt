import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { bindHoldHotkey } from '../../keyboard/holdHotkey';
import { DEFAULT_MAP_HOTKEYS } from '../../keyboard/mapHotkeys';
import { SettingsService } from '../../services/SettingsService';
import { onLeavingView } from '../viewLeaving';

export interface LightingSceneEvents {
  eventBus: EventEmitter;
  obsApp: App;
  viewId: string;
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
export function listenToLightingSceneEvents({ eventBus, obsApp, viewId, resetExplored, revealExplored, peek, stopEditing, beforeMapUnload }: LightingSceneEvents): Array<() => void> {
  const peekKey = (): string => (SettingsService.forApp(obsApp)?.getHotkeys() ?? DEFAULT_MAP_HOTKEYS).lightingPeek;
  // Editing stops before what is pending of the scene is saved, so it is registered first.
  const cleanups: Array<() => void> = [bindHoldHotkey(window, peekKey, viewId, peek), onLeavingView({ eventBus, obsApp, viewId }, stopEditing)];
  const on = (event: string, handler: () => void): void => {
    eventBus.on(event, handler);
    cleanups.push(() => eventBus.off(event, handler));
  };
  on('lighting-reset-explored', resetExplored);
  on('lighting-reveal-explored', revealExplored);
  on('map-unloading', beforeMapUnload);
  return cleanups;
}
