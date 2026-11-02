import React from 'react';
import { Delete, Volume2, VolumeX } from 'lucide-react';
import { t } from '../../../../i18n';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { useSoundValue } from './useSound';

/** Always in the same place while something plays; a second press brings it all back where it would have been. */
export const SilenceButton = React.memo(function SilenceButton({ director }: { director: SoundDirector }): React.JSX.Element {
  const silenced = useSoundValue(director, ({ mix }) => mix.table.silenced);
  const Icon = silenced ? Volume2 : VolumeX;
  return (
    <button type="button" className="atlas-sound-silence" aria-pressed={silenced} onClick={() => director.desk.toggleSilence()}>
      <Icon aria-hidden="true" />
      {silenced ? t('audio.bringBack') : t('audio.silence')}
      <span className="atlas-sound-cap"><Delete aria-hidden="true" /></span>
    </button>
  );
});
