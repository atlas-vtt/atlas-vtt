import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingRow } from './settingSections';
import { MAX_SHOWN_IMAGE_SIZE, MIN_SHOWN_IMAGE_SIZE, readShownImageLayout, shownImageSize, SHOWN_IMAGE_PLACES, type ShownImageLayout } from '../services/shownImageLayout';
import { t } from '../i18n';

/**
 * Where an image displayed on the player view sits and how large it may be: rows of TrueScale,
 * since the placement is as the players see the turned TV. A displayed image follows at once.
 */
export function shownImageSettingsRows(settings: Pick<SettingsService, 'getSetting' | 'setSetting'>): AtlasSettingRow[] {
  const layout = (): ShownImageLayout => readShownImageLayout(settings.getSetting('shownImage'));
  const set = (patch: Partial<ShownImageLayout>): void => settings.setSetting('shownImage', { ...layout(), ...patch });
  return [{
    name: t('tableTv.imagePlace'),
    desc: t('tableTv.imagePlaceDesc'),
    aliases: ['show image', 'picture', 'player view', 'position', 'centre', 'center', 'top', 'bottom'],
    render: (setting) => {
      setting.addDropdown((dropdown) => {
        for (const place of SHOWN_IMAGE_PLACES) dropdown.addOption(place, t(`tableTv.place.${place}`));
        dropdown.setValue(layout().place).onChange((value) => {
          const place = SHOWN_IMAGE_PLACES.find((known) => known === value);
          if (place) set({ place });
        });
      });
    },
  }, {
    name: t('tableTv.imageSize'),
    desc: t('tableTv.imageSizeDesc'),
    aliases: ['show image', 'picture', 'player view', 'zoom', 'size', 'fit'],
    render: (setting) => {
      setting.addSlider((slider) => slider.setLimits(MIN_SHOWN_IMAGE_SIZE, MAX_SHOWN_IMAGE_SIZE, 0.05).setValue(layout().size)
        .onChange((value) => {
          const size = shownImageSize(value);
          if (size !== undefined) set({ size });
        }));
    },
  }];
}
