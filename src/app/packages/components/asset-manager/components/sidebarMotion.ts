import type { Transition, Variants } from 'framer-motion';
import { EASE_OUT_CONTROL_POINTS } from '../../../../utils/motion';

// Motion of the floating sidebar. It slides in from the window's left edge on a
// spring with a touch of bounce and slides out on a critically damped, quicker
// one; springs keep their velocity, so reversing half way (the pointer comes
// back) stays smooth. Its contents trail the card slightly, which gives the
// card depth. Docked, nothing moves; under reduced motion it only fades.
//
// Every value is animated, none set at a motion's end (`transitionEnd`): a
// motion that is cut short still applies its end values once it stops, which
// left a sidebar shown again, or docked by a wider window, invisible. Hidden is
// the layout's state alone (`aria-hidden` and `inert` on the element), and the
// card slid out lies outside the window, which clips it.

const SHOW: Transition = { type: 'spring', visualDuration: 0.35, bounce: 0.12 };
const HIDE: Transition = { type: 'spring', visualDuration: 0.25, bounce: 0 };
const INSTANT: Transition = { duration: 0 };

/** Variant names, chosen by `sidebarMotionState`. */
export type SidebarMotionState = 'docked' | 'shown' | 'hidden';

export function sidebarMotionState(isFloating: boolean, isPeeking: boolean): SidebarMotionState {
  if (!isFloating) return 'docked';
  return isPeeking ? 'shown' : 'hidden';
}

/** Full transform strings, so Motion can run the animation on the compositor. */
export const sidebarVariants: Variants = {
  docked: { transform: 'translateX(0%)', transition: INSTANT },
  shown: { transform: 'translateX(0%)', transition: SHOW },
  // Past its own width plus the inset and shadow.
  hidden: { transform: 'translateX(-112%)', transition: HIDE },
};

export const sidebarContentVariants: Variants = {
  docked: { opacity: 1, transform: 'translateX(0px)', transition: INSTANT },
  shown: { opacity: 1, transform: 'translateX(0px)', transition: { ...SHOW, delay: 0.04 } },
  hidden: { opacity: 0, transform: 'translateX(-24px)', transition: { duration: 0.15, ease: EASE_OUT_CONTROL_POINTS } },
};

const FADE_S = 0.15;
const FADE: Transition = { duration: FADE_S, ease: EASE_OUT_CONTROL_POINTS };

/**
 * Reduced motion: the floating sidebar fades in and out where it stands. Faded out it moves out
 * of the window, by a motion of no length that waits for the fade, so showing it again stops that too.
 */
export const stillSidebarVariants: Variants = {
  docked: { opacity: 1, transform: 'translateX(0%)', transition: INSTANT },
  shown: { opacity: 1, transform: 'translateX(0%)', transition: { default: INSTANT, opacity: FADE } },
  hidden: { opacity: 0, transform: 'translateX(-112%)', transition: { default: { duration: 0, delay: FADE_S }, opacity: FADE } },
};

export const stillSidebarContentVariants: Variants = {
  docked: { opacity: 1, transition: INSTANT },
  shown: { opacity: 1, transition: FADE },
  hidden: { opacity: 0, transition: FADE },
};
