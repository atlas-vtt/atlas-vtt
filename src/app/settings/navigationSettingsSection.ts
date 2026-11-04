import type { NavigationInputMode, SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';
import { t } from '../i18n';

const MODE_LABELS: Record<NavigationInputMode, string> = {
  mouse: t('settings.navigation.mouse'),
  trackpad: t('settings.navigation.trackpad'),
};

const MODE_HINTS: Record<NavigationInputMode, string> = {
  mouse: t('settings.navigation.mouseHint'),
  trackpad: t('settings.navigation.trackpadHint'),
};

/** Map navigation options. */
export function navigationSettingsSection(settingsService: SettingsService): AtlasSettingSection {
  return {
    heading: t('settings.navigation.heading'),
    rows: [{
      name: t('settings.navigation.inputDevice'),
      desc: MODE_HINTS[settingsService.getNavigationSettings().inputMode],
      aliases: ['mouse', 'trackpad', 'zoom', 'pan'],
      render: (setting) => {
        setting.addDropdown((dropdown) => {
          dropdown
            .addOptions(MODE_LABELS)
            .setValue(settingsService.getNavigationSettings().inputMode)
            .onChange((value) => {
              const inputMode = value as NavigationInputMode;
              settingsService.setNavigationSettings({ inputMode });
              setting.setDesc(MODE_HINTS[inputMode]);
            });
        });
      },
    }],
  };
}
