import { useEffect, useRef } from 'react';

/** How long a result stands, as a 3D panel (large or as a row) or as a card, before it leaves on its own. */
export const ROLL_LINGER_MS = 10000;

/**
 * Calls `onEnd` once `ms` have passed while not `paused`: a result's own timer (never an
 * animation callback). A pause keeps the time left and the timer goes on from there; a new `ms`
 * starts it afresh, and null stops it.
 */
export function useLingerTimer(ms: number | null, onEnd: () => void, paused: boolean): void {
  const end = useRef(onEnd);
  const left = useRef<number | null>(ms);
  useEffect(() => {
    end.current = onEnd;
  });
  // Runs after the timer's cleanup has kept the time left, so a new `ms` wins over it.
  useEffect(() => {
    left.current = ms;
  }, [ms]);
  useEffect(() => {
    const wait = left.current;
    if (ms === null || paused || wait === null) return;
    const started = performance.now();
    const timer = window.setTimeout(() => {
      left.current = null;
      end.current();
    }, wait);
    return (): void => {
      window.clearTimeout(timer);
      if (left.current !== null) left.current = Math.max(0, wait - (performance.now() - started));
    };
  }, [ms, paused]);
}
