import { useEffect, useRef, useState } from 'react';

/**
 * How long a load may take before its skeleton shows. A load that ends sooner
 * swaps straight to the content: a skeleton seen for a few frames is a flicker.
 */
export const SKELETON_DELAY_MS = 120;
/** How long a skeleton stays once it shows, so it never blinks in and out. */
export const SKELETON_MIN_VISIBLE_MS = 320;

export interface LoadingRevealOptions {
  delayMs?: number;
  minVisibleMs?: number;
  /**
   * A load that runs at mount waits its delay too. For a piece that mounts late inside content already shown (a
   * row scrolled into a list), whose load mostly ends within a frame: shown at once it would flicker.
   */
  waitAtMount?: boolean;
}

/**
 * Whether the skeleton of a load is on screen. It shows once the load has
 * lasted `delayMs` and then stays for at least `minVisibleMs`, also when the
 * load ends before that. While this is false and the load runs, show what was
 * there before; show the content once both are false.
 *
 * A load that already runs when the component mounts has nothing before it to
 * keep: its skeleton shows from the first frame and leaves when the load ends.
 */
export function useLoadingReveal(
  loading: boolean,
  { delayMs = SKELETON_DELAY_MS, minVisibleMs = SKELETON_MIN_VISIBLE_MS, waitAtMount = false }: LoadingRevealOptions = {},
): boolean {
  const [shown, setShown] = useState(loading && !waitAtMount);
  // Unset for the skeleton of a load that ran at mount: it has no minimum time.
  const shownAt = useRef(Number.NEGATIVE_INFINITY);

  useEffect(() => {
    if (loading === shown) return undefined;
    const wait = loading ? delayMs : Math.max(0, minVisibleMs - (performance.now() - shownAt.current));
    const timer = window.setTimeout(() => {
      if (loading) shownAt.current = performance.now();
      setShown(loading);
    }, wait);
    return (): void => window.clearTimeout(timer);
  }, [loading, shown, delayMs, minVisibleMs]);

  return shown;
}
