import type { AtlasSettingSection } from '../../settings/settingSections';
import type { AccountControl } from './account/AccountControl.ts';
import { accountSections } from './account/accountSettings.ts';
import { COMPANION_REPORTS_NOTE } from './companionReports.ts';
import { t } from '../../i18n';

export interface OnlineSettings {
  /** Whether this plugin's errors are reported to the server; off until the GM switches it on. */
  reportErrors: boolean;
}

export const DEFAULT_SETTINGS: OnlineSettings = { reportErrors: false };

/** Settings read from the plugin's data, each field checked. */
export function readSettings(data: unknown): OnlineSettings {
  const record = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
  return { reportErrors: record.reportErrors === true };
}

/** What online play's settings rows read and change. */
export interface OnlineSettingsHost {
  readonly settings: OnlineSettings;
  readonly account: AccountControl;
  saveSettings(): Promise<void>;
}

/** Online play's sections of Atlas's settings: the account and error reports. */
export function onlineSettingsSections(host: OnlineSettingsHost): AtlasSettingSection[] {
  const save = async (change: (settings: OnlineSettings) => void): Promise<void> => {
    change(host.settings);
    await host.saveSettings();
  };
  const settings = host.settings;
  return [
    ...accountSections(host.account),
    {
      heading: t('online.diag.heading'),
      rows: [{
        name: t('online.diag.send'),
        desc: COMPANION_REPORTS_NOTE,
        render: (setting) => {
          setting.addToggle((toggle) => toggle.setValue(settings.reportErrors).onChange((value) => void save((current) => (current.reportErrors = value))));
        },
      }],
    },
  ];
}
