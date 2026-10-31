import React from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { t } from '../../../i18n';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { lightingQualityChoices, presetLabel } from '../../../lighting/lightingQualityChoices';
import { knobsOf, presetOf, withKnob } from '../../../lighting/graphicsSettings';
import { isLightingQualityLevel, type LightingQualityLevel } from '../../../lighting/lightingQuality';
import type { SettingsService } from '../../../services/SettingsService';
import { GraphicsKnobRows, graphicsGroupHeading, type GraphicsGroup } from './GraphicsKnobRows';
import { SettingChoiceRow } from './SettingRows';

type PresetTab = LightingQualityLevel | 'custom';

/** The presets as tabs, with Custom lighting up on its own once a knob below differs from the chosen preset. */
function presetOptions(custom: boolean): SegmentedOption<PresetTab>[] {
  return [...lightingQualityChoices(), { value: 'custom', label: t('graphics.custom'), hint: t('graphics.customHint'), disabled: !custom }];
}

/**
 * The Graphics page of the command palette: the three presets as tabs, and below them every choice
 * a preset makes, each its own row (`GraphicsKnobRows`), so one thing can be set away from a preset
 * (`GraphicsChoice`). The choice is this device's (`SettingsService.getGraphics`).
 */
export function GraphicsPanel(): React.ReactElement {
  const settings = useAtlasSettings();
  if (!settings) return <div className="atlas-command-palette-panel" />;
  return <GraphicsRows settings={settings} />;
}

function GraphicsRows({ settings }: { settings: SettingsService }): React.ReactElement {
  const choice = settings.getGraphics();
  const knobs = knobsOf(choice);
  const preset = presetOf(knobs);
  const picked = settings.isLightingQualityPicked();
  const group = (name: GraphicsGroup): React.ReactElement => (
    <>
      <h3 className="atlas-command-palette-panel-heading">{graphicsGroupHeading(name)}</h3>
      <GraphicsKnobRows knobs={knobs} group={name} onKnob={(knob, value) => settings.setGraphics(withKnob(choice, knob, value))} />
    </>
  );
  return (
    <div className="atlas-command-palette-panel atlas-graphics">
      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">{t('graphics.preset')}</h3>
        <SettingChoiceRow label={t('graphics.presetLabel')} hint={t('graphics.presetHint')}>
          <SegmentedControl<PresetTab>
            value={preset ?? 'custom'}
            options={presetOptions(preset === null)}
            ariaLabel={t('graphics.preset')}
            onChange={(tab) => { if (isLightingQualityLevel(tab)) settings.setLightingQuality(tab); }}
          />
        </SettingChoiceRow>
        <div className="atlas-graphics__picked">
          {picked && preset !== null
            ? <span className="atlas-setting-hint">{t('graphics.picked', { level: presetLabel(preset) })}</span>
            : <Button variant="ghost" size="sm" onClick={() => settings.resetGraphics()}>{t('graphics.reset')}</Button>}
        </div>
        {group('animated')}
        {group('screen')}
      </div>
      <div className="atlas-command-palette-panel-column">
        {group('lighting')}
      </div>
    </div>
  );
}
