import React from 'react';
import { MonitorUp } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { openPlayerWindow } from '../../../services/PlayerWindowPresenter';
import type { SettingsService } from '../../../services/SettingsService';
import { SettingRow, SettingToggleRow } from './SettingRows';
import { usePlayerViewSwitches, type PlayerViewSwitch } from './playerViewSwitches';
import { t } from '../../../i18n';

const renderSwitch = ({ id, label, hint, value, onToggle }: PlayerViewSwitch): React.ReactElement => (
  <SettingToggleRow key={id} label={label} hint={hint} value={value} onToggle={onToggle} />
);

export function PlayerViewSettingsPanel(): React.ReactElement {
  const { app, view } = useAtlasUI();
  const settingsService: SettingsService | undefined = view?.serviceManager?.getSettingsService();
  const switches = usePlayerViewSwitches(settingsService);

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">{t('lpv.shared')}</h3>
        {switches.shared.map(renderSwitch)}
        {switches.resources.map(renderSwitch)}
        {switches.tokens.map(renderSwitch)}
      </div>

      <div className="atlas-command-palette-panel-column">
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

        {switches.online.length > 0 && (
          <>
            <h3 className="atlas-command-palette-panel-heading">{t('lpv.online')}</h3>
            {switches.online.map(renderSwitch)}
          </>
        )}
      </div>
    </div>
  );
}
