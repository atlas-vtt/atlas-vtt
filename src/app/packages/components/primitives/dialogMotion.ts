import { useSyncExternalStore } from 'react';
import type { Variants } from 'framer-motion';
import {
  BACKDROP_ENTER_MS,
  EASE_OUT_CONTROL_POINTS as EASE_OUT,
  PANEL_ENTER_FROM,
  PANEL_ENTER_MS,
  PANEL_EXIT_MS,
  PANEL_EXIT_TO,
  POPOVER_ENTER_FROM,
  POPOVER_EXIT_TO,
} from '../../../utils/motion';

/** Closing mirrors opening, a little quicker and over a shorter distance, so it reads as the same motion in reverse. */
export const DIALOG_EXIT_DURATION = PANEL_EXIT_MS / 1000;

/** The dimmed, blurred backdrop behind a dialog. */
export const dialogBackdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: BACKDROP_ENTER_MS / 1000, ease: EASE_OUT } },
  exit: { opacity: 0, transition: { duration: DIALOG_EXIT_DURATION, ease: EASE_OUT } },
} satisfies Variants;

/** The dialog window rises and grows into place. Full transform strings keep the animation on the compositor thread. */
export const dialogWindowVariants = {
  hidden: { opacity: 0, transform: PANEL_ENTER_FROM },
  visible: { opacity: 1, transform: 'translateY(0px) scale(1)', transition: { duration: PANEL_ENTER_MS / 1000, ease: EASE_OUT } },
  exit: { opacity: 0, transform: PANEL_EXIT_TO, transition: { duration: DIALOG_EXIT_DURATION, ease: EASE_OUT } },
} satisfies Variants;

/** Reduced motion keeps the window in place and only fades it. */
const fadingWindowVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: dialogWindowVariants.visible.transition },
  exit: { opacity: 0, transition: dialogWindowVariants.exit.transition },
} satisfies Variants;

/**
 * Spread onto a dialog's overlay, the element that dims the interface and holds the
 * window. The window inherits the overlay's labels through `useDialogWindowVariants`.
 * Clicks pass through a leaving overlay, as they would once it is gone.
 */
export const dialogOverlayMotion = {
  variants: {
    ...dialogBackdropVariants,
    exit: { ...dialogBackdropVariants.exit, pointerEvents: 'none' },
  } satisfies Variants,
  initial: 'hidden',
  animate: 'visible',
  exit: 'exit',
} as const;

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

function followReducedMotion(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

const reducedMotionNow = (): boolean => window.matchMedia(REDUCED_MOTION).matches;

/**
 * Whether reduced motion is asked for, following the setting while the component stays mounted. framer-motion's own
 * `useReducedMotion` reads it once, when the component mounts: a window kept mounted (the asset manager's, which only
 * opens and closes) went on rising and growing after the setting was switched on.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(followReducedMotion, reducedMotionNow);
}

/** Variants for a dialog window, honouring the reduced-motion preference. */
export function useDialogWindowVariants(): Variants {
  return usePrefersReducedMotion() ? fadingWindowVariants : dialogWindowVariants;
}

/** A popover anchored on the map grows out of its anchor, the element's `transform-origin`. */
const anchoredPopoverVariants = {
  hidden: { opacity: 0, transform: POPOVER_ENTER_FROM },
  visible: { opacity: 1, transform: 'scale(1)', transition: dialogWindowVariants.visible.transition },
  exit: { opacity: 0, transform: POPOVER_EXIT_TO, transition: dialogWindowVariants.exit.transition },
} satisfies Variants;

/** Variants for a popover that grows out of its anchor, honouring the reduced-motion preference. */
export function useAnchoredPopoverVariants(): Variants {
  return usePrefersReducedMotion() ? fadingWindowVariants : anchoredPopoverVariants;
}
