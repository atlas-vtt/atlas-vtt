/**
 * How both initiative lists come and go (the GM's tracker opened or closed by its hotkey or command, the players'
 * list as a fight starts and ends): the panel slides a short way in from the edge it stands at as it fades in and
 * settles to its size, and its cards fade in together a moment after it; it leaves the same way, quicker and as one. The slide is
 * the `translate` property, so it moves the panel in its parent's frame, whatever `transform` places or turns it.
 * The cards end on how they rest (a stack's hidden cards stay hidden). The widgets come and go by the same motion.
 */

import { MOTION_EASE_OUT, prefersReducedMotion } from '../../utils/motion';
import { TURN_KEY_ATTRIBUTE } from './turnMotion';

/** The way out of the window from a list's edge, as a unit vector in its parent's frame. */
export type Outward = readonly [number, number];

/** How far the panel slides: enough to read as coming from its edge, never across the map. */
const ENTER_DISTANCE_PX = 28;
const EXIT_DISTANCE_PX = 18;
/**
 * Coming in settles softly (`--ease-drawer`); leaving is the plain strong ease-out, shorter. The players' turn banner
 * moves with the lists by the same timing (`PlayerTurnBanner`).
 */
export const LIST_ENTER_MS = 420;
export const LIST_ENTER_EASING = 'cubic-bezier(0.32, 0.72, 0, 1)';
export const LIST_EXIT_MS = 240;
export const LIST_EXIT_EASING = MOTION_EASE_OUT;
/** The cards come in together, a beat after the panel: one motion with a little depth, never a card at a time. */
const CARD_DELAY_MS = 60;
const CARD_MS = 320;
/** Until the cards of a list coming in have settled. */
export const LIST_ARRIVAL_MS = Math.max(LIST_ENTER_MS, CARD_DELAY_MS + CARD_MS);

/** The panel comes in from `outward`, after `delay` milliseconds; with reduced motion it fades. Returns the panel's animation. */
export function enterList(panel: HTMLElement, outward: Outward, delay = 0): Animation | null {
  if (typeof panel.animate !== 'function') return null;
  const still = prefersReducedMotion(panel);
  const [x, y] = outward;
  const from: Keyframe = still
    ? { opacity: 0 }
    : { opacity: 0, translate: `${x * ENTER_DISTANCE_PX}px ${y * ENTER_DISTANCE_PX}px`, scale: '0.97' };
  const to: Keyframe = still ? { opacity: 1 } : { opacity: 1, translate: '0 0', scale: '1' };
  const animation = panel.animate([from, to], { duration: LIST_ENTER_MS, delay, easing: LIST_ENTER_EASING, fill: 'backwards' });
  if (still) return animation;
  // The cards follow the panel together: they fade in as they settle to their size
  for (const card of panel.querySelectorAll<HTMLElement>(`[${TURN_KEY_ATTRIBUTE}]`)) {
    card.animate(
      [{ opacity: 0, scale: '0.97', offset: 0 }],
      { duration: CARD_MS, delay: delay + CARD_DELAY_MS, easing: MOTION_EASE_OUT, fill: 'backwards' },
    );
  }
  return animation;
}

/** The panel leaves towards `outward`, after `delay` milliseconds; with reduced motion it fades. */
export function exitList(panel: HTMLElement, outward: Outward, delay = 0): Animation | null {
  if (typeof panel.animate !== 'function') return null;
  const still = prefersReducedMotion(panel);
  const [x, y] = outward;
  const from: Keyframe = still ? { opacity: 1 } : { opacity: 1, translate: '0 0', scale: '1' };
  const to: Keyframe = still
    ? { opacity: 0 }
    : { opacity: 0, translate: `${x * EXIT_DISTANCE_PX}px ${y * EXIT_DISTANCE_PX}px`, scale: '0.98' };
  return panel.animate([from, to], { duration: LIST_EXIT_MS, delay, easing: LIST_EXIT_EASING, fill: 'forwards' });
}

/** How long a list takes to change its look (the GM's compact view and back): its size glides, its cards fade in anew. */
const MORPH_MS = 380;

/**
 * `panel` changed its look and so its size: it glides from the size it had (`from`, its border box) to the one it has
 * now, settling softly, while its cards fade in together a beat later, so the change reads as one motion rather than a
 * jump. The size moves by `width` and `height` (a scale would stretch the border, corners and text); the panel's content
 * lays itself out inside meanwhile. With reduced motion only the cards fade.
 */
export function morphList(panel: HTMLElement, from: { width: number; height: number }): void {
  if (typeof panel.animate !== 'function') return;
  const to = { width: panel.offsetWidth, height: panel.offsetHeight };
  if (!prefersReducedMotion(panel) && (Math.abs(to.width - from.width) > 0.5 || Math.abs(to.height - from.height) > 0.5)) {
    panel.animate(
      [{ width: `${from.width}px`, height: `${from.height}px` }, { width: `${to.width}px`, height: `${to.height}px` }],
      { duration: MORPH_MS, easing: LIST_ENTER_EASING },
    );
  }
  for (const card of panel.querySelectorAll<HTMLElement>(`[${TURN_KEY_ATTRIBUTE}]`)) {
    card.animate(
      [{ opacity: 0, scale: '0.97', offset: 0 }],
      { duration: CARD_MS, delay: CARD_DELAY_MS, easing: MOTION_EASE_OUT, fill: 'backwards' },
    );
  }
}
