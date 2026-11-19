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
import { WaveHover } from './waveHover';
import { shareAt, useWaveSeek } from './useWaveSeek';
import { useContextMenu } from '../../../root/ContextMenuContext';
import { SoundRecordStore } from '../../../../soundLibrary/SoundRecordStore';
import { loopMenu, saveLoop } from './loopMenu';
import { MIN_LOOP_FRAMES, withLoopIn, withLoopOut, type LoopPoints } from '../../../../soundLibrary/loopPoints';
import type { SoundRecord } from '../../../../sound/soundTypes';

/** How long a dragged loop stands as it was let go while its record is written. */
const DRAGGED_HOLD_MS = 2000;

/** The track that sounds and its record, for what acts on its loop points. */
function playingTrack(director: SoundDirector): { record: SoundRecord; frames: number } | null {
  const now = director.now();
  const play = soundingMusic(director.snapshot().mix.table, now);
  const position = play && musicPosition(play, now);
  const record = position && director.shelf.recordOfKey(position.track.key);
  return position && record ? { record, frames: position.track.frames } : null;
}

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
  const loopRef = useRef<HTMLDivElement>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  const hoverTimeRef = useRef<HTMLSpanElement>(null);
  // Where a mouse or pen rests over the wave, as a share of it; null while none does.
  const pointer = useRef<number | null>(null);
  const placeHover = useRef<() => void>(() => undefined);
  const menu = useContextMenu();
  // A loop edge the GM drags along the wave: what it shows until the record holds it.
  const dragged = useRef<{ loop: LoopPoints; edge: 'in' | 'out' | null; record: SoundRecord; frames: number; until: number } | null>(null);
  const writeNow = useRef<() => void>(() => undefined);
  const { held, handlers } = useWaveSeek(director, () => writeNow.current());

  useEffect(() => {
    const unplayed = unplayedRef.current;
    const played = playedRef.current;
    if (!unplayed || !played) return undefined;
    const wave = new MusicWave(unplayed, played);
    const hover = hoverRef.current && hoverTimeRef.current ? new WaveHover(hoverRef.current, hoverTimeRef.current) : null;
    let shownFrames = 0;
    // The line follows a loop edge being dragged, else a press held on the wave, else the pointer.
    placeHover.current = () => {
      const drag = dragged.current;
      if (drag?.edge) hover?.show((drag.edge === 'in' ? drag.loop.startFrame : drag.loop.endFrame) / drag.frames, drag.frames);
      else hover?.show(held.current ?? pointer.current, shownFrames);
    };
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
      // The whole track, whatever it goes round in: the wave shows it all, with its loop points over it.
      const frames = position?.track.frames ?? 0;
      const drag = dragged.current;
      if (drag && drag.edge === null && Date.now() > drag.until) dragged.current = null;
      const loop = position ? (dragged.current?.loop ?? director.shelf.recordOfKey(position.track.key)?.loop) : undefined;
      const band = loopRef.current;
      if (band) {
        band.hidden = !loop || frames === 0;
        if (loop && frames > 0) {
          band.setCssProps({
            '--atlas-sound-loop-start': `${(loop.startFrame / frames) * 100}%`,
            '--atlas-sound-loop-width': `${((loop.endFrame - loop.startFrame) / frames) * 100}%`,
          });
        }
      }
      const frame = position ? (held.current === null ? position.frame : Math.round(held.current * frames)) : 0;
      shownFrames = frames;
      placeHover.current();
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
      <div
        ref={waveRef}
        className="atlas-sound-music__wave"
        role="slider"
        tabIndex={0}
        aria-label={t('audio.seek')}
        aria-valuemin={0}
        {...handlers}
        // In the capture phase, so a loop edge that keeps its own moves still moves the line.
        onPointerMoveCapture={(event) => {
          pointer.current = event.pointerType === 'touch' ? null : shareAt(event.currentTarget, event.clientX);
          placeHover.current();
        }}
        onPointerLeave={() => {
          pointer.current = null;
          placeHover.current();
        }}
        onContextMenu={(event) => {
          const playing = playingTrack(director);
          if (!playing) return;
          event.preventDefault();
          const share = shareAt(event.currentTarget, event.clientX);
          menu.open(loopMenu(director, SoundRecordStore.forApp(app), playing.record, share * playing.frames, playing.frames), { x: event.clientX, y: event.clientY }, { returnFocus: event.currentTarget, label: t('audio.loopMenu') });
        }}
      >
        <canvas className="atlas-sound-music__unplayed" ref={unplayedRef} />
        <canvas className="atlas-sound-music__played" ref={playedRef} />
        {/* The loop points the GM set, as a band over the wave. */}
        <div className="atlas-sound-music__loop" ref={loopRef} hidden aria-hidden="true">
          {(['in', 'out'] as const).map((edge) => (
            <div
              key={edge}
              className={`atlas-sound-music__loop-edge atlas-sound-music__loop-edge--${edge}`}
              aria-label={t(edge === 'in' ? 'audio.loopIn' : 'audio.loopOut')}
              // Its own press: the wave under it seeks, this moves the loop's edge, and is saved when let go.
              onPointerDown={(event) => {
                const playing = playingTrack(director);
                const loop = playing?.record.loop;
                if (event.button !== 0 || !playing || !loop) return;
                event.stopPropagation();
                event.currentTarget.setPointerCapture(event.pointerId);
                dragged.current = { ...playing, loop, edge, until: 0 };
              }}
              onPointerMove={(event) => {
                const drag = dragged.current;
                const wave = waveRef.current;
                if (!drag?.edge || !wave) return;
                event.stopPropagation();
                const frame = shareAt(wave, event.clientX) * drag.frames;
                // Held short of the other edge, so the loop never jumps to the track's end or start.
                const next = drag.edge === 'in'
                  ? withLoopIn(drag.loop, Math.min(frame, drag.loop.endFrame - MIN_LOOP_FRAMES), drag.frames)
                  : withLoopOut(drag.loop, Math.max(frame, drag.loop.startFrame + MIN_LOOP_FRAMES), drag.frames);
                if (next) drag.loop = next;
                writeNow.current();
              }}
              onPointerUp={(event) => {
                const drag = dragged.current;
                if (!drag?.edge) return;
                event.stopPropagation();
                drag.edge = null;
                drag.until = Date.now() + DRAGGED_HOLD_MS;
                saveLoop(SoundRecordStore.forApp(app), drag.record, drag.loop);
              }}
              onPointerCancel={() => {
                dragged.current = null;
                writeNow.current();
              }}
            />
          ))}
        </div>
        {/* Where the pointer is on the track, and the time it stands at. */}
        <div className="atlas-sound-music__hover" ref={hoverRef} aria-hidden="true">
          <span className="atlas-sound-music__hover-time" ref={hoverTimeRef} />
        </div>
      </div>
      <div className="atlas-sound-music__clock">
        <span className="atlas-sound-music__time" ref={timeRef} />
        <span className="atlas-sound-music__total" ref={totalRef} />
      </div>
    </>
  );
}
