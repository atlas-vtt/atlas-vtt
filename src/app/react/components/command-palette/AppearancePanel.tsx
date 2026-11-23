import React from 'react';
import { Button } from '../../../packages/components/primitives/button';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { atlasThemeActive, switchToAtlasTheme, type AtlasLook } from '../../../appearance/atlasLook';
import { SettingChoiceRow, SettingRow } from './SettingRows';
import { t } from '../../../i18n';

export function lookOptions(): SegmentedOption<AtlasLook>[] {
  return [
    { value: 'mediaeval', label: t('appearance.mediaeval') },
    { value: 'scifi', label: t('appearance.scifi') },
  ];
}

/**
 * The Appearance page of the command palette, listed while the Atlas theme is installed: the theme's look. While
 * another theme is in use the look stays in place, disabled, under a row that switches to the Atlas theme.
 */
export function AppearancePanel(): React.ReactElement {
  const settings = useAtlasSettings();
  const { app } = useAtlasUI();
  const active = atlasThemeActive(app);
  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        {!active && (
          <SettingRow label={t('appearance.useTheme')} hint={t('appearance.useThemeHint')}>
            <Button variant="secondary" onClick={() => switchToAtlasTheme(app)}>{t('appearance.useThemeButton')}</Button>
          </SettingRow>
        )}
        <SettingChoiceRow label={t('appearance.look')} hint={t('appearance.lookHint')}>
          <SegmentedControl<AtlasLook>
            value={settings?.getLook() ?? 'mediaeval'}
            options={lookOptions()}
            ariaLabel={t('appearance.look')}
            disabled={!active}
            onChange={(look) => settings?.setLook(look)}
          />
        </SettingChoiceRow>
      </div>
    </div>
  );
}
