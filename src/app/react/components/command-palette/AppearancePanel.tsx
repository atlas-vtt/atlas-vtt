import React, { useCallback, useSyncExternalStore } from 'react';
import { SegmentedControl, type SegmentedOption } from '../../../packages/components/primitives/SegmentedControl';
import { useAtlasSettings } from '../../../keyboard/useMapHotkeys';
import { useAtlasUI } from '../../root/AtlasUIContext';
import { LookService, type LookChoice } from '../../../appearance/lookService';
import { SettingChoiceRow } from './SettingRows';
import { t } from '../../../i18n';

export function lookOptions(): SegmentedOption<LookChoice>[] {
  return [
    { value: 'own', label: t('appearance.own') },
    { value: 'mediaeval', label: t('appearance.mediaeval') },
    { value: 'scifi', label: t('appearance.scifi') },
  ];
}

/** The look of this device, followed while the component shows. */
export function useLookChoice(looks: LookService): LookChoice {
  const subscribe = useCallback((changed: () => void) => looks.onChange(changed), [looks]);
  return useSyncExternalStore(subscribe, () => looks.get());
}

/** The Appearance page of the command palette: the GM's own theme or one of Atlas' looks. */
export function AppearancePanel(): React.ReactElement | null {
  const settings = useAtlasSettings();
  const { app } = useAtlasUI();
  return settings ? <LookRow looks={LookService.forApp(app, settings)} /> : null;
}

function LookRow({ looks }: { looks: LookService }): React.ReactElement {
  const look = useLookChoice(looks);
  return (
    <div className="atlas-command-palette-panel">
      <div className="atlas-command-palette-panel-column">
        <SettingChoiceRow label={t('appearance.look')} hint={t('appearance.lookHint')}>
          <SegmentedControl<LookChoice> value={look} options={lookOptions()} ariaLabel={t('appearance.look')} onChange={(choice) => looks.set(choice)} />
        </SettingChoiceRow>
      </div>
    </div>
  );
}
