import React from 'react';
import { SettingToggleRow } from './SettingRows';
import type { AtlasView } from '../../../atlas-view';
import { AssetService } from '../../../services/AssetService';
import { mapResources } from '../../../resources/collectionResources';
import { slottedResources } from '../../../resources/resourceSlots';
import { toggleHidden } from '../../../resources/sceneVisibility';
import { shapeOf } from '../../../resources/visibleResources';
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

/** What this map shows on its tokens: nameplates, instance numbers, and each resource of its collection. */
export function TokenSettingsPanel({ view }: TokenSettingsPanelProps): React.ReactElement {
  const store = view?.atlasStore;
  const tokenSettings = store?.getState()?.tokenSettings ?? DEFAULT_TOKEN_SETTINGS;
  const definitions = view && store ? mapResources(AssetService.getInstance(view.app), store.getState().mapPath) : [];
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
        {slottedResources(definitions).map(({ definition, slot }) => (
          <SettingToggleRow
            key={definition.key}
            label={t(shapeOf(slot) === 'bar' ? 'resource.showBars' : 'resource.showWheels', { name: definition.name })}
            value={!hidden.includes(definition.key)}
            onToggle={() => change({ hiddenResources: toggleHidden(store?.getState().tokenSettings?.hiddenResources, definition.key) })}
          />
        ))}
      </div>
    </div>
  );
}
