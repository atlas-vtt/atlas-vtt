import type { App, TFile } from 'obsidian';
import type { AtlasView } from '../atlas-view';
import { ATLAS_VIEW_TYPE, isAtlasView } from '../atlasViewType';
import { storeLegacyResources } from '../resources/legacyResourcesMigration';
import { AssetService } from './AssetService';

/** The game master's open map views; the player view only mirrors them. */
export function openMapViews(app: App): AtlasView[] {
  return app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE)
    .map((leaf) => leaf.view)
    .filter((view): view is AtlasView => isAtlasView(view) && !view.getStore().getState().isPlayerView);
}

/**
 * The view whose store is bound to the scene at `path`, loaded or still loading. The store
 * decides, not the view's tab: a tab may name a scene that failed to open, while the store
 * is empty or still holds the scene before it.
 */
export function viewOnScene(app: App, path: string): AtlasView | undefined {
  return openMapViews(app).find((view) => view.getStore().getState().mapPath === path);
}

/** The map files of the collection's scenes. */
export function collectionMapFiles(app: App, collectionId: string, assets: AssetService = AssetService.getInstance(app)): TFile[] {
  return app.vault.getFiles()
    .filter((file) => file.extension === 'atlasmap' && assets.getCollectionForMap(file.path) === collectionId);
}

/**
 * Stores the resources of the collections saved before resources existed (`storeLegacyResources`),
 * reading their scenes for the secondary bar. Fails when a collection could not be read.
 */
export function storeLegacyCollectionResources(app: App, assets: AssetService = AssetService.getInstance(app)): Promise<void> {
  return storeLegacyResources(assets, (collectionId) =>
    Promise.all(collectionMapFiles(app, collectionId, assets).map((file) => app.vault.cachedRead(file))));
}

interface SceneUpdate {
  /** Changes an open map in its store; the view then saves it. */
  updateOpen: (view: AtlasView) => void;
  /** New content for a closed map file, or null when it does not change. */
  rewrite: (content: string) => string | null;
}

/**
 * Applies `update` to every scene of the collection: in the store of an open
 * map, which then saves itself, or in the map file. Returns the map files, so
 * callers can also update what lives beside them (e.g. scene snapshots).
 */
export async function updateCollectionScenes(app: App, collectionId: string, update: SceneUpdate): Promise<TFile[]> {
  const files = collectionMapFiles(app, collectionId);
  for (const file of files) {
    try {
      const rewriteFile = async (): Promise<void> => {
        if (update.rewrite(await app.vault.read(file)) !== null) {
          await app.vault.process(file, (latest) => update.rewrite(latest) ?? latest);
        }
      };
      const view = viewOnScene(app, file.path);
      if (!view) {
        await rewriteFile();
      } else if (view.getStore().getState().mapLoaded) {
        update.updateOpen(view);
        await view.saveMap();
      } else {
        // The scene is still loading: its load must not finish on the content from before
        await view.reloadActiveScene(rewriteFile);
      }
    } catch (error) {
      console.error(`[Atlas] Could not update scene ${file.path}:`, error);
    }
  }
  return files;
}
