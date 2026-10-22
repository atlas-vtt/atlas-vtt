import type { ChangelogService } from '../changelog/ChangelogService';
import type { SettingsService } from '../services/SettingsService';
import type { UpdateWatch } from '../updates/UpdateWatch';
import { updateSettingsRows } from '../updates/updateSettingsRows';
import type { AtlasSettingSection } from './settingSections';
import { t } from '../i18n';

export function changelogSettingsSection(settings: SettingsService, changelog: ChangelogService, version: string, updates: UpdateWatch): AtlasSettingSection {
  return {
    heading: t('settings.updates.heading'),
    rows: [
      ...updateSettingsRows(settings, updates),
      {
        name: t('settings.updates.changelog'),
        desc: t('settings.updates.changelogDesc', { version }),
        aliases: ['release notes', 'what is new', 'history', 'version'],
        render: setting => {
          setting.addButton(button => button.setButtonText(t('settings.updates.viewChangelog')).onClick(() => changelog.open()));
        },
      },
      {
        name: t('settings.updates.showAfterUpdates'),
        desc: t('settings.updates.showAfterUpdatesDesc'),
        render: setting => {
          let unsubscribe: (() => void) | undefined;
          setting.addToggle(toggle => {
            toggle.setValue(settings.getSetting('showChangelogOnUpdate'))
              .onChange(enabled => {
                if (settings.getSetting('showChangelogOnUpdate') !== enabled) settings.setSetting('showChangelogOnUpdate', enabled);
              });
            // The preference can also change while the changelog is open.
            unsubscribe = settings.onChange(value => { toggle.setValue(value.showChangelogOnUpdate); });
          });
          return unsubscribe;
        },
      },
      {
        name: t('settings.updates.featureOnly'),
        desc: t('settings.updates.featureOnlyDesc'),
        render: setting => {
          let unsubscribe: (() => void) | undefined;
          setting.addToggle(toggle => {
            toggle.setValue(settings.getSetting('changelogMajorUpdatesOnly'))
              .setDisabled(!settings.getSetting('showChangelogOnUpdate'))
              .onChange(enabled => {
                if (settings.getSetting('changelogMajorUpdatesOnly') !== enabled) settings.setSetting('changelogMajorUpdatesOnly', enabled);
              });
            unsubscribe = settings.onChange(value => {
              toggle.setValue(value.changelogMajorUpdatesOnly);
              toggle.setDisabled(!value.showChangelogOnUpdate);
            });
          });
          return unsubscribe;
        },
      },
    ],
  };
}
