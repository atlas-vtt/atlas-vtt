import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { rewriteCollectionSnapshots } from '../snapshots/sceneSnapshotFolders';
import { runUntracked } from '../stores/history';
import { withoutWidget } from '../utils/collectionWidgets';
import { AssetService } from './AssetService';
import { updateCollectionScenes } from './collectionScenes';
import { dropWidgetsFromJson } from './sceneWidgetFiles';
import { WidgetSyncService } from './WidgetSyncService';

function removeFromOpenView(view: AtlasView, widgetId: string): void {
  const store = view.getStore();
  const { widgets, offWidgets } = store.getState().widgetSettings;
  if (!widgets[widgetId] && !offWidgets?.includes(widgetId)) return;
  // Not an undo step: undoing it would bring back a widget the collection no longer has.
  runUntracked(store, () => store.getState().removeWidget(widgetId));
}

/**
 * Deletes a widget from its collection: first from every scene that holds it
 * or switched it off (open maps, map files and scene snapshots), then from the
 * library, so no scene that loads later brings it back.
 */
export async function deleteCollectionWidget(app: App, collectionId: string, widgetId: string): Promise<void> {
  const rewrite = (content: string): string | null => dropWidgetsFromJson(content, (id) => id === widgetId);
  await updateCollectionScenes(app, collectionId, { updateOpen: (view) => removeFromOpenView(view, widgetId), rewrite });
  await rewriteCollectionSnapshots(app, collectionId, rewrite);

  const sync = WidgetSyncService.forApp(app);
  if (sync) {
    sync.editCollectionWidgets(collectionId, (widgets) => withoutWidget(widgets, widgetId));
  } else {
    const assets = AssetService.getInstance(app);
    const widgets = assets.getCollectionSettings(collectionId).widgets ?? {};
    await assets.updateCollectionSettings(collectionId, { widgets: withoutWidget(widgets, widgetId) });
  }
}
