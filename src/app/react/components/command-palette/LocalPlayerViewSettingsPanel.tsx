import React from 'react';
import { MonitorUp } from 'lucide-react';
import { Button } from '../../../packages/components/primitives/button';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { openPlayerWindow } from '../../../services/PlayerWindowPresenter';
import type { SettingsService } from '../../../services/SettingsService';
import { SettingRow, SettingToggleRow } from './SettingRows';
import { usePlayerViewSwitches, type PlayerViewSwitch } from './playerViewSwitches';
import { t } from '../../../i18n';

const renderSwitch = ({ id, label, value, onToggle }: PlayerViewSwitch): React.ReactElement => (
  <SettingToggleRow key={id} label={label} value={value} onToggle={onToggle} />
);

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
