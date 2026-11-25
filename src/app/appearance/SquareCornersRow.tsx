import React, { useCallback, useSyncExternalStore } from 'react';
import type { LookService } from './lookService';
import { SettingToggleRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';

/** Square corners everywhere in Atlas, for a retro look, on this device (`styles/_square-corners.scss`). */
export function SquareCornersRow({ looks }: { looks: LookService }): React.JSX.Element {
  const subscribe = useCallback((changed: () => void): (() => void) => looks.onChange(changed), [looks]);
  const on = useSyncExternalStore(subscribe, () => looks.squareCorners());
  return (
    <div className="atlas-appearance-toggle">
      <SettingToggleRow label={t('appearance.squareCorners')} hint={t('appearance.squareCornersHint')} value={on} onToggle={() => looks.setSquareCorners(!on)} />
    </div>
  );
}
