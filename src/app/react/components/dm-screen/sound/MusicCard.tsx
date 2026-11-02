import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ListMusic, Play, Shuffle, SkipForward, Volume1, VolumeX, X } from 'lucide-react';
import { t } from '../../../../i18n';
import { SOUND_RATE } from '../../../../sound/engine/soundMath';
import type { SoundInfo } from '../../../../sound/soundTypes';
import { musicPosition, soundingMusic } from '../../../../soundDirector/musicList';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { observeResize } from '../../../../utils/observeResize';
import { useAtlasUI } from '../../../root/AtlasUIContext';
import { IconAction } from './IconAction';
import { MusicWave } from './musicWave';
import { useSoundValue } from './useSound';
import { VerticalFader } from './VerticalFader';

const POSITION_MS = 250;

function clock(frames: number): string {
  const seconds = Math.max(0, Math.floor(frames / SOUND_RATE));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

function writeText(element: HTMLElement | null, text: string): void {
  if (element && element.textContent !== text) element.textContent = text;
}

/**
 * What plays and where it is, written straight to its elements four times a second. A list goes on by
 * itself, so this reads the clock and not the state, and nothing around it renders for it.
 */
function MusicPosition({ director, listOpen }: { director: SoundDirector; listOpen: boolean }): React.JSX.Element {
  const { app } = useAtlasUI();
  const titleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const unplayedRef = useRef<HTMLCanvasElement>(null);
  const playedRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const unplayed = unplayedRef.current;
    const played = playedRef.current;
    if (!unplayed || !played) return undefined;
    const wave = new MusicWave(unplayed, played);
    const write = (): void => {
      if (!titleRef.current || titleRef.current.offsetParent === null) return;
      const now = director.now();
      const { mix } = director.snapshot();
      const play = soundingMusic(mix.table, now);
      const position = play && musicPosition(play, now);
      const waiting = position ? null : mix.waitingMusic?.tracks[0];
      writeText(titleRef.current, position ? (director.shelf.recordOfKey(position.track.key)?.name ?? '') : (waiting && director.shelf.recordOf(waiting)?.name) ?? '');
      const next = director.desk.nextTrack();
      writeText(nextRef.current, position ? (next ? t('audio.thenTrack', { name: director.shelf.recordOfKey(next.key)?.name ?? '' }) : '') : t('audio.waiting'));
      writeText(timeRef.current, position ? clock(position.frame) : '');
      writeText(totalRef.current, position ? t('audio.ofLength', { length: clock(position.frames) }) : '');
      wave.show(position ? director.shelf.peaksOfKey(position.track.key) : null, position ? position.frame / Math.max(1, position.frames) : 0);
    };
    write();
    const timer = window.setInterval(write, POSITION_MS);
    const stopObserving = observeResize([unplayed], () => {
      wave.repaint();
      write();
    });
    const themeRef = app.workspace.on('css-change', () => wave.repaint());
    return () => {
      window.clearInterval(timer);
      stopObserving();
      app.workspace.offref(themeRef);
    };
  }, [app, director]);

  return (
    <>
      <div className="atlas-sound-music__track" ref={titleRef} />
      <div className="atlas-sound-music__next" ref={nextRef} />
      <div className="atlas-sound-music__wave" hidden={listOpen}>
        <canvas className="atlas-sound-music__unplayed" ref={unplayedRef} />
        <canvas className="atlas-sound-music__played" ref={playedRef} />
      </div>
      <div className="atlas-sound-music__clock">
        <span className="atlas-sound-music__time" ref={timeRef} />
        <span className="atlas-sound-music__total" ref={totalRef} />
      </div>
    </>
  );
}

