import type { EventEmitter } from 'events';
import type { App } from 'obsidian';
import { findAtlasLeafByViewId } from '../utils/atlasLeafLookup';

export interface ViewLeavingSource {
  eventBus: EventEmitter;
  obsApp: App;
  viewId: string;
}

/**
 * Calls `stop` whenever what a map tool edits in view `viewId` can no longer be looked at: its scene
 * unloads (another scene loads, the view closes), or another Obsidian tab comes to the front, also by
 * a key, without the press that would close a popover. Returns what stops listening.
 */
export function onLeavingView({ eventBus, obsApp, viewId }: ViewLeavingSource, stop: () => void): () => void {
  eventBus.on('map-unloading', stop);
  const leafChange = obsApp.workspace.on('active-leaf-change', (leaf) => {
    if (leaf !== findAtlasLeafByViewId(obsApp.workspace, viewId)) stop();
  });
  return () => {
    eventBus.off('map-unloading', stop);
    obsApp.workspace.offref(leafChange);
  };
}
