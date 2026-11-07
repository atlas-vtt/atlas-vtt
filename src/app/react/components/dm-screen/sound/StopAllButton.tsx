import React from 'react';
import { Delete, Play, Square } from 'lucide-react';
import { t } from '../../../../i18n';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { useSoundValue } from './useSound';

/** Always in the same place while something plays: Stop all fades it all out, Bring back starts it again where it stopped. */
export const StopAllButton = React.memo(function StopAllButton({ director }: { director: SoundDirector }): React.JSX.Element {
  const stopped = useSoundValue(director, ({ mix }) => mix.table.silenced);
  const Icon = stopped ? Play : Square;
  return (
    <LabelTooltip label={stopped ? t('audio.bringBackTip') : t('audio.stopAllTip')} shortcut="⌫" side="left" describe>
      <button type="button" className="atlas-sound-stop-all" aria-pressed={stopped} onClick={() => director.desk.toggleSilence()}>
        <Icon aria-hidden="true" />
        {stopped ? t('audio.bringBack') : t('audio.stopAll')}
        <span className="atlas-sound-cap" aria-hidden="true"><Delete /></span>
      </button>
    </LabelTooltip>
  );
});
