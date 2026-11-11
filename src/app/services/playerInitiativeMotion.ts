/**
 * How the players' initiative lists move: in from their edges and out again with the fight, and to a new height
 * as their content changes. `PlayerInitiativePanel` draws them anew on every change and calls these.
 */

import type { PlayersListEdge } from '../initiative/initiativeLayout';
import { prefersReducedMotion } from '../utils/motion';

/** Which way a list at each edge leaves the window. */
const OUTWARD: Readonly<Record<PlayersListEdge, readonly [number, number]>> = { right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1] };

/** How much further than its depth a list slides: its gap to the edge and the theme's ivy past its corners. */
const SLIDE_MARGIN_PX = 64;

/**
 * Slides a players' list in from its edge or out to it, along the window's side it stands at; with reduced
 * motion it fades. The `translate` property moves it in its parent's frame, apart from the `transform` that places it.
 */
export function slideList(panel: HTMLElement, faces: boolean, out: boolean, timing: KeyframeAnimationOptions): Animation {
  const edge = (panel.dataset.edge ?? 'right') as PlayersListEdge;
  const across = edge === 'top' || edge === 'bottom';
  // A list turned to face a side lies across it: its height is how far it reaches into the room
  const depth = (across || faces ? panel.offsetHeight : panel.offsetWidth) + SLIDE_MARGIN_PX;
  const [x, y] = OUTWARD[edge];
  const still = prefersReducedMotion(panel);
  const away: Keyframe = still ? { opacity: 0 } : { translate: `${x * depth}px ${y * depth}px` };
  const home: Keyframe = still ? { opacity: 1 } : { translate: '0 0' };
  return panel.animate(out ? [home, away] : [away, home], timing);
}

/**
 * A list that leaves stands as it was last seen: it is put back into every drawing until it is gone, and a CSS
 * animation starts over each time its element is, so the turn's push and flash would play again. Who was pushed out is
 * gone, and the rest stays where the push left it.
 */
export function settle(panel: HTMLElement): void {
  panel.querySelectorAll('.atlas-player-initiative__leaving').forEach((pushedOut) => pushedOut.remove());
  panel.querySelectorAll('.atlas-player-initiative__push-in, .atlas-player-initiative__card--turn-flash').forEach((card) => {
    card.removeClass('atlas-player-initiative__push-in', 'atlas-player-initiative__card--turn-flash');
  });
}

/** How long a list takes to grow or shrink to its new content, as a condition's badges make room or leave. */
const GLIDE_MS = 300;

/**
 * A list drawn anew at another height glides there from the height it had, so its surface and the theme's ivy
 * move instead of jumping. Its content stays where it rests meanwhile (`justify-content` in `player-initiative.scss`),
 * which holds for every list but a row along the top, whose cards themselves move down for the badges: that one jumps.
 */
export function glideHeight(panel: HTMLElement, from: number): void {
  const to = panel.offsetHeight;
  if (Math.abs(to - from) < 0.5 || panel.hasClass('atlas-player-initiative--top') || prefersReducedMotion(panel)) return;
  // The cards keep their own height meanwhile, past the gliding box: a list squeezed to it moved them and back
  panel.addClass('atlas-player-initiative--gliding');
  const glided = (): void => panel.removeClass('atlas-player-initiative--gliding');
  panel.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: GLIDE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }).finished.then(glided, glided);
}
