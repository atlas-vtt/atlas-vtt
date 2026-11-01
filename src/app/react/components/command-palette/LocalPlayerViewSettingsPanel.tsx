import React, { useCallback, useEffect, useState } from 'react';
import { MonitorUp } from 'lucide-react';
import type { App } from 'obsidian';
import { Button } from '../../../packages/components/primitives/button';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { useAtlasStore } from '../../ViewStoreContext';
import { slottedResources } from '../../../resources/resourceSlots';
import { useMapResources } from '../../../resources/useMapResources';
import { mapRules, updateMapRules } from '../../../services/mapRules';
import { runInBackground } from '../../../utils/backgroundTask';
import { openPlayerWindow } from '../../../services/PlayerWindowPresenter';
import { SettingsService, type AtlasSettings } from '../../../services/SettingsService';
import { useExperimentalFeature } from '../../hooks/useExperimentalFeature';
import { SettingRow, SettingToggleRow } from './SettingRows';
import { resourceToggleLabel } from './resourceToggleLabel';
import { t } from '../../../i18n';

const DEFAULT_LOCAL_PLAYER_VIEW_SETTINGS = {
  showToolbar: false,
  showTokenNameplates: false,
  showNotePreviews: false,
  showWidgets: true,
  showInitiative: true,
  showDiceRolls: false,
  showCommandPalette: false,
  showCursors: false,
};

type LocalPlayerViewSettings = AtlasSettings['localPlayerView'];
type LocalPlayerViewToggleKey = Exclude<keyof LocalPlayerViewSettings, 'showToolbar' | 'showCommandPalette' | 'showNotePreviews'>;

const UI_TOGGLES: ReadonlyArray<{ key: LocalPlayerViewToggleKey; label: string }> = [
  { key: 'showWidgets', label: t('lpv.showWidgets') },
  { key: 'showInitiative', label: t('lpv.showInitiative') },
  { key: 'showDiceRolls', label: t('lpv.showDiceRolls') },
];

/** What only an online table has: shown while online play is switched on. */
const ONLINE_TOGGLES: ReadonlyArray<{ key: LocalPlayerViewToggleKey; label: string }> = [
  { key: 'showCursors', label: t('lpv.showCursors') },
];

const TOKEN_TOGGLES: ReadonlyArray<{ key: LocalPlayerViewToggleKey; label: string }> = [
  { key: 'showTokenNameplates', label: t('tokens.showNameplates') },
];

/**
 * One switch per resource of the rules the open scene plays by, bars and wheels alike: whether
 * players see it. The player window shows the wheels they see at rest, as it cannot hover or select.
 */
function PlayerResourceToggles({ app }: { app: App }): React.ReactElement | null {
  const resources = useMapResources();
  const mapPath = useAtlasStore((state) => state.mapPath);
  const { source } = mapRules(app, mapPath);
  if (source.kind === 'none') return null;

  const toggle = (key: string): void => {
    const next = resources.map((resource) => (
      resource.key === key ? { ...resource, visibleToPlayers: !resource.visibleToPlayers } : resource
    ));
    runInBackground(updateMapRules(app, source, { resources: next }), 'Saving what players see');
  };

  return (
    <>
      {slottedResources(resources).map(({ definition: resource, slot }) => (
        <SettingToggleRow
          key={resource.key}
          label={resourceToggleLabel(resource, slot)}
          value={resource.visibleToPlayers}
          onToggle={() => toggle(resource.key)}
        />
      ))}
    </>
  );
}

export function LocalPlayerViewSettingsPanel(): React.ReactElement {
  const { app, view } = useAtlasUI();
  const settingsService: SettingsService | undefined = view?.serviceManager?.getSettingsService();
  const onlinePlay = useExperimentalFeature('onlinePlay', settingsService);
  const [localSettings, setLocalSettings] = useState<LocalPlayerViewSettings>(
    () => settingsService?.getLocalPlayerViewSettings() || DEFAULT_LOCAL_PLAYER_VIEW_SETTINGS,
  );

  const [view4k, setView4k] = useState(() => settingsService?.isPlayerView4k() ?? false);

  useEffect(() => {
    if (!settingsService) return;
    setLocalSettings(settingsService.getLocalPlayerViewSettings());
    setView4k(settingsService.isPlayerView4k());
    return settingsService.onChange((settings) => {
      setLocalSettings(settings.localPlayerView);
      setView4k(settingsService.isPlayerView4k());
    });
  }, [settingsService]);

  const updateSettings = useCallback(
    (updates: Partial<LocalPlayerViewSettings>): void => {
      if (settingsService) {
        settingsService.setLocalPlayerViewSettings(updates);
      }
    },
    [settingsService],
  );

  const renderToggle = ({ key, label }: { key: LocalPlayerViewToggleKey; label: string }): React.ReactElement => (
    <SettingToggleRow
      key={key}
      label={label}
      value={localSettings[key]}
      onToggle={() => updateSettings({ [key]: !localSettings[key] })}
    />
  );

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">{t('lpv.interface')}</h3>
        {UI_TOGGLES.map(renderToggle)}
        {onlinePlay && ONLINE_TOGGLES.map(renderToggle)}
        <SettingToggleRow
          label={t('lpv.view4k')}
          hint={t('lpv.view4kHint')}
          value={view4k}
          onToggle={() => settingsService?.setPlayerView4k(!view4k)}
        />
      </div>

      <div className="atlas-command-palette-panel-column">
        <h3 className="atlas-command-palette-panel-heading">{t('lpv.tokens')}</h3>
        <PlayerResourceToggles app={app} />
        {TOKEN_TOGGLES.map(renderToggle)}
        <SettingRow label={t('lpv.notePreviews')} hint={t('lpv.notePreviewsHint')}>{null}</SettingRow>

        <Button variant="default" size="sm" className="atlas-command-palette-cta" onClick={() => void openPlayerWindow(app)}>
          <MonitorUp />
          {t('lpv.openWindow')}
        </Button>
      </div>
    </div>
  );
}
