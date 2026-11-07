import React, { useEffect, useRef } from 'react';
import { t } from '../../../../i18n';
import { SOUND_RATE } from '../../../../sound/engine/soundMath';
import { musicPosition, soundingMusic } from '../../../../soundDirector/musicList';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { observeResize } from '../../../../utils/observeResize';
import { prefersReducedMotion } from '../../../../utils/motion';
import { useAtlasUI } from '../../../root/AtlasUIContext';
import { clock, POSITION_MS, REDUCED_POSITION_MS, writeText } from './musicClock';
import { MusicWave } from './musicWave';
import { CutTooltip } from './CutTooltip';
import { useWaveSeek } from './useWaveSeek';

/**
 * What plays and where it is, written straight to its elements four times a second. A list goes on by
 * itself, so this reads the clock and not the state, and nothing around it renders for it.
 */
export function MusicPosition({ director }: { director: SoundDirector }): React.JSX.Element {
  const { app } = useAtlasUI();
  const titleRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const totalRef = useRef<HTMLSpanElement>(null);
  const unplayedRef = useRef<HTMLCanvasElement>(null);
  const playedRef = useRef<HTMLCanvasElement>(null);
  const waveRef = useRef<HTMLDivElement>(null);
  const writeNow = useRef<() => void>(() => undefined);
  const { held, handlers } = useWaveSeek(director, () => writeNow.current());

  useEffect(() => {
    const unplayed = unplayedRef.current;
    const played = playedRef.current;
    if (!unplayed || !played) return undefined;
    const wave = new MusicWave(unplayed, played);
    const write = (): void => {
      if (!titleRef.current || titleRef.current.offsetParent === null) return;
      const { mix } = director.snapshot();
      // Paused music stands where it stopped.
      const now = mix.paused?.at ?? director.now();
      const play = mix.paused?.play ?? soundingMusic(mix.table, now);
      const position = play && musicPosition(play, now);
      const waiting = position ? null : mix.waitingMusic?.tracks[0];
      writeText(titleRef.current, position ? (director.shelf.recordOfKey(position.track.key)?.name ?? '') : (waiting && director.shelf.recordOf(waiting)?.name) ?? '');
      const next = mix.paused ? null : director.desk.nextTrack();
      // What goes round on itself has nothing to name, as a list of one never had.
      const following = position && next && next.key !== position.track.key ? t('audio.thenTrack', { name: director.shelf.recordOfKey(next.key)?.name ?? '' }) : '';
      const standing = mix.table.silenced ? t('audio.stopped') : mix.paused ? t('audio.paused') : null;
      const stops = position !== null && mix.stopAfter === position.track.key;
      writeText(nextRef.current, standing ?? (stops ? t('audio.stopsAfter') : position ? following : waiting ? t('audio.waiting') : ''));
      const frames = position?.frames ?? 0;
      const frame = position ? (held.current === null ? position.frame : Math.round(held.current * frames)) : 0;
      writeText(timeRef.current, position ? clock(frame) : '');
      writeText(totalRef.current, position ? t('audio.ofLength', { length: clock(frames) }) : '');
      wave.show(position ? director.shelf.peaksOfKey(position.track.key) : null, frame / Math.max(1, frames));
      waveRef.current?.setAttribute('aria-valuemax', String(Math.floor(frames / SOUND_RATE)));
      waveRef.current?.setAttribute('aria-valuenow', String(Math.floor(frame / SOUND_RATE)));
      waveRef.current?.setAttribute('aria-valuetext', t('audio.positionOf', { at: clock(frame), length: clock(frames) }));
    };
    writeNow.current = write;
    // Under reduced motion the played part moves once a second, with the clock's seconds, not four times.
    const timer = window.setInterval(write, prefersReducedMotion(unplayed) ? REDUCED_POSITION_MS : POSITION_MS);
    // The observer answers once the wave has its size, after layout and before paint, so the first write waits
    // for it: written here, it laid the desk out in the middle of a press and painted the wave twice.
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
  }, [app, director, held]);

  return (
    <>
      <CutTooltip><div className="atlas-sound-music__track" ref={titleRef} /></CutTooltip>
      <div className="atlas-sound-music__next" ref={nextRef} />
      <div ref={waveRef} className="atlas-sound-music__wave" role="slider" tabIndex={0} aria-label={t('audio.seek')} aria-valuemin={0} {...handlers}>
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
