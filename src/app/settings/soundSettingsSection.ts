import { t } from '../i18n';
import { listOutputDevices, type OutputDeviceChoice } from '../sound/engine/outputDevice';
import type { SettingsService } from '../services/SettingsService';
import { CHANNEL_DB_RANGE, MAX_CROSSFADE_SECONDS, MAX_FADE_SECONDS } from '../services/soundSettings';
import type { SoundDirector } from '../soundDirector/SoundDirector';
import type { AtlasSettingRow, AtlasSettingSection } from './settingSections';

const DEFAULT_OUTPUT = 'default';

function levelRow(settings: SettingsService, director: SoundDirector, name: string, key: 'musicDb' | 'ambienceDb' | 'masterDb'): AtlasSettingRow {
  return {
    name,
    desc: t('audio.settings.levelHint'),
    aliases: ['sound', 'music', 'ambience', 'volume', 'level'],
    render: (setting) => {
      setting.addSlider((slider) => slider
        .setLimits(CHANNEL_DB_RANGE.min, CHANNEL_DB_RANGE.max, 1)
        .setValue(settings.getSoundSettings()[key])
        .onChange((value) => director.setChannelLevels({ [key]: value }, true)));
    },
  };
}

function outputLabel(device: OutputDeviceChoice, index: number): string {
  return device.label || t('audio.outputNumbered', { n: index + 1 });
}

/** The list that was asked to open when its names were not here yet; where a browser refuses, the next click opens it. */
function openPicker(select: HTMLSelectElement): void {
  try {
    select.showPicker();
  } catch (error) {
    console.debug('[Atlas] The list of outputs opens on the next click', error);
  }
}

function outputRow(director: SoundDirector): AtlasSettingRow {
  return {
    name: t('audio.output'),
    desc: t('audio.outputHint'),
    aliases: ['sound', 'speaker', 'headphones', 'device', 'output'],
    render: (setting) => {
      setting.addDropdown((dropdown) => {
        const stored = director.snapshot().output;
        dropdown.addOption(DEFAULT_OUTPUT, t('audio.outputDefault'));
        if (stored) dropdown.addOption(stored.id, stored.label || t('audio.outputUnnamed'));
        dropdown.setValue(stored?.id ?? DEFAULT_OUTPUT);
        let devices: OutputDeviceChoice[] = [];
        let read = false;
        // Chromium names outputs only after a microphone permission, so the list is asked for when it is opened, and opens once it is here.
        dropdown.selectEl.addEventListener('mousedown', (event) => {
          if (read) return;
          read = true;
          event.preventDefault();
          void listOutputDevices().then((found) => {
            devices = found;
            found.forEach((device, index) => {
              dropdown.addOption(device.id, outputLabel(device, index));
            });
            dropdown.setValue(director.snapshot().output?.id ?? DEFAULT_OUTPUT);
            openPicker(dropdown.selectEl);
          });
        });
        dropdown.onChange((id) => {
          if (id === DEFAULT_OUTPUT) {
            director.setOutput(null);
            return;
          }
          const index = devices.findIndex((device) => device.id === id);
          const device = devices[index];
          director.setOutput({ id, label: device ? outputLabel(device, index) : (stored?.label ?? '') });
        });
      });
    },
  };
}

/** Levels, fades and following scenes. Shown only while sound is switched on. */
export function soundSettingsSection(settings: SettingsService, director: SoundDirector): AtlasSettingSection {
  return {
    heading: t('audio.settings.heading'),
    rows: [
      {
        name: t('audio.settings.follow'),
        desc: t('audio.settings.followHint'),
        aliases: ['sound', 'music', 'ambience', 'mood', 'scene', 'combat'],
        render: (setting) => {
          setting.addToggle((toggle) => toggle.setValue(settings.getSoundSettings().followScenes).onChange((followScenes) => settings.setSoundSettings({ followScenes })));
        },
      },
      {
        name: t('audio.settings.fade'),
        desc: t('audio.settings.fadeHint'),
        aliases: ['sound', 'music', 'ambience', 'crossfade'],
        render: (setting) => {
          setting.addSlider((slider) => slider
            .setLimits(0, MAX_FADE_SECONDS, 1)
            .setValue(settings.getSoundSettings().fadeSeconds)
            .onChange((fadeSeconds) => settings.setSoundSettings({ fadeSeconds })));
        },
      },
      {
        name: t('audio.settings.crossfade'),
        desc: t('audio.settings.crossfadeHint'),
        aliases: ['sound', 'music', 'crossfade', 'gapless', 'track'],
        render: (setting) => {
          setting.addSlider((slider) => slider
            .setLimits(0, MAX_CROSSFADE_SECONDS, 1)
            .setValue(settings.getSoundSettings().crossfadeSeconds)
            .onChange((crossfadeSeconds) => settings.setSoundSettings({ crossfadeSeconds })));
        },
      },
      levelRow(settings, director, t('audio.music'), 'musicDb'),
      levelRow(settings, director, t('audio.ambience'), 'ambienceDb'),
      levelRow(settings, director, t('audio.master'), 'masterDb'),
      outputRow(director),
    ],
  };
}
