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

/** What the level in effect does, and whether Atlas picked it for this device. */
function qualityDesc(settings: SettingsService): string {
  const hint = LEVEL_HINTS[settings.getLightingQuality()];
  return settings.isLightingQualityPicked() ? t('settings.lighting.picked', { hint }) : hint;
}

/** How much dynamic lighting asks of this device's graphics: the level in effect, also the one Atlas picked. */
export function lightingSettingsSection(settings: SettingsService): AtlasSettingSection {
  return {
    heading: t('settings.lighting.heading'),
    rows: [{
      name: t('settings.lighting.quality'),
      desc: qualityDesc(settings),
      aliases: ['lighting', 'quality', 'performance', 'battery', 'graphics', 'gpu', 'bounce', 'flicker'],
      render: (setting) => {
        setting.addDropdown((dropdown) => {
          dropdown
            .addOptions(LEVEL_LABELS)
            .setValue(settings.getLightingQuality())
            .onChange((value) => {
              if (!isLightingQualityLevel(value)) return;
              settings.setLightingQuality(value);
              setting.setDesc(qualityDesc(settings));
            });
        });
      },
    }],
  };
}
