import React, { useCallback, useSyncExternalStore } from 'react';
import type { LookService } from './lookService';
import { ColourSwatches } from './ColourSwatches';
import { IVY_LEAF } from './ivyPaint';
import { SettingChoiceRow } from '../react/components/command-palette/SettingRows';
import { t } from '../i18n';

const naturalStart = (): string => IVY_LEAF;

/**
 * The colour the Medieval look paints its ivy in: its own greens, a preset or a colour of the GM's, on this device.
 * The row keeps its place under the other looks, disabled, so the choices do not move as the look changes.
 */
export function IvyColourRow({ looks }: { looks: LookService }): React.JSX.Element {
  const subscribe = useCallback((changed: () => void): (() => void) => looks.onChange(changed), [looks]);
  const colour = useSyncExternalStore(subscribe, () => looks.ivyColour());
  const mediaeval = useSyncExternalStore(subscribe, () => looks.get() === 'mediaeval');
  return (
    <SettingChoiceRow label={t('appearance.ivy')} hint={t(mediaeval ? 'appearance.ivyHint' : 'appearance.ivyMediaevalOnly')}>
      <ColourSwatches
        label={t('appearance.ivy')}
        value={colour}
        base={{ label: t('appearance.ivyNatural'), className: 'atlas-accent-swatch--natural' }}
        disabled={!mediaeval}
        shape="leaf"
        onChange={(hex) => looks.setIvyColour(hex)}
        pickerStart={naturalStart}
      />
    </SettingChoiceRow>
  );
}
