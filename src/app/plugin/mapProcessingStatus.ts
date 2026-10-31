import type { Plugin } from 'obsidian';
import { t } from '../i18n';
import { levelBackground } from '../levels/levelEdits';
import { viewedLevelId } from '../levels/sceneLevels';
import { MapProcessing, processingPercent } from '../pixi/mosaicCanvas/mapProcessing';
import type { ViewAtlasStore } from '../storeFactory';
import { getLoadedAtlasView } from './atlasLeaves';

interface WatchedStore {
  store: ViewAtlasStore;
  stop: () => void;
}

const shownImage = (state: ReturnType<ViewAtlasStore['getState']>): string | null => levelBackground(state, viewedLevelId(state));

/**
 * "Processing map · 43%" in Obsidian's status bar while the image of the scene the Atlas view
 * shows is still being cut into tesserae: the scene opens and works meanwhile, only softer until its
 * tesserae land. One item, since only one Atlas view exists, in the main window. Gone once done.
 */
export function registerMapProcessingStatus(plugin: Plugin): void {
  const { app } = plugin;
  const processing = MapProcessing.forApp(app);
  const item = plugin.addStatusBarItem();
  item.addClass('atlas-map-processing-status');
  item.hide();

  let watched: WatchedStore | null = null;
  let shownPath: string | null = null;
  let text: string | null = null;

  const render = (): void => {
    const state = shownPath ? processing.stateOf(shownPath) : null;
    const next = state ? t('map.processing', { percent: processingPercent(state) }) : null;
    if (next === text) return;
    text = next;
    if (next === null) {
      item.hide();
      return;
    }
    item.setText(next);
    item.show();
  };

  const follow = (): void => {
    const store = getLoadedAtlasView(app)?.getStore() ?? null;
    if (watched?.store === store) return;
    watched?.stop();
    watched = store && {
      store,
      stop: store.subscribe(shownImage, (path) => {
        shownPath = path;
        render();
      }),
    };
    shownPath = store ? shownImage(store.getState()) : null;
    render();
  };

  plugin.registerEvent(app.workspace.on('layout-change', follow));
  plugin.registerEvent(app.workspace.on('active-leaf-change', follow));
  plugin.register(processing.subscribe(render));
  plugin.register(() => watched?.stop());
  follow();
}
