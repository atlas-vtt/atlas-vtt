import type { App } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { showResourcesInJson } from '../resources/sceneVisibility';
import { rewriteCollectionSnapshots } from '../snapshots/sceneSnapshotFolders';
import { DEFAULT_TOKEN_SETTINGS } from '../storeFactory';
import { updateCollectionScenes } from './collectionScenes';

function showInOpenView(view: AtlasView, keys: readonly string[]): void {
  const { tokenSettings, setTokenSettings } = view.getStore().getState();
  const hidden = tokenSettings.hiddenResources ?? [];
  if (hidden.some((key) => keys.includes(key))) {
    setTokenSettings({ ...tokenSettings, hiddenResources: hidden.filter((key) => !keys.includes(key)) });
  }
}

/** Shows the resources `keys` on every scene of the collection: in the stores of open maps, in map files and in scene snapshots, which a restore would hide them from again. */
export async function showBarsOnCollectionScenes(app: App, collectionId: string, keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const rewrite = (content: string): string | null => showResourcesInJson(content, keys, DEFAULT_TOKEN_SETTINGS);
  await updateCollectionScenes(app, collectionId, { updateOpen: (view) => showInOpenView(view, keys), rewrite });
  await rewriteCollectionSnapshots(app, collectionId, rewrite);
}
