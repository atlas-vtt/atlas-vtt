import { animateMapsOn } from '../pixi/mosaicCanvas/video/mapVideoPlayback';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';
import { MAX_FOG_EDGE_WIDTH, type FogEdgeStyle } from '../fog/fogEdge';
import { t } from '../i18n';

/** How maps are shown: whether animated maps play on this device, whether a mouse gets the bar above a selection, and how the fog's edge looks. */
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
          toggle.setValue(animateMapsOn(settings.get('animateMaps'), reducedMotion)).onChange((on) => settings.set('animateMaps', on));
        });
      },
    }, {
      name: t('settings.maps.selectionBar'),
      desc: t('settings.maps.selectionBarHint'),
      aliases: ['selection', 'toolbar', 'touch', 'tablet', 'duplicate', 'delete'],
      render: (setting) => {
        setting.addToggle((toggle) => {
          toggle.setValue(settings.get('selectionBar')).onChange((shown) => settings.set('selectionBar', shown));
        });
      },
    }, {
      name: t('settings.maps.fogEdge'),
      desc: t('settings.maps.fogEdgeHint'),
      aliases: ['fog', 'blur', 'soft', 'feather', 'crackle', 'gritty'],
      render: (setting) => {
        setting.addDropdown((dropdown) => {
          dropdown.addOptions({ soft: t('settings.maps.fogEdgeSoft'), crackle: t('settings.maps.fogEdgeCrackled') })
            .setValue(settings.get('fogEdge').style)
            .onChange((style) => settings.set('fogEdge', { style: style as FogEdgeStyle }));
        });
        setting.addSlider((slider) => {
          slider.setLimits(0, MAX_FOG_EDGE_WIDTH, 1).setValue(settings.get('fogEdge').width).onChange((width) => settings.set('fogEdge', { width }));
        });
      },
    }],
  };
}
