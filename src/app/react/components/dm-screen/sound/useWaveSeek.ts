import { useMemo, useRef, type HTMLAttributes, type RefObject } from 'react';
import { SOUND_RATE } from '../../../../sound/engine/soundMath';
import { musicPosition, soundingMusic, type MusicPosition } from '../../../../soundDirector/musicList';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';

const KEY_STEP_FRAMES = 5 * SOUND_RATE;

interface WaveSeek {
  /** Where the pointer holds the track, as a share of it; null while none does. */
  held: RefObject<number | null>;
  handlers: Pick<HTMLAttributes<HTMLElement>, 'onPointerDown' | 'onPointerMove' | 'onPointerUp' | 'onPointerCancel' | 'onKeyDown'>;
}

function positionNow(director: SoundDirector): MusicPosition | null {
  const now = director.now();
  const play = soundingMusic(director.snapshot().mix.table, now);
  return play && musicPosition(play, now);
}

function shareAt(element: HTMLElement, clientX: number): number {
  const { left, width } = element.getBoundingClientRect();
  return width === 0 ? 0 : Math.max(0, Math.min(1, (clientX - left) / width));
}

/** A press or drag along a track's waveform: what shows follows the pointer, and the sound moves when it lets go. */
export function useWaveSeek(director: SoundDirector, onShown: () => void): WaveSeek {
  const held = useRef<number | null>(null);
  const shown = useRef(onShown);
  shown.current = onShown;

  const handlers = useMemo<WaveSeek['handlers']>(() => {
    const hold = (share: number | null): void => {
      held.current = share;
      shown.current();
    };
    return {
      onPointerDown: (event) => {
        if (event.button !== 0 || !positionNow(director)) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        hold(shareAt(event.currentTarget, event.clientX));
      },
      onPointerMove: (event) => {
        if (held.current !== null) hold(shareAt(event.currentTarget, event.clientX));
      },
      onPointerUp: () => {
        const share = held.current;
        const position = positionNow(director);
        if (share !== null && position) director.desk.seekMusic(share * position.frames);
        hold(null);
      },
      onPointerCancel: () => hold(null),
      onKeyDown: (event) => {
        const position = positionNow(director);
        if (!position) return;
        const frame = event.key === 'ArrowLeft' ? position.frame - KEY_STEP_FRAMES : event.key === 'ArrowRight' ? position.frame + KEY_STEP_FRAMES : event.key === 'Home' ? 0 : null;
        if (frame === null) return;
        event.preventDefault();
        director.desk.seekMusic(frame);
        shown.current();
      },
    };
  }, [director]);

  return { held, handlers };
}
