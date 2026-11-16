import React from 'react';
import { Blend, ChevronDown } from 'lucide-react';
import { t } from '../../../../i18n';
import type { SoundRecord } from '../../../../sound/soundTypes';
import { musicPosition, soundingMusic } from '../../../../soundDirector/musicList';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import type { SoundSnapshot } from '../../../../soundDirector/soundSnapshot';
import { SoundRecordStore } from '../../../../soundLibrary/SoundRecordStore';
import { LabelTooltip } from '../../../../packages/components/primitives/tooltip';
import { useAtlasUI } from '../../../root/AtlasUIContext';
import { useSoundValue } from './useSound';

/** Crossfades a track may have of its own, in seconds. */
const TRACK_FADES = [0, 1, 2, 3, 4, 6, 8, 12] as const;

/** The record of the track that sounds, or stands paused. */
function currentRecord(director: SoundDirector, { mix }: SoundSnapshot): SoundRecord | null {
  const now = mix.paused?.at ?? director.now();
  const play = mix.paused?.play ?? soundingMusic(mix.table, now);
  const key = play && musicPosition(play, now)?.track.key;
  return key ? director.shelf.recordOfKey(key) : null;
}

/**
 * How long the track that plays crossfades into the next, at its loop seam, and into its own start where it goes round
 * whole: a small dropdown that sets it on the track's record. `''` is unset, which follows the setting.
 */
export function TrackFade({ director }: { director: SoundDirector }): React.JSX.Element {
  const { app } = useAtlasUI();
  const id = useSoundValue(director, (snapshot) => currentRecord(director, snapshot)?.id ?? null);
  const value = useSoundValue(director, (snapshot) => {
    const seconds = currentRecord(director, snapshot)?.crossfadeSeconds;
    return seconds === undefined ? '' : String(seconds);
  });
  const label = t('audio.trackFade');
  return (
    <LabelTooltip label={label}>
      <label className="atlas-sound-music__pick atlas-sound-music__quiet" data-disabled={id === null || undefined} data-set={value !== '' || undefined}>
        <Blend className="atlas-sound-music__pick-icon" />
        <select
          className="dropdown"
          aria-label={label}
          disabled={id === null}
          value={value}
          onChange={(event) => {
            const next = event.currentTarget.value;
            if (id !== null) SoundRecordStore.forApp(app).update([id], { crossfadeSeconds: next === '' ? undefined : Number(next) });
          }}
        >
          <option value="">{t('audio.trackFadeDefault')}</option>
          {TRACK_FADES.map((seconds) => <option key={seconds} value={String(seconds)}>{t('audio.trackFadeSeconds', { seconds })}</option>)}
        </select>
        <ChevronDown className="atlas-sound-music__pick-chevron" />
      </label>
    </LabelTooltip>
  );
}
