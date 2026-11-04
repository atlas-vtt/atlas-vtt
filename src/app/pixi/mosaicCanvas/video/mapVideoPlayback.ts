/**
 * When an animated map plays. `play`: frames come; `pause`: the frame shown stays; `poster`: the
 * video is hidden and the still map beneath it shows (the GM switched animation off).
 */
export type MapVideoMode = 'play' | 'pause' | 'poster';

export interface MapVideoConditions {
  /** Animate maps, on this device (`animateMapsOn`). */
  animate: boolean;
  /** The view is loading a scene or holds none. */
  loading: boolean;
  /** The view's graphics context is lost: nothing is drawn. */
  contextLost: boolean;
  /** The view's canvas is on screen: its pane is shown and its window is not hidden. */
  viewShown: boolean;
  /** The player window is open on the scene this view shows, which is rendered from this view. */
  shownToPlayers: boolean;
}

/** Plays only where someone sees it: the GM's view, or the player window that shows its scene. */
export function mapVideoMode(conditions: MapVideoConditions): MapVideoMode {
  if (!conditions.animate) return 'poster';
  if (conditions.loading || conditions.contextLost) return 'pause';
  return conditions.viewShown || conditions.shownToPlayers ? 'play' : 'pause';
}

/** The device's choice, or on unless the system asks for reduced motion. */
export function animateMapsOn(stored: boolean | null, reducedMotion: boolean): boolean {
  return stored ?? !reducedMotion;
}
