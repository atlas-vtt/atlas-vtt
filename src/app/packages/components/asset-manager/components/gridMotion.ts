import type { TargetAndTransition, Transition, Variants } from 'framer-motion';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';

// Motion of the asset manager's content. Changing the assets of a pane (added,
// removed, renamed) moves the cards that stay and fades the others in and out
// where they sit; changing place (collection, folder, tab) or refinement
// (search, tags, sort) swaps the whole pane. Under reduced motion nothing moves:
// cards and panes only fade, and cards that stay jump to their new cell.

/** Cards that stay glide to their new cell; a spring keeps its velocity when typing retargets it. */
const MOVE: Transition = { type: 'spring', visualDuration: 0.3, bounce: 0 };
const FADE_IN: Transition = { duration: 0.2, ease: EASE_OUT_CONTROL_POINTS };
const FADE_OUT: Transition = { duration: 0.15, ease: EASE_OUT_CONTROL_POINTS };
const INSTANT: Transition = { duration: 0 };

const ENTER_SCALE = 0.96;
const STAGGER_SECONDS = 0.03;
const MAX_STAGGER_STEPS = 5;

/** Full transform strings, so Motion can run the animation on the compositor. */
export function cellTransform(x: number, y: number, scale = 1): string {
  return `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
}

export function hiddenCell(x: number, y: number, still = false): TargetAndTransition {
  return { opacity: 0, transform: cellTransform(x, y, still ? 1 : ENTER_SCALE) };
}

/** A card at rest in its cell. A card that came back while it was leaving takes the pointer again. */
export function shownCell(x: number, y: number): TargetAndTransition {
  return { opacity: 1, transform: cellTransform(x, y), pointerEvents: 'auto' };
}

/** Fades a card out where it stands, below the cards moving over it, and lets clicks pass through. */
function exitingCell(x: number, y: number, still: boolean): TargetAndTransition {
  return {
    opacity: 0,
    transform: cellTransform(x, y, still ? 1 : ENTER_SCALE),
    zIndex: 0,
    pointerEvents: 'none',
    transition: { default: FADE_OUT, zIndex: INSTANT },
  };
}

const SCROLLED_AWAY: TargetAndTransition = { opacity: 0, transition: INSTANT };

/**
 * How a card leaves the grid. `listChanged` is the presence's `custom`, read at
 * the moment the card leaves: a card the list lost fades out, a card that only
 * scrolled out of the mounted rows is gone at once. Fading those kept every card
 * scrolled past mounted, hundreds during a long scroll.
 */
export function cellVariants(x: number, y: number, still = false): Variants {
  return { exit: (listChanged: boolean) => (listChanged ? exitingCell(x, y, still) : SCROLLED_AWAY) };
}

/**
 * Entering cards cascade from the top-left of the viewport along the diagonals,
 * so a whole screen of results settles within about a quarter second.
 */
export function enterTransition(diagonal: number, still = false): Transition {
  if (still) return { default: INSTANT, opacity: FADE_IN };
  const delay = Math.min(Math.max(diagonal, 0), MAX_STAGGER_STEPS) * STAGGER_SECONDS;
  return { default: { ...MOVE, delay }, opacity: { ...FADE_IN, delay } };
}

/** Moves after the list changed glide; moves from resizing the window follow it at once, as every move does under reduced motion. */
export function moveTransition(listChanged: boolean, still = false): Transition {
  if (!listChanged) return INSTANT;
  return { default: still ? INSTANT : MOVE, opacity: FADE_IN };
}

const PANE_SHIFT_PX = 12;

/**
 * Folder and tab navigation, search and filters. `custom` is the direction: 1 into
 * a subfolder or to a tab further right (the new pane arrives from the right), -1
 * back out or to the left, 0 for a sideways jump or a refinement (crossfade only).
 */
export const paneVariants: Variants = {
  enter: (direction: number) => ({ opacity: 0, transform: `translateX(${direction * PANE_SHIFT_PX}px)` }),
  // At rest the pane drops its transform, which would otherwise contain fixed-position descendants.
  center: {
    opacity: 1,
    transform: 'translateX(0px)',
    transition: { duration: 0.22, ease: EASE_OUT_CONTROL_POINTS },
    transitionEnd: { transform: 'none' },
  },
  exit: (direction: number) => ({
    opacity: 0,
    transform: `translateX(${direction * -PANE_SHIFT_PX}px)`,
    pointerEvents: 'none',
    transition: FADE_OUT,
  }),
};

/** Panes under reduced motion: the same crossfade, without the shift. */
export const stillPaneVariants: Variants = {
  enter: { opacity: 0 },
  center: { opacity: 1, transition: { duration: 0.22, ease: EASE_OUT_CONTROL_POINTS } },
  exit: { opacity: 0, pointerEvents: 'none', transition: FADE_OUT },
};

/** Swapping between the results and the empty state. */
export const fadeVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: FADE_IN },
  exit: { opacity: 0, transition: FADE_OUT },
};
