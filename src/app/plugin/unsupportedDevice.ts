import type { Plugin } from 'obsidian';
import { t } from '../i18n';
import type { DeviceSupport } from '../platform/deviceSupport';
import { AtlasSettingTab } from '../settings/AtlasSettingTab';
import { showNotice } from '../ui/notice';

/** Set once this device was told why Atlas does not run on it: a notice at every start would only be in the way. */
const TOLD_STORAGE_KEY = 'atlas-vtt:unsupported-device-told';

function reasonText(support: Exclude<DeviceSupport, 'supported'>): string {
  return support === 'phone' ? t('notice.needsTablet') : t('notice.systemTooOld');
}

/**
 * All of Atlas on a device it does not run on (a phone, a tablet whose system is older than its
 * workers need): one notice, the first time, and a settings tab that says the same. Nothing else is
 * registered, so no view, command or worker of Atlas ever starts there.
 */
export function registerUnsupportedDevice(plugin: Plugin, support: Exclude<DeviceSupport, 'supported'>): void {
  const reason = reasonText(support);
  plugin.addSettingTab(new AtlasSettingTab(plugin.app, plugin, () => [
    { heading: plugin.manifest.name, rows: [{ name: reason, render: () => undefined }] },
  ]));
  plugin.app.workspace.onLayoutReady(() => {
    if (plugin.app.loadLocalStorage(TOLD_STORAGE_KEY) === support) return;
    plugin.app.saveLocalStorage(TOLD_STORAGE_KEY, support);
    showNotice(reason);
  });
}
