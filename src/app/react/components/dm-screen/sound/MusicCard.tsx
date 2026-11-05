import React, { useCallback, useState } from 'react';
import { ArrowRightToLine, ListMusic, Pause, Play, Repeat, Repeat1, Shuffle, SkipBack, SkipForward, Volume1, VolumeX } from 'lucide-react';
import { t } from '../../../../i18n';
import type { MusicRepeat } from '../../../../sound/soundTypes';
import { shownMusic } from '../../../../soundDirector/musicPause';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { IconAction } from './IconAction';
import { MusicPosition } from './MusicPosition';
import { TrackList } from './TrackList';
import { useSoundValue } from './useSound';
import { SOUND_KEYS } from './useSoundKeys';
import { ReverbKnob } from './ReverbKnob';
import { useRoomName } from './useRoomName';
import { VerticalFader } from './VerticalFader';

const REPEATS = {
  all: { icon: Repeat, label: 'audio.repeatAll', next: 'one' },
  one: { icon: Repeat1, label: 'audio.repeatOne', next: 'off' },
  off: { icon: ArrowRightToLine, label: 'audio.repeatOff', next: undefined },
} as const satisfies Record<string, { icon: React.ComponentType; label: string; next: MusicRepeat | undefined }>;

/** The music: what plays, how it goes on, and its fader. A fader moving renders its own strip alone. */
export const MusicCard = React.memo(function MusicCard({ director }: { director: SoundDirector }): React.JSX.Element | null {
  const [listOpen, setListOpen] = useState(false);
  const none = useSoundValue(director, ({ mix }) => shownMusic(mix) === null && mix.waitingMusic === null);
  const playing = useSoundValue(director, ({ mix }) => mix.table.music !== null);
  const paused = useSoundValue(director, ({ mix }) => mix.paused !== undefined);
  const gainDb = useSoundValue(director, ({ mix }) => shownMusic(mix)?.gainDb ?? 0);
  const muted = useSoundValue(director, ({ mix }) => shownMusic(mix)?.muted === true);
  const shuffle = useSoundValue(director, ({ mix }) => (mix.listChange ?? shownMusic(mix))?.shuffle ?? false);
  const repeat = useSoundValue(director, ({ mix }) => (mix.listChange ?? shownMusic(mix))?.repeat);
  const trackCount = useSoundValue(director, ({ mix }) => (mix.listChange ?? mix.table.music)?.tracks.length ?? 0);
  const setLevel = useCallback((db: number) => director.desk.setMusicLevel(db), [director]);
  const reverb = useSoundValue(director, ({ mix }) => shownMusic(mix)?.reverb ?? 0);
  const room = useRoomName(director);
  const name = t('audio.music');
  const repeating = REPEATS[repeat ?? 'all'];

  if (none) return null;

  return (
    <div className="atlas-sound-music atlas-sound-card">
      <div className="atlas-sound-music__body" data-list-open={listOpen || undefined}>
        <MusicPosition director={director} />
        {listOpen && <TrackList director={director} />}
        <div className="atlas-sound-music__actions">
          <IconAction label={t('audio.tracks')} icon={ListMusic} pressed={listOpen} className="atlas-sound-music__quiet atlas-sound-music__list" onClick={() => setListOpen(!listOpen)} />
          <IconAction label={t('audio.shuffle')} icon={Shuffle} pressed={shuffle} disabled={!playing} className="atlas-sound-music__quiet" onClick={() => director.desk.setShuffle(!shuffle)} />
          <IconAction label={t(repeating.label)} icon={repeating.icon} pressed={repeat !== undefined} disabled={!playing} className="atlas-sound-music__quiet" onClick={() => director.desk.setRepeat(repeating.next)} />
          <IconAction label={t('audio.back')} icon={SkipBack} disabled={!playing} className="atlas-sound-music__transport" onClick={() => director.desk.back()} />
          <IconAction
            label={paused ? t('audio.playMusic') : t('audio.pauseMusic')}
            icon={paused ? Play : Pause}
            disabled={!playing && !paused}
            shortcut={SOUND_KEYS.pauseMusic}
            className="atlas-sound-music__pause atlas-sound-music__transport"
            onClick={() => director.desk.togglePause()}
          />
          <IconAction label={t('audio.skip')} icon={SkipForward} disabled={trackCount < 2} shortcut={SOUND_KEYS.skipTrack} className="atlas-sound-music__transport" onClick={() => director.desk.skip()} />
        </div>
      </div>
      <div className="atlas-sound-strip atlas-sound-strip--music">
        <div className="atlas-sound-strip__top">
          <IconAction
            label={muted ? t('audio.unmute', { name }) : t('audio.mute', { name })}
            icon={muted ? VolumeX : Volume1}
            pressed={muted}
            disabled={!playing && !paused}
            onClick={() => director.desk.setMusicMuted(!muted)}
          />
        </div>
        <div className="atlas-sound-strip__send">
          <ReverbKnob name={name} room={room} value={reverb} disabled={!playing && !paused} onChange={(amount) => director.desk.setMusicReverb(amount)} />
        </div>
        <VerticalFader label={t('audio.level', { name })} value={gainDb} meter="music" onChange={setLevel} />
        <div className="atlas-sound-strip__name"><span>{name}</span></div>
      </div>
    </div>
  );
});
