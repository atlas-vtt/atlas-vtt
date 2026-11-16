import React, { useCallback, useSyncExternalStore } from 'react';
import { SettingToggleRow } from './SettingRows';
import type { AtlasView } from '../../../atlas-view';
import { usePlayedSystemCampaign } from '../../../campaigns/usePlayedSystemCampaign';
import { slottedResources } from '../../../resources/resourceSlots';
import { toggleHidden } from '../../../resources/sceneVisibility';
import { useResourcesOfMap } from '../../../resources/useMapResources';
import { resourceToggleLabel } from './resourceToggleLabel';
import { DEFAULT_TOKEN_SETTINGS } from '../../../storeFactory';
import { t } from '../../../i18n';

type TokenToggleKey = 'showNameplates' | 'showInstanceBadges';

const TOGGLES: ReadonlyArray<{ key: TokenToggleKey; label: string; hint?: string }> = [
  { key: 'showNameplates', label: t('tokens.showNameplates') },
  { key: 'showInstanceBadges', label: t('tokens.showBadges'), hint: t('tokens.showBadgesHint') },
];

interface TokenSettingsPanelProps {
  view: AtlasView | null;
}

/**
 * What this map shows on its tokens: nameplates, instance numbers, and each resource of the rules it plays by,
 * which a played campaign's game system replaces. The palette does not re-render on store changes or rule
 * edits, so the panel follows the scene's settings and the rules itself.
 */
export function TokenSettingsPanel({ view }: TokenSettingsPanelProps): React.ReactElement {
  const store = view?.atlasStore;
  const subscribe = useCallback((listener: () => void): (() => void) => store?.subscribe(listener) ?? ((): void => undefined), [store]);
  const tokenSettings = useSyncExternalStore(subscribe, () => store?.getState().tokenSettings) ?? DEFAULT_TOKEN_SETTINGS;
  const mapPath = useSyncExternalStore(subscribe, () => store?.getState().mapPath);
  const definitions = useResourcesOfMap(view && store ? view.app : null, mapPath);
  const played = usePlayedSystemCampaign(view?.app);
  const hidden = tokenSettings.hiddenResources ?? [];

  const change = (changes: Partial<typeof tokenSettings>): void => {
    if (!store) return;
    store.getState().setTokenSettings({ ...store.getState().tokenSettings, ...changes });
  };

  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        {TOGGLES.map(({ key, label, hint }) => (
          <SettingToggleRow
            key={key}
            label={label}
            hint={hint}
            value={Boolean(tokenSettings[key])}
            onToggle={() => change({ [key]: !tokenSettings[key] })}
          />
        ))}
      </div>
      <div className="atlas-command-palette-panel-column">
        {played && <span className="atlas-setting-hint" role="note">{t('csm.playedCampaign', { name: played.campaign.name })}</span>}
        {slottedResources(definitions).map(({ definition, slot }) => (
          <SettingToggleRow
            key={definition.key}
            label={resourceToggleLabel(definition, slot)}
            value={!hidden.includes(definition.key)}
            onToggle={() => change({ hiddenResources: toggleHidden(store?.getState().tokenSettings?.hiddenResources, definition.key) })}
          />
        ))}
      </div>
    </div>
  );
}
