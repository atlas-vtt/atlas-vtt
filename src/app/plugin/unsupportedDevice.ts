import type { Plugin } from 'obsidian';
import { t } from '../i18n';
import { AtlasSettingTab } from '../settings/AtlasSettingTab';
import { showNotice } from '../ui/notice';

/** Set once this device was told why Atlas does not run on it: a notice at every start would only be in the way. */
const TOLD_STORAGE_KEY = 'atlas-vtt:unsupported-device-told';

/**
 * All of Atlas on a device whose system is older than its workers need: one notice, the first time,
 * and a settings tab that says the same. Nothing else is registered, so no view, command or worker
 * of Atlas ever starts there.
 */
export function registerUnsupportedDevice(plugin: Plugin): void {
  const reason = t('notice.systemTooOld');
  plugin.addSettingTab(new AtlasSettingTab(plugin.app, plugin, () => [
    { heading: plugin.manifest.name, rows: [{ name: reason, render: () => undefined }] },
  ]));
  plugin.app.workspace.onLayoutReady(() => {
    if (plugin.app.loadLocalStorage(TOLD_STORAGE_KEY) === true) return;
    plugin.app.saveLocalStorage(TOLD_STORAGE_KEY, true);
    showNotice(reason);
  });
}
