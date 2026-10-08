import type { ViewContext } from '../../api/types/ui';

/** What a slot callback reads of a view's store: whether it is a player view, and whether it is a remote view (a remote part). */
export interface ViewContextState {
  isPlayerView?: boolean;
  remoteView?: object | null;
}

/** What every slot callback is told about a map view; a new object each call, frozen. */
export function viewContextOf(view: { viewId: string }, store: { getState(): ViewContextState }): ViewContext {
  const state = store.getState();
  const kind = state.remoteView ? 'remote' : 'map';
  return Object.freeze({ viewId: view.viewId, kind, isPlayerView: state.isPlayerView === true });
}
