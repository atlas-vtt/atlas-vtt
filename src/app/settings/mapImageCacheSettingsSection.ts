import { displayTooltip, type Setting } from 'obsidian';
import { formatByteSize } from '../utils/fileSize';
import type { AtlasSettingSection } from './settingSections';
import { getLocale, t } from '../i18n';

/** The device's cache of map tiles, as `TileDecoderClient` offers it. */
export interface MapImageCache {
  cacheSize(): Promise<number>;
  /** Clears all but the tiles of open maps; resolves with the bytes left. */
  clearCache(): Promise<number>;
}

/** The size of this device's map tile cache, and a button that clears it. */
export function mapImageCacheSettingsSection(cache: () => MapImageCache): AtlasSettingSection {
  return {
    heading: t('settings.storage.heading'),
    rows: [{
      name: t('settings.storage.mapImageCache'),
      aliases: ['cache', 'tiles', 'storage', 'disk', 'space', 'map images', 'clear'],
      render: (setting) => renderCacheRow(setting, cache),
    }],
  };
}

function renderCacheRow(setting: Setting, cache: () => MapImageCache): () => void {
  let open = true;
  const show = (text: string): void => {
    if (open) setting.setDesc(text);
  };
  const showSize = (bytes: number): void => show(formatByteSize(bytes, getLocale()));
  const showFailure = (error: unknown): void => {
    console.debug('[Atlas] The map image cache could not be read', error);
    show(t('settings.storage.unavailable'));
  };

  // Held until the size arrives, so the row keeps its height.
  setting.setDesc('\u2026');
  const info = t('settings.storage.mapImageCacheInfo');
  setting.addExtraButton((button) => {
    button.setIcon('info').setTooltip(info).onClick(() => displayTooltip(button.extraSettingsEl, info));
  });
  setting.addButton((button) => {
    button.setButtonText(t('settings.storage.clear')).onClick(async () => {
      button.setDisabled(true);
      try {
        showSize(await cache().clearCache());
      } catch (error) {
        showFailure(error);
      } finally {
        button.setDisabled(false);
      }
    });
  });
  cache().cacheSize().then(showSize, showFailure);
  return () => {
    open = false;
  };
}
