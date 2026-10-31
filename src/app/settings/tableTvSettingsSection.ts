import type { Setting, TextComponent } from 'obsidian';
import type { SettingsService } from '../services/SettingsService';
import { calibratedTrim, CELL_MM_PRESETS, TV_DIAGONAL_PRESETS, TV_RESOLUTION_PRESETS } from '../services/tableTv';
import {
  MAX_VIEW_GLIDE_MS, MAX_WIDGET_SCALE, MIN_WIDGET_SCALE, PLAYER_WIDGET_POSITIONS, TV_ROTATIONS, type TableTvSettings,
} from '../services/tableTvSettings';
import type { AtlasSettingSection } from './settingSections';
import { shownImageSettingsRows } from './shownImageSettingsSection';
import { t } from '../i18n';
import './table-tv-settings.scss';

const CUSTOM = 'custom';

/**
 * A preset dropdown next to a free text field; picking a preset fills the field.
 * Presets are pairs, not an object: objects list number-like keys ("27") before
 * others ("25.4"), which would scramble the order.
 */
function presetInput(
  setting: Setting, presets: ReadonlyArray<readonly [value: string, label: string]>, value: string,
  parse: (text: string) => string | null, save: (value: string) => void,
): void {
  let text: { setValue(value: string): unknown } | undefined;
  setting.addDropdown((dropdown) => {
    for (const [key, label] of presets) dropdown.addOption(key, label);
    dropdown.addOption(CUSTOM, t('tableTv.custom'))
      .setValue(presets.some(([key]) => key === value) ? value : CUSTOM)
      .onChange((picked) => {
        if (picked === CUSTOM) return;
        text?.setValue(picked);
        save(picked);
      });
  });
  setting.addText((input) => {
    text = input;
    input.inputEl.addClass('atlas-preset-input');
    input.setValue(value).onChange((raw) => {
      const parsed = parse(raw);
      if (parsed !== null) save(parsed);
    });
  });
}

/** A positive number typed with a decimal point or comma, as text; null for anything else. */
const positive = (raw: string): string | null => {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? String(n) : null;
};

