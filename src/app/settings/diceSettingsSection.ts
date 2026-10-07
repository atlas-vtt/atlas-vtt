import type { Setting } from 'obsidian';
import { DICE_DISPLAY_HINTS, DICE_DISPLAY_OPTIONS, isDiceDisplay } from '../dice3d/diceDisplay';
import { customLooks, onCustomLooksChange } from '../dice3d/customLooks';
import { DICE_COLOUR_OPTIONS, DICE_FONT_OPTIONS, isDiceColour, isDiceFont } from '../dice3d/diceLook';
import { diceLookChoices } from '../dice3d/diceLookChoices';
import { renderLookPreviews } from '../dice3d/lookPreviews';
import { t } from '../i18n';
import type { SettingsService } from '../services/SettingsService';
import type { AtlasSettingSection } from './settingSections';

type Options = readonly { value: string; label: string }[];

function optionLabels(options: Options): Record<string, string> {
  return Object.fromEntries(options.map(({ value, label }) => [value, label]));
}

const DISPLAY_LABELS = optionLabels(DICE_DISPLAY_OPTIONS);

/** A dropdown for one part of the dice look, which can also change from the command palette. */
function addLookDropdown(
  setting: Setting,
  settings: SettingsService,
  options: Options,
  read: () => string,
  write: (value: string) => void,
): (() => void) | undefined {
  let unsubscribe: (() => void) | undefined;
  setting.addDropdown((dropdown) => {
    dropdown.addOptions(optionLabels(options)).setValue(read()).onChange(write);
    unsubscribe = settings.onChange(() => { dropdown.setValue(read()); });
  });
  return unsubscribe;
}

/** The dice look dropdown: Atlas's own and every registered look, following registrations and the command palette. */
function renderLookChoice(setting: Setting, settings: SettingsService): () => void {
  let stops: Array<() => void> = [];
  // A preview of the look chosen, made as the command palette's are (`renderLookPreviews`); none while only Atlas's exists.
  const preview = setting.controlEl.createEl('img', { cls: 'atlas-dice-look-preview', attr: { alt: '', draggable: 'false' } });
  let previews: Record<string, string> = {};
  let rendering = 0;
  let lookKey = '';
  const showPreview = (): void => {
    const src = customLooks().length > 0 ? previews[settings.getDiceLookId()] : undefined;
    preview.hidden = !src;
    if (src) preview.src = src;
    else preview.removeAttribute('src');
  };
  const renderPreviews = (): void => {
    const serial = ++rendering;
    lookKey = JSON.stringify(settings.getDiceLook());
    if (customLooks().length === 0) {
      showPreview();
      return;
    }
    void renderLookPreviews(setting.controlEl.ownerDocument).then((next) => {
      if (serial !== rendering) return;
      previews = next;
      showPreview();
    });
  };
  setting.addDropdown((dropdown) => {
    const select = dropdown.selectEl;
    const fill = (): void => {
      const stored = settings.getDiceLookId();
      const choices = diceLookChoices(stored);
      select.replaceChildren();
      dropdown.addOptions(Object.fromEntries(choices.map(({ value, label }) => [value, label]))).setValue(stored);
      const missing = choices.some((choice) => !choice.loaded);
      setting.setDesc(missing ? t('dice.look.notLoadedHint') : t('dice.look.desc'));
      showPreview();
    };
    fill();
    renderPreviews();
    dropdown.onChange((value) => settings.setDiceLookId(value));
    stops = [
      settings.onChange(() => {
        fill();
        if (JSON.stringify(settings.getDiceLook()) !== lookKey) renderPreviews();
      }),
      onCustomLooksChange(() => { fill(); renderPreviews(); }),
    ];
  });
  return () => {
    rendering++;
    stops.forEach((stop) => stop());
  };
}

/** How dice rolls are shown. */
export function diceSettingsSection(settings: SettingsService): AtlasSettingSection {
  return {
    heading: 'Dice',
    rows: [{
      name: 'Roll display',
      desc: DICE_DISPLAY_HINTS[settings.getDiceDisplay()],
      aliases: ['dice', 'roll', 'animation', '3d', 'toast', 'speed', 'fast'],
      render: (setting) => {
        let unsubscribe: (() => void) | undefined;
        setting.addDropdown((dropdown) => {
          dropdown.addOptions(DISPLAY_LABELS)
            .setValue(settings.getDiceDisplay())
            .onChange((value) => {
              if (isDiceDisplay(value)) settings.setDiceDisplay(value);
            });
          // The choice can also change from the command palette.
          unsubscribe = settings.onChange(() => {
            const display = settings.getDiceDisplay();
            dropdown.setValue(display);
            setting.setDesc(DICE_DISPLAY_HINTS[display]);
          });
        });
        return unsubscribe;
      },
    }, {
      name: t('dice.look.name'),
      desc: t('dice.look.desc'),
      aliases: ['dice', 'look', 'skin', 'theme', 'faces', 'pack'],
      render: (setting) => renderLookChoice(setting, settings),
    }, {
      name: 'Dice colour',
      desc: 'Light card, dark with light numbers, or your accent colour. The command palette\'s Dice settings show each one.',
      aliases: ['dice', 'colour', 'color', 'skin', 'accent', 'dark'],
      render: (setting) => addLookDropdown(
        setting,
        settings,
        DICE_COLOUR_OPTIONS,
        () => settings.getDiceLook().colour,
        (value) => {
          if (isDiceColour(value)) settings.setDiceLook({ colour: value });
        },
      ),
    }, {
      name: 'Dice numbers',
      desc: 'Medieval for high fantasy, sci-fi for futuristic games. Also used for roll totals.',
      aliases: ['dice', 'font', 'numbers', 'sci-fi', 'medieval', 'cyberpunk'],
      render: (setting) => addLookDropdown(
        setting,
        settings,
        DICE_FONT_OPTIONS,
        () => settings.getDiceLook().font,
        (value) => {
          if (isDiceFont(value)) settings.setDiceLook({ font: value });
        },
      ),
    }],
  };
}
