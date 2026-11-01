import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Music, Play, Shuffle, SkipForward, Volume2, VolumeX, X } from 'lucide-react';
import { t } from '../../../../i18n';
import { SOUND_RATE } from '../../../../sound/engine/soundMath';
import type { SoundInfo } from '../../../../sound/soundTypes';
import { musicPosition, soundingMusic } from '../../../../soundDirector/musicList';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { useSoundValue } from './useSound';
import { IconAction } from './IconAction';
import { LevelSlider } from './LevelSlider';

const POSITION_MS = 250;

function clock(frames: number): string {
  const seconds = Math.max(0, Math.floor(frames / SOUND_RATE));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * What plays and where it is, written straight to its elements four times a second. A list goes on by
 * itself, so this reads the clock and not the state, and nothing around it renders for it.
 */
function MusicPositionLine({ director }: { director: SoundDirector }): React.JSX.Element {
  const nameRef = useRef<HTMLSpanElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const nextRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const write = (): void => {
      const line = nameRef.current;
      if (!line || line.offsetParent === null) return;
      const now = director.now();
      const play = soundingMusic(director.snapshot().mix.table, now);
      const position = play && musicPosition(play, now);
      const name = position ? (director.shelf.recordOfKey(position.track.key)?.name ?? '') : t('audio.noMusic');
      const time = position ? `${clock(position.frame)} / ${clock(position.frames)}` : '';
      const next = director.desk.nextTrack();
      const nextName = next ? t('audio.nextTrack', { name: director.shelf.recordOfKey(next.key)?.name ?? '' }) : '';
      if (line.textContent !== name) line.textContent = name;
      if (timeRef.current && timeRef.current.textContent !== time) timeRef.current.textContent = time;
      if (nextRef.current && nextRef.current.textContent !== nextName) nextRef.current.textContent = nextName;
      barRef.current?.setCssProps({ '--atlas-sound-position': String(position ? position.frame / Math.max(1, position.frames) : 0) });
    };
    write();
    const timer = window.setInterval(write, POSITION_MS);
    return () => window.clearInterval(timer);
  }, [director]);

  return (
    <div className="atlas-sound-position">
      <div className="atlas-sound-position__line">
        <span className="atlas-sound-position__name" ref={nameRef} />
        <span className="atlas-sound-position__time" ref={timeRef} />
      </div>
      <span className="atlas-sound-position__bar"><span ref={barRef} /></span>
      <span className="atlas-sound-position__next" ref={nextRef} />
    </div>
  );
}

const TrackRow = React.memo(function TrackRow({ director, track }: { director: SoundDirector; track: SoundInfo }): React.JSX.Element {
  const name = director.shelf.recordOfKey(track.key)?.name ?? '';
  return (
    <li className="atlas-sound-track">
      <IconAction label={t('audio.playTrack', { name })} icon={Play} onClick={() => director.desk.playTrack(track.key)} />
      <span className="atlas-sound-row__name">{name}</span>
      <IconAction label={t('audio.remove', { name })} icon={X} onClick={() => director.desk.removeTrack(track.key)} />
    </li>
  );
});

const NO_TRACKS: readonly SoundInfo[] = [];

/** The music: what plays, the list, and its fader. It reads each value on its own, so a fader moving renders this row alone. */
export const MusicRow = React.memo(function MusicRow({ director }: { director: SoundDirector }): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const none = useSoundValue(director, ({ mix }) => mix.table.music === null);
  const gainDb = useSoundValue(director, ({ mix }) => mix.table.music?.gainDb ?? 0);
  const muted = useSoundValue(director, ({ mix }) => mix.table.music?.muted === true);
  const tracks = useSoundValue(director, ({ mix }) => (mix.listChange ?? mix.table.music)?.tracks ?? NO_TRACKS);
  const shuffle = useSoundValue(director, ({ mix }) => (mix.listChange ?? mix.table.music)?.shuffle ?? false);
  const waitingTracks = useSoundValue(director, ({ mix }) => mix.waitingMusic?.tracks ?? NO_WAITING);
  const name = t('audio.music');
  return (
    <div className="atlas-sound-row atlas-sound-row--music">
      <div className="atlas-sound-row__head">
        <Music className="atlas-sound-row__icon" aria-hidden="true" />
        <MusicPositionLine director={director} />
        <IconAction label={t('audio.skip')} icon={SkipForward} disabled={none || tracks.length < 2} onClick={() => director.desk.skip()} />
        <IconAction label={t('audio.shuffle')} icon={Shuffle} pressed={shuffle} disabled={none} onClick={() => director.desk.setShuffle(!shuffle)} />
        <IconAction label={t('audio.tracks')} icon={open ? ChevronDown : ChevronRight} pressed={open} disabled={tracks.length === 0 && waitingTracks.length === 0} onClick={() => setOpen(!open)} />
      </div>
      <div className="atlas-sound-row__controls">
        <IconAction
          label={muted ? t('audio.unmute', { name }) : t('audio.mute', { name })}
          icon={muted ? VolumeX : Volume2}
          pressed={muted}
          disabled={none}
          onClick={() => director.desk.setMusicMuted(!muted)}
        />
        <LevelSlider label={t('audio.level', { name })} value={gainDb} disabled={none} onChange={(db) => director.desk.setMusicLevel(db)} />
      </div>
      {open && (
        <ul className="atlas-sound-tracks">
          {tracks.map((track) => <TrackRow key={track.key} director={director} track={track} />)}
          {waitingTracks.map((id) => {
            const waitingName = director.shelf.recordOf(id)?.name ?? '';
            return (
              <li key={id} className="atlas-sound-track" data-waiting="true">
                <span className="atlas-sound-tag">{t('audio.waiting')}</span>
                <span className="atlas-sound-row__name">{waitingName}</span>
                <IconAction label={t('audio.remove', { name: waitingName })} icon={X} onClick={() => director.desk.removeWaitingTrack(id)} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
});

const NO_WAITING: readonly string[] = [];
