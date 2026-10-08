import { AtlasView, ATLAS_VIEW_TYPE } from '../app/atlas-view';
import { REMOTE_VIEW_TYPE } from '../app/remote-view/remoteViewType';
import type { ViewHooks } from './viewTracker';

/** The real recognition of Atlas's map views; kept apart so `ViewTracker` itself loads none of the view's code. */
export const ATLAS_VIEW_HOOKS: ViewHooks = {
  viewTypes: [ATLAS_VIEW_TYPE, REMOTE_VIEW_TYPE],
  isMapView: (view): view is AtlasView => view instanceof AtlasView,
  activeView: (app) => app.workspace.getActiveViewOfType(AtlasView),
};
