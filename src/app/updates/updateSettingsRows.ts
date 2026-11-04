import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingRow } from '../settings/settingSections';
import { t } from '../i18n';
import { openUpdate } from './updateNotice';
import type { UpdateWatch } from './UpdateWatch';

function statusName(watch: UpdateWatch): string {
  const version = watch.available();
  return version ? t('settings.updates.available', { version }) : t('settings.updates.upToDate');
}

function buttonText(available: boolean, checking: boolean): string {
  if (available) return t('settings.updates.update');
  return checking ? t('settings.updates.checking') : t('settings.updates.checkNow');
}

/** Whether a newer Atlas is out, with Update or Check now, and the switch for the hourly look. */
export function updateSettingsRows(settings: SettingsService, watch: UpdateWatch): AtlasSettingRow[] {
  return [
    {
      name: statusName(watch),
      aliases: ['update', 'new version', 'upgrade'],
      render: setting => {
        let unsubscribe: (() => void) | undefined;
        setting.addButton(button => {
          const show = (): void => {
            setting.setName(statusName(watch));
            const available = watch.available() !== null;
            const checking = watch.isChecking();
            button.setButtonText(buttonText(available, checking))
              .setDisabled(!available && checking);
            button.buttonEl.toggleClass('mod-cta', available);
          };
          button.onClick(() => {
            if (watch.available()) openUpdate();
            else void watch.check({ force: true });
          });
          show();
          unsubscribe = watch.onChange(show);
        });
        return unsubscribe;
      },
    },
    {
      name: t('settings.updates.checkForUpdates'),
      desc: t('settings.updates.checkForUpdatesDesc'),
      render: setting => {
        let unsubscribe: (() => void) | undefined;
        setting.addToggle(toggle => {
          toggle.setValue(settings.getSetting('checkForUpdates'))
            .onChange(enabled => {
              if (settings.getSetting('checkForUpdates') !== enabled) settings.setSetting('checkForUpdates', enabled);
            });
          unsubscribe = settings.onChange(value => { toggle.setValue(value.checkForUpdates); });
        });
        return unsubscribe;
      },
    },
  ];
}