const TrackRow = React.memo(function TrackRow({ director, track }: { director: SoundDirector; track: SoundInfo }): React.JSX.Element {
  const name = director.shelf.recordOfKey(track.key)?.name ?? '';
  return (
    <li className="atlas-sound-track">
      <IconAction label={t('audio.playTrack', { name })} icon={Play} onClick={() => director.desk.playTrack(track.key)} />
      <span>{name}</span>
      <IconAction label={t('audio.remove', { name })} icon={X} onClick={() => director.desk.removeTrack(track.key)} />
    </li>
  );
});

const NO_TRACKS: readonly SoundInfo[] = [];
const NO_WAITING: readonly string[] = [];

/** The list a mood plays through, in the place of the waveform while it is open. */
function TrackList({ director }: { director: SoundDirector }): React.JSX.Element {
  const tracks = useSoundValue(director, ({ mix }) => (mix.listChange ?? mix.table.music)?.tracks ?? NO_TRACKS);
  const waiting = useSoundValue(director, ({ mix }) => mix.waitingMusic?.tracks ?? NO_WAITING);
  return (
    <ul className="atlas-sound-tracks">
      {tracks.map((track) => <TrackRow key={track.key} director={director} track={track} />)}
      {waiting.map((id) => {
        const name = director.shelf.recordOf(id)?.name ?? '';
        return (
          <li key={id} className="atlas-sound-track" data-waiting="true">
            <span className="atlas-sound-track__waiting">{t('audio.waiting')}</span>
            <span>{name}</span>
            <IconAction label={t('audio.remove', { name })} icon={X} onClick={() => director.desk.removeWaitingTrack(id)} />
          </li>
        );
      })}
    </ul>
  );
}

/** The music: what plays, how it goes on, and its fader. A fader moving renders its own strip alone. */
export const MusicCard = React.memo(function MusicCard({ director }: { director: SoundDirector }): React.JSX.Element | null {
  const [listOpen, setListOpen] = useState(false);
  const none = useSoundValue(director, ({ mix }) => mix.table.music === null && mix.waitingMusic === null);
  const playing = useSoundValue(director, ({ mix }) => mix.table.music !== null);
  const gainDb = useSoundValue(director, ({ mix }) => mix.table.music?.gainDb ?? 0);
  const muted = useSoundValue(director, ({ mix }) => mix.table.music?.muted === true);
  const shuffle = useSoundValue(director, ({ mix }) => (mix.listChange ?? mix.table.music)?.shuffle ?? false);
  const trackCount = useSoundValue(director, ({ mix }) => (mix.listChange ?? mix.table.music)?.tracks.length ?? 0);
  const setLevel = useCallback((db: number) => director.desk.setMusicLevel(db), [director]);
  const name = t('audio.music');

  if (none) return null;

  return (
    <div className="atlas-sound-music atlas-sound-card">
      <div className="atlas-sound-music__body">
        <MusicPosition director={director} listOpen={listOpen} />
        {listOpen && <TrackList director={director} />}
        <div className="atlas-sound-music__actions">
          <IconAction label={t('audio.tracks')} icon={ListMusic} pressed={listOpen} className="atlas-sound-music__list" onClick={() => setListOpen(!listOpen)} />
          <IconAction label={t('audio.shuffle')} icon={Shuffle} pressed={shuffle} disabled={!playing} onClick={() => director.desk.setShuffle(!shuffle)} />
          <IconAction label={t('audio.skip')} icon={SkipForward} disabled={trackCount < 2} onClick={() => director.desk.skip()} />
        </div>
      </div>
      <div className="atlas-sound-strip atlas-sound-strip--music">
        <div className="atlas-sound-strip__top">
          <IconAction
            label={muted ? t('audio.unmute', { name }) : t('audio.mute', { name })}
            icon={muted ? VolumeX : Volume1}
            pressed={muted}
            disabled={!playing}
            onClick={() => director.desk.setMusicMuted(!muted)}
          />
        </div>
        <VerticalFader label={t('audio.level', { name })} value={gainDb} meter="music" onChange={setLevel} />
        <div className="atlas-sound-strip__name"><span>{name}</span></div>
      </div>
    </div>
  );
});
