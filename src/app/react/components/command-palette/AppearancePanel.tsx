import React from 'react';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { LookService } from '../../../appearance/lookService';
import { AppearanceChoices } from '../../../appearance/AppearanceChoices';

/** The Appearance settings page of the command palette: the GM's own theme or one of Atlas' looks, and the accent colour. */
export function AppearancePanel(): React.ReactElement | null {
  const settings = useAtlasSettings();
  const { app } = useAtlasUI();
  if (!settings) return null;
  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <AppearanceChoices app={app} looks={LookService.forApp(app, settings)} />
      </div>
    </div>
  );
}
