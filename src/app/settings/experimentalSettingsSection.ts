import { EXPERIMENTAL_FEATURES } from '../experimental/experimentalFeatures';
import { t } from '../i18n';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';

/**
 * One switch per experimental feature, the same setting the command palette's Experimental
 * features page switches, so each place follows the other at once.
 */
export function experimentalSettingsSection(settings: SettingsService): AtlasSettingSection {
  return {
    heading: t('settings.experimental.heading'),
    rows: EXPERIMENTAL_FEATURES.map(({ id, label, hint }) => ({
      name: label,
      desc: hint,
      aliases: ['experimental', 'beta', 'feature'],
      render: (setting) => {
        let unsubscribe: (() => void) | undefined;
        setting.addToggle((toggle) => {
          toggle.setValue(settings.isExperimentalOn(id)).onChange((on) => settings.setExperimental(id, on));
          unsubscribe = settings.onChange(() => { toggle.setValue(settings.isExperimentalOn(id)); });
        });
        return unsubscribe;
      },
    })),
  };
}
