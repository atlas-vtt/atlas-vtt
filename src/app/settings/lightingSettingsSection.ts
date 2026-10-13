import { isLightingQualityLevel, type LightingQualityLevel } from '../lighting/lightingQuality';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';
import { t } from '../i18n';

const LEVEL_LABELS: Record<LightingQualityLevel, string> = {
  high: t('settings.lighting.high'),
  balanced: t('settings.lighting.balanced'),
  saver: t('settings.lighting.saver'),
};

const LEVEL_HINTS: Record<LightingQualityLevel, string> = {
  high: t('settings.lighting.highHint'),
  balanced: t('settings.lighting.balancedHint'),
  saver: t('settings.lighting.saverHint'),
};

/** How much dynamic lighting asks of this device's graphics; only while dynamic lighting is switched on. */
export function lightingSettingsSections(settings: SettingsService): AtlasSettingSection[] {
  if (!settings.isExperimentalOn('dynamicLighting')) return [];
  return [{
    heading: t('settings.lighting.heading'),
    rows: [{
      name: t('settings.lighting.quality'),
      desc: LEVEL_HINTS[settings.getLightingQuality()],
      aliases: ['lighting', 'quality', 'performance', 'battery', 'graphics', 'gpu', 'bounce', 'flicker'],
      render: (setting) => {
        setting.addDropdown((dropdown) => {
          dropdown
            .addOptions(LEVEL_LABELS)
            .setValue(settings.getLightingQuality())
            .onChange((value) => {
              if (!isLightingQualityLevel(value)) return;
              settings.setLightingQuality(value);
              setting.setDesc(LEVEL_HINTS[value]);
            });
        });
      },
    }],
  }];
}
