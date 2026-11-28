import React from 'react';
import { EXPERIMENTAL_FEATURES } from '../../../experimental/experimentalFeatures';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { SettingToggleRow } from './SettingRows';

/** Features still in testing, each switched on or off for every map; all start off. */
export function ExperimentalFeaturesPanel(): React.ReactElement {
  const settings = useAtlasSettings();

  return (
    <div className="atlas-command-palette-panel">
      {EXPERIMENTAL_FEATURES.map(({ id, label, hint }) => {
        const on = settings?.get('experimental')[id] === true;
        return <SettingToggleRow key={id} label={label} hint={hint} value={on} onToggle={() => settings?.set('experimental', { [id]: !on })} />;
      })}
    </div>
  );
}
