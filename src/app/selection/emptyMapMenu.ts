import type { StoreApi } from 'zustand';
import { holdsMapClipboard, pasteClipboard } from '../clipboard/mapClipboardActions';
import { t } from '../i18n';
import { openContextMenuGlobal } from '../react/root/ContextMenuContext';
import type { ViewAtlasState } from '../storeFactory';
import { runInBackground } from '../utils/backgroundTask';
import type { SelectionAction } from './selectionActions';
import { selectionMenu } from './selectionMenu';
import { selectAllTokens } from './wholeSelection';

/**
 * What a finger held on the empty map offers, where a keyboard has Mod+V and Mod+A: pasting what
 * was copied at the point it was held on (`world`), and selecting every token the canvas shows
 * (`shown`).
 */
export function emptyMapActions(store: StoreApi<ViewAtlasState>, shown: { visibleTokenIds(): string[] } | null | undefined, world: { x: number; y: number }): SelectionAction[] {
  return [
    {
      kind: 'run', id: 'paste', enabled: holdsMapClipboard(), label: t('selection.pasteHere'), icon: 'clipboard-paste',
      run: () => runInBackground(pasteClipboard(store, world), 'Pasting map objects', 'Could not paste'),
    },
    { kind: 'run', id: 'select-all', enabled: true, label: t('hotkey.selectAll'), icon: 'box-select', run: () => selectAllTokens(store, shown) },
  ];
}

/** Opens the empty map's menu at `at` (a point of the window) in the GM's view; a players' view has none. */
export function openEmptyMapMenu(store: StoreApi<ViewAtlasState>, shown: { visibleTokenIds(): string[] } | null | undefined, world: { x: number; y: number }, at: { x: number; y: number }): void {
  const state = store.getState();
  if (state.isPlayerView || !state.isGMView || state.isMapLoading) return;
  openContextMenuGlobal(selectionMenu(emptyMapActions(store, shown, world)), at);
}
