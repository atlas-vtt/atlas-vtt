import type { NavigationInputMode, SettingsService } from '../services/SettingsService';
import type { AtlasSettingRow, AtlasSettingSection } from './settingSections';
import type { FingerUse } from '../services/deviceSettings';
import { t } from '../i18n';

const MODE_LABELS: Record<NavigationInputMode, string> = {
  mouse: t('settings.navigation.mouse'),
  trackpad: t('settings.navigation.trackpad'),
};

const MODE_HINTS: Record<NavigationInputMode, string> = {
  mouse: t('settings.navigation.mouseHint'),
  trackpad: t('settings.navigation.trackpadHint'),
};

const FINGER_LABELS: Record<FingerUse, string> = {
  pan: t('settings.navigation.fingersPan'),
  tool: t('settings.navigation.fingersTool'),
};

const FINGER_HINTS: Record<FingerUse, string> = {
  pan: t('settings.navigation.fingersPanHint'),
  tool: t('settings.navigation.fingersToolHint'),
};

/** What fingers do in the drawing tools of a device with a pen; offered once a pen has touched a map. */
export interface FingerChoice {
  readonly penSeen: boolean;
  readonly use: FingerUse;
  setUse(use: FingerUse): void;
}

function fingerRow(fingers: FingerChoice): AtlasSettingRow {
  return {
    name: t('settings.navigation.fingers'),
    desc: FINGER_HINTS[fingers.use],
    aliases: ['pen', 'pencil', 'stylus', 'touch', 'finger', 'pan'],
    render: (setting) => {
      setting.addDropdown((dropdown) => {
        dropdown
          .addOptions(FINGER_LABELS)
          .setValue(fingers.use)
          .onChange((value) => {
            const use: FingerUse = value === 'tool' ? 'tool' : 'pan';
            fingers.setUse(use);
            setting.setDesc(FINGER_HINTS[use]);
          });
      });
    },
  };
}

/** Whether the map shows its zoom buttons while a mouse points; under a finger they always show, so the row is left out there. */
export interface ZoomButtonsRow {
  readonly offered: boolean;
  readonly shown: boolean;
  setShown(shown: boolean): void;
}

function zoomButtonsRow(zoomButtons: ZoomButtonsRow): AtlasSettingRow {
  return {
    name: t('settings.navigation.zoomButtons'),
    desc: t('settings.navigation.zoomButtonsHint'),
    aliases: ['zoom', 'fit', 'buttons'],
    render: (setting) => {
      setting.addToggle((toggle) => toggle.setValue(zoomButtons.shown).onChange((shown) => zoomButtons.setShown(shown)));
    },
  };
}

/** Map navigation options. */
export function navigationSettingsSection(settingsService: SettingsService, fingers?: FingerChoice, zoomButtons?: ZoomButtonsRow): AtlasSettingSection {
  return {
    heading: t('settings.navigation.heading'),
    rows: [...(fingers?.penSeen ? [fingerRow(fingers)] : []), ...(zoomButtons?.offered ? [zoomButtonsRow(zoomButtons)] : []), {
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
