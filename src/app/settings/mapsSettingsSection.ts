import { animateMapsOn } from '../pixi/mapImage/video/mapVideoPlayback';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';
import { t } from '../i18n';

/** How maps are shown on this device: whether animated maps play. */
export function mapsSettingsSection(settings: SettingsService): AtlasSettingSection {
  return {
    heading: t('settings.maps.heading'),
    rows: [{
      name: t('settings.maps.animate'),
      desc: t('settings.maps.animateHint'),
      aliases: ['animated', 'video', 'webm', 'mp4', 'motion', 'battery'],
      render: (setting) => {
        const reducedMotion = activeWindow.matchMedia('(prefers-reduced-motion: reduce)').matches;
        setting.addToggle((toggle) => {
          toggle.setValue(animateMapsOn(settings.getAnimateMaps(), reducedMotion)).onChange((on) => settings.setAnimateMaps(on));
        });
      },
    }],
  };
}
