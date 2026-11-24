import React, { useCallback, useSyncExternalStore } from 'react';
import type { LookService } from './lookService';
import { SettingToggleRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';

/**
 * Whether the Atlas look on lets the map show through what stands on it, on this device; each look keeps its own
 * choice. Under the GM's own theme the row keeps its place, off and disabled, so the choices do not move.
 */
export function GlassRow({ looks }: { looks: LookService }): React.JSX.Element {
  const subscribe = useCallback((changed: () => void): (() => void) => looks.onChange(changed), [looks]);
  const on = useSyncExternalStore(subscribe, () => looks.glass());
  const atlasLook = useSyncExternalStore(subscribe, () => looks.get() !== 'own');
  return (
    <div className="atlas-appearance-glass">
      <SettingToggleRow
        label={t('appearance.glass')}
        hint={t(atlasLook ? 'appearance.glassHint' : 'appearance.glassLooksOnly')}
        value={on}
        disabled={!atlasLook}
        onToggle={() => looks.setGlass(!on)}
      />
    </div>
  );
}
