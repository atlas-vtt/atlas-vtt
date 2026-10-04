import { normalizePath } from 'obsidian';
import type { SettingsService } from 'src/app/services/SettingsService';
import type { AtlasSettingSection } from 'src/app/settings/settingSections';
import { isRecord } from 'src/app/services/assetMetadataGuards';

/** The pins add-on's settings, stored in Atlas' settings file under `pins`. */
export interface PinSettings {
  /** Vault folder that notes created from the pin tool's search go to. */
  notesFolder: string;
}

const PIN_SETTINGS_KEY = 'pins';

export const DEFAULT_PIN_SETTINGS: Readonly<PinSettings> = { notesFolder: 'atlas-vtt/collections/Default/notes' };

/** Trust boundary for the stored settings; anything missing or broken takes its default. */
export function readPinSettings(value: unknown): PinSettings {
  const saved = isRecord(value) ? value : {};
  const folder = typeof saved.notesFolder === 'string' ? normalizePath(saved.notesFolder.trim()).replace(/^\/+|\/+$/g, '') : '';
  return { notesFolder: folder || DEFAULT_PIN_SETTINGS.notesFolder };
}

export function pinSettingsOf(service: SettingsService | null | undefined): PinSettings {
  return readPinSettings(service?.getAddonSettings(PIN_SETTINGS_KEY));
}

export function pinSettingsSection(service: SettingsService): AtlasSettingSection {
  return {
    heading: 'Pins',
    rows: [{
      name: 'Folder for new pin notes',
      desc: 'Where the pin tool creates a note when you type a name no note has.',
      aliases: ['pin notes', 'notes folder'],
      render: (setting) => {
        setting.addText((text) => text
          .setPlaceholder(DEFAULT_PIN_SETTINGS.notesFolder)
          .setValue(pinSettingsOf(service).notesFolder)
          .onChange((notesFolder) => service.setAddonSettings(PIN_SETTINGS_KEY, readPinSettings({ notesFolder }))));
      },
    }],
  };
}
