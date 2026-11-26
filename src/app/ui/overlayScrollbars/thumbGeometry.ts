/** Shortest thumb, so a long list still leaves something to grab. */
export const MIN_THUMB_PX = 24;

export interface ThumbGeometry {
  /** Length of the thumb along its track. */
  size: number;
  /** How far the thumb moves from one end of the scroll to the other. */
  travel: number;
}

/**
 * The thumb of one axis in a track `trackSize` long, for content `scrollSize` long of which `clientSize` is in view;
 * null when nothing scrolls. Where the thumb lies is the browser's work (a scroll-driven animation over `travel`).
 */
export function thumbGeometry(scrollSize: number, clientSize: number, trackSize: number): ThumbGeometry | null {
  if (scrollSize - clientSize < 1 || trackSize <= 0) return null;
  const size = Math.min(trackSize, Math.max(MIN_THUMB_PX, (trackSize * clientSize) / scrollSize));
  return { size, travel: trackSize - size };
}
