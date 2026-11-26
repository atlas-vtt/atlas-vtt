import type { ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';
import { pinActions } from '../selection/pinActionList';
import { selectionMenu } from '../selection/selectionMenu';
import type { ViewAtlasStore } from '../storeFactory';
import type { NotePin } from '../types';

/** The rows of a pin's context menu (`pinActions`); the level its scene opens on is added when the menu opens (`openPinMenu`). */
export function pinMenuEntries(store: ViewAtlasStore, pin: NotePin, at?: { x: number; y: number }): ContextMenuEntry[] {
  return selectionMenu(pinActions(store, pin, at));
}
