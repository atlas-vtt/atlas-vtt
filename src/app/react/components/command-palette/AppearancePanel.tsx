import React from 'react';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { LookService } from '../../../appearance/lookService';
import { LookCards } from '../../../appearance/LookCards';
import { SettingChoiceRow } from './SettingRows';
import { t } from '../../../i18n';

/** The Appearance page of the command palette: the GM's own theme or one of Atlas' looks. */
export function AppearancePanel(): React.ReactElement | null {
  const settings = useAtlasSettings();
  const { app } = useAtlasUI();
  if (!settings) return null;
  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <SettingChoiceRow label={t('appearance.look')} hint={t('appearance.lookHint')}>
          <LookCards looks={LookService.forApp(app, settings)} size="compact" />
        </SettingChoiceRow>
      </div>
    </div>
  );
}
