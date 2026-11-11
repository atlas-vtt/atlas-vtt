import React from 'react';
import { MonitorUp } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { openPlayerWindow } from '../../../services/PlayerWindowPresenter';
import type { AtlasSettings, SettingsService } from '../../../services/SettingsService';
import { DEFAULT_SETTINGS } from '../../../services/atlasSettings';
import { initiativeMaxCardsOf, initiativeScaleOf, MAX_INITIATIVE_CARDS, MAX_INITIATIVE_SCALE } from '../../../services/playerInitiativeList';
import { MAX_TURN_BANNER_SCALE } from '../../../initiative/banner/turnBannerElement';
import { SettingRow, SettingSliderRow, SettingToggleRow } from './SettingRows';
import { usePlayerViewSwitches, type PlayerViewSwitch } from './playerViewSwitches';
import { t } from '../../../i18n';

/** The initiative switches explain themselves. */
const SWITCH_HINTS: Readonly<Record<string, string>> = {
  showInitiativeNames: t('lpv.initiativeNamesHint'),
  initiativePulse: t('lpv.initiativePulseHint'),
  turnBannerAtLists: t('lpv.turnBannerAtListsHint'),
  turnDim: t('lpv.turnDimHint'),
};

const renderSwitch = ({ id, label, value, onToggle }: PlayerViewSwitch): React.ReactElement => (
  <SettingToggleRow key={id} label={label} hint={SWITCH_HINTS[id]} value={value} onToggle={onToggle} />
);

/** The sliders: how large the players' initiative list and turn banner are, and how long the banner stands. */
function InitiativeLookSliders({ settings }: { settings: SettingsService | undefined }): React.ReactElement {
  const values: AtlasSettings['localPlayerView'] = settings?.getLocalPlayerViewSettings() ?? DEFAULT_SETTINGS.localPlayerView;
  const update = (changes: Partial<AtlasSettings['localPlayerView']>): void => settings?.setLocalPlayerViewSettings(changes);
  const initiativeScale = initiativeScaleOf(values.initiativeScale);
  const maxCards = initiativeMaxCardsOf(values.initiativeMaxCards);
  return (
    <>
      <SettingSliderRow
        label={t('lpv.initiativeScale')}
        value={initiativeScale}
        min={1}
        max={MAX_INITIATIVE_SCALE}
        step={0.25}
        displayValue={t('lpv.initiativeScaleValue', { percent: Math.round(initiativeScale * 100) })}
        onChange={(value) => update({ initiativeScale: value })}
      />
      <SettingSliderRow
        label={t('lpv.initiativeMaxCards')}
        value={maxCards}
        min={0}
        max={MAX_INITIATIVE_CARDS}
        step={1}
        displayValue={maxCards === 0 ? t('lpv.initiativeMaxCardsAll') : String(maxCards)}
        onChange={(value) => update({ initiativeMaxCards: value })}
      />
      <SettingSliderRow
        label={t('lpv.turnBannerScale')}
        value={values.turnBannerScale}
        min={1}
        max={MAX_TURN_BANNER_SCALE}
        step={0.25}
        displayValue={t('lpv.initiativeScaleValue', { percent: Math.round(values.turnBannerScale * 100) })}
        onChange={(value) => update({ turnBannerScale: value })}
      />
      <SettingSliderRow
        label={t('lpv.turnBannerSeconds')}
        value={values.turnBannerSeconds}
        min={1}
        max={10}
        step={0.5}
        displayValue={t('lpv.turnBannerSecondsValue', { seconds: values.turnBannerSeconds })}
        onChange={(value) => update({ turnBannerSeconds: value })}
      />
    </>
  );
}

export function LocalPlayerViewSettingsPanel(): React.ReactElement {
  const { app, view } = useAtlasUI();
  const settingsService: SettingsService | undefined = view?.serviceManager?.getSettingsService();
  const switches = usePlayerViewSwitches(settingsService);

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">{t('lpv.interface')}</h3>
        {switches.interface.map(renderSwitch)}
        <SettingToggleRow
          label={switches.view4k.label}
          hint={t('lpv.view4kHint')}
          value={switches.view4k.value}
          onToggle={switches.view4k.onToggle}
        />
        {switches.initiative.map(renderSwitch)}
        <InitiativeLookSliders settings={settingsService} />
      </div>

      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">{t('lpv.tokens')}</h3>
        {switches.resources.map(renderSwitch)}
        {switches.tokens.map(renderSwitch)}
        <SettingRow label={t('lpv.notePreviews')} hint={t('lpv.notePreviewsHint')}>{null}</SettingRow>

        <Button variant="default" size="sm" className="atlas-command-palette-cta" onClick={() => void openPlayerWindow(app)}>
          <MonitorUp />
          {t('lpv.openWindow')}
        </Button>
      </div>
    </div>
  );
}
