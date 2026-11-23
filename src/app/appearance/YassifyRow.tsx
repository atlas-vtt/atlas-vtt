import React, { useCallback, useSyncExternalStore } from 'react';
import type { LookService } from './lookService';
import { SettingToggleRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';

/** Yassify: a bow on every token on the map (`TokenBows`), under any look, on this device. */
export function YassifyRow({ looks }: { looks: LookService }): React.JSX.Element {
  const subscribe = useCallback((changed: () => void): (() => void) => looks.onChange(changed), [looks]);
  const on = useSyncExternalStore(subscribe, () => looks.yassify());
  return (
    <div className="atlas-appearance-yassify">
      <SettingToggleRow label={t('appearance.yassify')} hint={t('appearance.yassifyHint')} value={on} onToggle={() => looks.setYassify(!on)} />
    </div>
  );
}
