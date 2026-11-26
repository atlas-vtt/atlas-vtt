import type { Plugin } from 'obsidian';
import { TesseraDecoderClient } from '../pixi/mosaicCanvas/TesseraDecoderClient';
import { deviceProfile } from '../platform/deviceProfile';
import { askForPersistentStorage, holdWhileHidden } from '../platform/foregroundWork';
import { AssetService } from '../services/AssetService';
import { AssetThumbnailService } from '../services/AssetThumbnailService';

/** Set once this device was asked to keep Atlas' storage. */
const PERSIST_ASKED_KEY = 'atlas-vtt:storage-persist-asked';

/**
 * A tablet's web view is ended without a word for what it holds while nobody looks at it. So there
 * map tiles are built and thumbnails made only while Obsidian is seen: both wait where they stand
 * and go on when it comes back. The system is also asked, once, to keep the tile cache.
 */
export function registerForegroundWork(plugin: Plugin): void {
  if (deviceProfile().memoryClass !== 'mobile') return;
  const { app } = plugin;
  plugin.register(holdWhileHidden(activeDocument, (held) => {
    TesseraDecoderClient.forApp(app).holdBuilds(held);
    AssetThumbnailService.getInstance(app, AssetService.getInstance(app)).hold(held);
  }));
  askForPersistentStorage(
    typeof navigator === 'undefined' ? undefined : navigator.storage,
    () => app.loadLocalStorage(PERSIST_ASKED_KEY) === true,
    () => app.saveLocalStorage(PERSIST_ASKED_KEY, true),
  );
}
