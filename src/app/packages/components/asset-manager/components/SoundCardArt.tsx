import React, { useCallback, useSyncExternalStore } from 'react';
import { Music, Wind } from 'lucide-react';
import { t } from '../../../../i18n';
import { PlayersCardLine } from '../../../../react/components/dm-screen/sound/PlayersRow';
import { useAtlasUI } from '../../../../react/root/AtlasUIContext';
import { soundConversionOf, type SoundConversion } from '../../../../soundLibrary/soundConversion';
import type { SoundAsset } from '../types';

function stateText(conversion: SoundConversion, percent: number | null): string {
  switch (conversion.state) {
    case 'not-converted': return t('audio.state.notConverted');
    case 'ready': return t('audio.state.ready');
    case 'refused': return t(`audio.refused.${conversion.reason}`);
    case 'converting': return percent === null ? t('audio.state.converting') : t('audio.state.convertingPercent', { percent });
  }
}

/** A sound's card art: its kind, and how far it is from playing on this device. */
export function SoundCardArt({ asset }: { asset: SoundAsset }): React.JSX.Element {
  const { app } = useAtlasUI();
  const source = soundConversionOf(app);
  const subscribe = useCallback((listener: () => void) => source.onChanged(listener), [source]);
  const conversion = useSyncExternalStore(subscribe, () => source.stateOf(asset.record));
  const progress = conversion.state === 'converting' ? conversion.progress : null;
  const percent = progress === null ? null : Math.round(progress * 100);

  return (
    <div className="atlas-sound-art">
      {asset.record.kind === 'ambience' ? <Wind aria-hidden="true" /> : <Music aria-hidden="true" />}
      <span className="atlas-sound-state" data-state={asset.fileMissing ? 'missing' : conversion.state}>
        {asset.fileMissing ? t('audio.state.missing') : stateText(conversion, percent)}
        {!asset.fileMissing && progress !== null && (
          <span className="atlas-sound-state__bar" style={{ '--atlas-sound-progress': progress } as React.CSSProperties} />
        )}
      </span>
      <PlayersCardLine record={asset.record} />
    </div>
  );
}