/** The player view on a TV lying on the table: rotation, true-scale grid, calibration, widgets and displayed images. */
export function tableTvSettingsSection(settingsService: SettingsService): AtlasSettingSection {
  const tv = (): TableTvSettings => settingsService.getTableTvSettings();
  const set = (patch: Partial<TableTvSettings>): void => settingsService.setTableTvSettings(patch);

  return {
    heading: t('tableTv.heading'),
    rows: [
      {
        name: t('tableTv.rotation'),
        desc: t('tableTv.rotationDesc'),
        aliases: ['rotate', 'player view', 'orientation'],
        render: (setting) => {
          setting.addDropdown((d) => {
            for (const rotation of TV_ROTATIONS) d.addOption(String(rotation), t('tableTv.degrees', { degrees: rotation }));
            d.setValue(String(tv().rotation)).onChange((v) => {
              const rotation = TV_ROTATIONS.find((known) => String(known) === v);
              if (rotation !== undefined) set({ rotation });
            });
          });
        },
      },
      {
        name: t('tableTv.trueScale'),
        desc: t('tableTv.trueScaleDesc'),
        aliases: ['physical', 'mm', 'miniatures', 'scale'],
        render: (setting) => { setting.addToggle((toggle) => toggle.setValue(tv().trueScale).onChange((trueScale) => set({ trueScale }))); },
      },
      {
        name: t('tableTv.diagonal'),
        desc: t('tableTv.diagonalDesc'),
        aliases: ['diagonal', 'inch', 'screen size'],
        render: (setting) => presetInput(
          setting, TV_DIAGONAL_PRESETS.map((inches) => [String(inches), t('tableTv.diagonalPreset', { inches })] as const), String(tv().diagonalIn),
          positive, (v) => set({ diagonalIn: Number(v) }),
        ),
      },
      {
        name: t('tableTv.resolution'),
        desc: t('tableTv.resolutionDesc'),
        aliases: ['resolution', '4k', '1080p'],
        render: (setting) => presetInput(
          setting, TV_RESOLUTION_PRESETS.map((value) => [value, t(`tableTv.resolution.${value}`)] as const), tv().resolution,
          (raw) => (/^\s*\d+\s*[x×]\s*\d+\s*$/.test(raw) || raw.trim() === 'auto' ? raw.trim() : null),
          (resolution) => set({ resolution }),
        ),
      },
      {
        name: t('tableTv.cellMm'),
        desc: t('tableTv.cellMmDesc'),
        aliases: ['grid size', 'square size', 'base'],
        render: (setting) => presetInput(
          setting, CELL_MM_PRESETS.map((mm) => [String(mm), t('tableTv.cellMmPreset', { mm })] as const), String(tv().cellMm),
          positive, (v) => set({ cellMm: Number(v) }),
        ),
      },
      {
        name: t('tableTv.calibration'),
        desc: t('tableTv.calibrationDesc'),
        aliases: ['calibrate', 'ruler', 'overscan'],
        render: (setting) => { setting.addToggle((toggle) => toggle.setValue(tv().showCalibration).onChange((showCalibration) => set({ showCalibration }))); },
      },
      {
        name: t('tableTv.measured'),
        desc: t('tableTv.measuredDesc'),
        aliases: ['calibrate', 'measure'],
        render: (setting) => {
          let measured = 0;
          setting.addText((text) => text.setPlaceholder('264').onChange((raw) => { measured = Number(positive(raw) ?? 0); }));
          setting.addButton((b) => b.setButtonText(t('tableTv.apply')).onClick(() => {
            const current = tv();
            set({ trim: calibratedTrim(current.trim, current.cellMm * 10, measured) });
          }));
        },
      },
      {
        name: t('tableTv.trim'),
        desc: t('tableTv.trimDesc'),
        aliases: ['calibration', 'correction'],
        render: (setting) => {
          let field: TextComponent | undefined;
          setting.addText((text) => {
            field = text;
            text.setValue(String(tv().trim)).onChange((raw) => {
              const v = positive(raw);
              if (v !== null) set({ trim: Number(v) });
            });
          });
          setting.addExtraButton((b) => b.setIcon('rotate-ccw').setTooltip(t('tableTv.trimReset')).onClick(() => {
            set({ trim: 100 });
            field?.setValue('100');
          }));
          // The Apply button above changes the trim; keep this field in step
          return settingsService.onChange(({ tableTv }) => {
            if (field && Number(field.getValue().replace(',', '.')) !== tableTv.trim) field.setValue(String(tableTv.trim));
          });
        },
      },
      {
        name: t('tableTv.glide'),
        desc: t('tableTv.glideDesc'),
        aliases: ['freeze', 'push', 'glide', 'smooth', 'camera'],
        render: (setting) => {
          setting.addSlider((s) => s.setLimits(0, MAX_VIEW_GLIDE_MS, 100).setValue(tv().viewGlideMs)
            .onChange((viewGlideMs) => set({ viewGlideMs })));
        },
      },
      {
        name: t('tableTv.widgetsPlace'),
        desc: t('tableTv.widgetsPlaceDesc'),
        aliases: ['widget', 'position', 'player view'],
        render: (setting) => {
          setting.addDropdown((d) => {
            // Named as the displayed image's places below
            for (const place of PLAYER_WIDGET_POSITIONS) d.addOption(place, t(`tableTv.place.${place}`));
            d.setValue(tv().widgetPosition).onChange((v) => {
              const widgetPosition = PLAYER_WIDGET_POSITIONS.find((known) => known === v);
              if (widgetPosition) set({ widgetPosition });
            });
          });
        },
      },
      {
        name: t('tableTv.widgetsSize'),
        desc: t('tableTv.widgetsSizeDesc'),
        aliases: ['widget', 'size', 'scale', 'player view'],
        render: (setting) => {
          setting.addSlider((s) => s.setLimits(MIN_WIDGET_SCALE, MAX_WIDGET_SCALE, 0.1).setValue(tv().widgetScale)
            .onChange((widgetScale) => set({ widgetScale })));
        },
      },
      ...shownImageSettingsRows(settingsService),
    ],
  };
}
