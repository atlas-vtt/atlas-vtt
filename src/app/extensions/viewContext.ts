import type { ViewContext } from '../../api/types/ui';

/** What a slot callback reads of a view's store: whether it is a player view. */
export interface ViewContextState {
  isPlayerView?: boolean;
}

/** What every slot callback is told about a map view; a new object each call, frozen. */
export function viewContextOf(view: { viewId: string }, store: { getState(): ViewContextState }): ViewContext {
  const state = store.getState();
  return Object.freeze({ viewId: view.viewId, kind: 'map', isPlayerView: state.isPlayerView === true });
}
