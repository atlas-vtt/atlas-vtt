import { requireApiVersion, type Plugin } from 'obsidian';
import { ATLAS_VIEW_TYPE } from '../atlasViewType';
import { isReleaseVersion } from '../changelog/version';
import type { SettingsService } from '../services/SettingsService';
import { playerWindowStore } from '../stores/playerWindowStore';
import { obsidianFetch, readPublishedVersion } from './publishedVersion';
import { announceUpdate } from './updateNotice';
import { UPDATE_HELD_STORAGE_KEY, UPDATE_STORAGE_KEY, UpdateWatch } from './UpdateWatch';

/** After the layout, so a check never slows the start. */
const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

/**
 * Looks for a newer Atlas once after start and then every hour, while the GM's switch is on. Its
 * notice waits while a map view (a deferred one too) or the player window is open or `tableRunning`.
 */
export function registerUpdateWatch(plugin: Plugin, settings: SettingsService, tableRunning: () => boolean): UpdateWatch {
  const { app } = plugin;
  const watch = new UpdateWatch({
    installed: plugin.manifest.version,
    readPublished: () => readPublishedVersion(obsidianFetch, requireApiVersion),
    enabled: () => settings.getSetting('checkForUpdates'),
    online: () => navigator.onLine,
    announced: {
      get: () => {
        const stored: unknown = app.loadLocalStorage(UPDATE_STORAGE_KEY);
        return isReleaseVersion(stored) ? stored : null;
      },
      set: (version) => { app.saveLocalStorage(UPDATE_STORAGE_KEY, version); },
    },
    announce: announceUpdate,
    inUse: () => app.workspace.getLeavesOfType(ATLAS_VIEW_TYPE).length > 0
      || playerWindowStore.getState().isOpen
      || tableRunning(),
    heldSince: {
      get: () => {
        const stored: unknown = app.loadLocalStorage(UPDATE_HELD_STORAGE_KEY);
        return typeof stored === 'number' && Number.isFinite(stored) ? stored : null;
      },
      set: (at) => { app.saveLocalStorage(UPDATE_HELD_STORAGE_KEY, at); },
    },
    now: () => Date.now(),
  });
  app.workspace.onLayoutReady(() => {
    const first = window.setTimeout(() => void watch.check(), FIRST_CHECK_MS);
    plugin.register(() => window.clearTimeout(first));
    plugin.registerInterval(window.setInterval(() => void watch.check(), CHECK_EVERY_MS));
    plugin.registerEvent(app.workspace.on('layout-change', () => watch.quietMoment()));
    plugin.register(playerWindowStore.subscribe(() => watch.quietMoment()));
  });
  return watch;
}
