import { animateMini } from 'framer-motion';
import { getDomHost } from '../host/dom';
import { EASE_CONTROL_POINTS, MOTION_NORMAL_MS, prefersReducedMotion } from '../utils/motion';

/** Set on the player window's body while the curtain is down (`player-window.scss`). */
export const PLAYER_CURTAIN_CLASS = 'atlas-player-window--curtain';
/** The black sheet over everything in the player window, the image and loot handouts included. */
const CURTAIN_CLASS = 'atlas-player-curtain';
/** How long the sheet takes to go down. A whole screen at a table changes, so slower than a panel. */
export const CURTAIN_DOWN_MS = 400;
/** How long it takes to lift: what players see comes back a little slower than it left. */
const CURTAIN_UP_MS = 500;

/**
 * Lowers the curtain over the player window's document `doc`, or lifts it, fading from wherever
 * the sheet is now, so changing course halfway never jumps. The sheet is added on first use, at
 * once, and stays. Motion's `animateMini` is the browser's own animation of the sheet's window:
 * its full `animate` runs on the main window's clock, which stops while the player window covers
 * the main window. The mirror blacks the canvas as well (`PlayerFrameMirror`), so a stylesheet
 * that failed to load cannot show the map.
 */
export function showPlayerCurtain(doc: Document, down: boolean): void {
  const { body } = doc;
  const sheet = body.querySelector<HTMLElement>(`:scope > .${CURTAIN_CLASS}`);
  if (sheet) {
    const fadeMs = prefersReducedMotion(sheet) ? MOTION_NORMAL_MS : down ? CURTAIN_DOWN_MS : CURTAIN_UP_MS;
    // Read before the class changes. In a list, since Motion takes an element of another window for no element at all
    const from = Number(getDomHost().ownerWindow(sheet).getComputedStyle(sheet).opacity);
    animateMini([sheet], { opacity: [from, down ? 1 : 0] }, { duration: fadeMs / 1000, ease: [...EASE_CONTROL_POINTS] });
  } else {
    body.createDiv({ cls: CURTAIN_CLASS });
  }
  body.toggleClass(PLAYER_CURTAIN_CLASS, down);
}

/** Takes the curtain out of `doc`, when the player window lets go of it. */
export function removePlayerCurtain(doc: Document): void {
  doc.body.removeClass(PLAYER_CURTAIN_CLASS);
  doc.body.querySelector(`:scope > .${CURTAIN_CLASS}`)?.remove();
}
