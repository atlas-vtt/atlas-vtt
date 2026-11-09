import React from 'react';
import { Pause, Play } from 'lucide-react';
import { t } from '../../../../../i18n';
import { LabelTooltip } from '../../../../../packages/components/primitives/tooltip';
import type { BackgroundProgress } from '../../../../../soundDirector/copyQueue';
import type { SoundDirector } from '../../../../../soundDirector/SoundDirector';
import { useSoundValue } from '../useSound';

/** The background's progress as one value React can compare: the shelf hands out a new object on every ask. */
function useConversionProgress(director: SoundDirector): BackgroundProgress | null {
  const progress = useSoundValue(director, () => {
    const now = director.shelf.background();
    return now ? `${now.done}/${now.total}/${now.paused ? 1 : 0}` : '';
  });
  if (progress === '') return null;
  const [done = 0, total = 0, paused = 0] = progress.split('/').map(Number);
  return { done, total, paused: paused === 1 };
}

/** How far the agreed folders' conversion has come, with its pause; nothing while the background has nothing to do. */
export function ConvertingLine({ director }: { director: SoundDirector }): React.JSX.Element | null {
  const progress = useConversionProgress(director);
  if (!progress) return null;
  const label = t(progress.paused ? 'audio.convertResume' : 'audio.convertPause');
  return (
    <div className="atlas-sound-lib__converting" data-paused={progress.paused || undefined}>
      <span>{t('audio.converting', { done: progress.done, total: progress.total })}</span>
      <LabelTooltip label={label}>
        <button type="button" className="atlas-sound-lib__more" aria-label={label} onClick={() => director.shelf.pauseBackground(!progress.paused)}>
          {progress.paused ? <Play aria-hidden="true" /> : <Pause aria-hidden="true" />}
        </button>
      </LabelTooltip>
    </div>
  );
}
