import { requireApiVersion, type Plugin } from 'obsidian';
import { isReleaseVersion } from '../changelog/version';
import type { SettingsService } from '../services/SettingsService';
import { obsidianFetch, readPublishedVersion } from './publishedVersion';
import { announceUpdate } from './updateNotice';
import { UPDATE_STORAGE_KEY, UpdateWatch } from './UpdateWatch';

/** After the layout, so a check never slows the start. */
const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 60 * 60 * 1000;

/** Looks for a newer Atlas once after start and then every hour, while the GM's switch is on. */
export function registerUpdateWatch(plugin: Plugin, settings: SettingsService): UpdateWatch {
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
  });
  app.workspace.onLayoutReady(() => {
    const first = window.setTimeout(() => void watch.check(), FIRST_CHECK_MS);
    plugin.register(() => window.clearTimeout(first));
    plugin.registerInterval(window.setInterval(() => void watch.check(), CHECK_EVERY_MS));
  });
  return watch;
}
