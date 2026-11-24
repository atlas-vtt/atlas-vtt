import React from 'react';
import type { App } from 'obsidian';
import { SettingsService } from '../services/SettingsService';
import { useAtlasSettings } from '../keyboard/useMapHotkeys';
import { SettingToggleRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';

/** Whether the map's bars hide until the pointer comes near them (`useChromeAutoHide`), for every map of the vault. */
export function ToolbarOnHoverRow({ app }: { app: App }): React.JSX.Element {
  const settings = useAtlasSettings(SettingsService.forApp(app));
  const on = settings?.isToolbarAutoHide() === true;
  return (
    <div className="atlas-appearance-toggle">
      <SettingToggleRow
        label={t('toolbarEdit.showOnHover')}
        hint={t('appearance.toolbarOnHoverHint')}
        value={on}
        disabled={!settings}
        onToggle={() => settings?.setToolbarAutoHide(!on)}
      />
    </div>
  );
}
