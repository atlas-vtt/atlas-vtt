import type { App } from 'obsidian';
import { openRemoteView } from '../app/remote-view/openRemoteView';
import type { ExtensionScope } from './extension';
import type { ViewTracker } from './viewTracker';
import type { RemoteView, RemoteViewsApi } from './types/remoteViews';

/** Remote views owned by `scope`: each closes when the extension or Atlas unloads, and a closed one is let go. */
export function remoteViewsApi(app: App, scope: Pick<ExtensionScope, 'id' | 'disposers'>, tracker: ViewTracker): RemoteViewsApi {
  const owned = new WeakSet<RemoteView>();
  return Object.freeze({
    open: async (options: { title: string; icon?: string; reuse?: boolean; maxDice?: number }): Promise<RemoteView> => {
      const handle = await openRemoteView(app, scope.id, options);
      const view = handle.openView;
      if (!view) throw new Error('[Atlas API] remoteViews.open: the remote view closed while it opened.');
      // Seen by `views`, `lasers` and the rest at once, before any layout change.
      tracker.adopt(view);
      const api = handle.api;
      // A view revealed again with `reuse` is already owned.
      if (!owned.has(api)) {
        owned.add(api);
        const dispose = scope.disposers.add(() => api.close());
        api.onClose(dispose);
      }
      return api;
    },
  });
}
