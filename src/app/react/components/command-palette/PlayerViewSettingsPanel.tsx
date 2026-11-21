import React from 'react';
import { MonitorUp } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { openPlayerWindow } from '../../../services/PlayerWindowPresenter';
import type { AtlasSettings, SettingsService } from '../../../services/SettingsService';
import { DEFAULT_SETTINGS } from '../../../services/atlasSettings';
import { initiativeMaxCardsOf, initiativeScaleOf, MAX_INITIATIVE_CARDS, MAX_INITIATIVE_SCALE } from '../../../services/playerInitiativeList';
import { SettingRow, SettingSliderRow, SettingToggleRow } from './SettingRows';
import { usePlayerViewSwitches, type PlayerViewSwitch } from './playerViewSwitches';
import { t } from '../../../i18n';
import { isDesktopApp } from '../../../platform/desktopOnly';

const renderSwitch = ({ id, label, hint, value, onToggle }: PlayerViewSwitch): React.ReactElement => (
  <SettingToggleRow key={id} label={label} hint={hint} value={value} onToggle={onToggle} />
);

/** The sliders: how large the players' initiative list is, and how many cards it shows. */
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
    </>
  );
}

export function PlayerViewSettingsPanel(): React.ReactElement {
  const { app, view } = useAtlasUI();
  const settingsService: SettingsService | undefined = view?.serviceManager?.getSettingsService();
  const switches = usePlayerViewSwitches(settingsService);
  // The player window is the desktop's: mobile has no second window to open
  const hasPlayerWindow = isDesktopApp();

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">{t('lpv.shared')}</h3>
        {switches.shared.map(renderSwitch)}
        {switches.resources.map(renderSwitch)}
        {switches.tokens.map(renderSwitch)}
        {switches.initiative.map(renderSwitch)}
        <InitiativeLookSliders settings={settingsService} />
      </div>

      {(hasPlayerWindow || switches.online.length > 0) && (
        <div className="atlas-command-palette-panel-column">
          {hasPlayerWindow && (
            <>
              <h3 className="atlas-command-palette-panel-heading">{t('lpv.playerWindow')}</h3>
              <SettingToggleRow
                label={switches.view4k.label}
                hint={t('lpv.view4kHint')}
                value={switches.view4k.value}
                onToggle={switches.view4k.onToggle}
              />
              <SettingRow label={t('lpv.notePreviews')} hint={t('lpv.notePreviewsHint')}>{null}</SettingRow>
              <Button variant="default" size="sm" className="atlas-command-palette-cta" onClick={() => void openPlayerWindow(app)}>
                <MonitorUp />
                {t('lpv.openWindow')}
              </Button>
            </>
          )}

          {switches.online.length > 0 && (
            <>
              <h3 className="atlas-command-palette-panel-heading">{t('lpv.online')}</h3>
              {switches.online.map(renderSwitch)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
