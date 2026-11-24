import React, { useCallback, useSyncExternalStore } from 'react';
import type { LookService } from './lookService';
import { SettingToggleRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';

/** Yassify: every token on the map wears a bow, shows its nails and holds a tumbler (`TokenYassify`), under any look, on this device. */
export function YassifyRow({ looks }: { looks: LookService }): React.JSX.Element {
  const subscribe = useCallback((changed: () => void): (() => void) => looks.onChange(changed), [looks]);
  const on = useSyncExternalStore(subscribe, () => looks.yassify());
  return (
    <div className="atlas-appearance-yassify">
      <SettingToggleRow label={t('appearance.yassify')} hint={t('appearance.yassifyHint')} value={on} onToggle={() => looks.setYassify(!on)} />
    </div>
  );
}
