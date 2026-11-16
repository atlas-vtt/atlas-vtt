import type { App, Plugin } from 'obsidian';
import { t } from '../i18n';
import { AssetService, type Asset, type CollectionMetadata } from '../services/AssetService';
import { isStarterTokenId } from '../services/starterTokens';
import { showNotice } from '../ui/notice';
import { runInBackground } from '../utils/backgroundTask';

/** Device-local: Obsidian Sync's selective sync is set per device, so each device that leaves the files out says so once. */
const NOTICE_SHOWN_KEY = 'atlas-vtt:sync-file-types-notice';

/** Obsidian Sync reads its settings after the layout, and a start is busy enough without this. */
const CHECK_AFTER_MS = 15_000;

/**
 * Paths of the kinds of file a library's records and scenes are. They lie in a folder nobody excludes,
 * so the answer is about the file type alone: a GM who excluded Atlas' folder chose that.
 */
const LIBRARY_FILE_KINDS = ['atlas-vtt-file-type/scene.atlasmap', 'atlas-vtt-file-type/record.json'];

/**
 * Whether Obsidian Sync is set up on this device and its selective sync leaves out `.atlasmap` and
 * `.json` ("Sync all other types", off by default). Asks Sync's own filter, undocumented API that
 * only ever answers false here when it says so outright: anything else about it reads as no.
 */
export function syncLeavesOutLibraryFiles(app: App): boolean {
  try {
    const sync = app.internalPlugins?.getEnabledPluginById?.('sync');
    // Until `dataLoaded` the filter holds Sync's defaults, whatever this device has set.
    if (sync?.dataLoaded !== true || typeof sync.vaultId !== 'string' || !sync.vaultId) return false;
    const filter = sync.filter;
    if (typeof filter?.allowSyncFile !== 'function') return false;
    return LIBRARY_FILE_KINDS.some((path) => filter.allowSyncFile?.(path, false) === false);
  } catch {
    return false;
  }
}

/** Whether a device holds more than every vault starts with: another device's folders and art arrive even where the records do not. */
export function holdsOwnLibrary(assets: readonly Asset[], collections: readonly CollectionMetadata[]): boolean {
  return collections.length > 1 || assets.some((asset) => !isStarterTokenId(asset.id));
}

/** Tells the GM once on this device that Obsidian Sync leaves out the files scenes and maps are made of. */
export function registerObsidianSyncNotice(plugin: Plugin): void {
  const { app } = plugin;
  const check = async (): Promise<void> => {
    if (app.loadLocalStorage(NOTICE_SHOWN_KEY) || !syncLeavesOutLibraryFiles(app)) return;
    const assets = AssetService.getInstance(app);
    await assets.vaultChecked();
    if (!holdsOwnLibrary(await assets.getAssets(), await assets.getCollections())) return;
    showNotice(t('map.syncLeavesOutFiles'), 0);
    app.saveLocalStorage(NOTICE_SHOWN_KEY, true);
  };
  app.workspace.onLayoutReady(() => {
    const timer = window.setTimeout(() => runInBackground(check(), 'Checking what Obsidian Sync carries'), CHECK_AFTER_MS);
    plugin.register(() => window.clearTimeout(timer));
  });
}
