import type { AtlasView } from '../atlas-view';
import { playerOverlaySources } from '../services/playerOverlaySources';
import { TableMode } from './TableMode';

/** Table mode for a map view: it begins and ends with the view's store, and ends for good with `destroy`. */
export function viewTableMode(view: AtlasView): TableMode {
  const { app, leaf } = view;
  const renderers = view.serviceManager.getRendererService();
  return new TableMode({
    app,
    root: view.containerEl,
    store: view.atlasStore,
    settings: view.serviceManager.getSettingsService(),
    viewport: () => renderers.getViewport(),
    overlaySources: () => {
      const renderer = renderers.getRenderer();
      return renderer ? playerOverlaySources(view, renderer) : null;
    },
    onLeafLeft: (left) => {
      const change = app.workspace.on('active-leaf-change', (active) => {
        if (active !== leaf) left();
      });
      return () => app.workspace.offref(change);
    },
  });
}

/** Switches the view between Table mode and the GM's view. */
export function toggleTableMode(view: AtlasView): void {
  const state = view.atlasStore.getState();
  if (state.tableMode) state.leaveTableMode();
  else state.enterTableMode();
}
