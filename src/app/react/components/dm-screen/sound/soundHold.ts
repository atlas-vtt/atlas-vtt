import { t } from '../../../../i18n';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { useSoundValue } from './useSound';

/** How what sounds is held, for the words of a tile and a row: stopped (all of it), the music paused, or not held. */
export type SoundHold = 'stopped' | 'paused' | null;

export function useSoundHold(director: SoundDirector): SoundHold {
  return useSoundValue(director, ({ mix }): SoundHold => {
    if (mix.table.silenced) return 'stopped';
    return mix.paused !== undefined && mix.table.music === null ? 'paused' : null;
  });
}

/** The word for what sounds: Playing, or how it is held. */
export function holdWord(hold: SoundHold): string {
  if (hold === 'stopped') return t('audio.stopped');
  return hold === 'paused' ? t('audio.paused') : t('audio.playingTag');
}
