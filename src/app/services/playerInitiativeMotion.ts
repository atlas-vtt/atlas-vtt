/**
 * How the players' initiative lists move apart from what they share with the GM's tracker (`initiative/motion/`): which
 * way each leaves the window, how a leaving list stops replaying its turn's flash, and how a list glides to a new height
 * as its content changes. `PlayerInitiativePanel` draws them anew on every change and calls these.
 */

import type { PlayersListEdge } from '../initiative/initiativeLayout';
import type { Outward } from '../initiative/motion/listPresence';
import { prefersReducedMotion } from '../utils/motion';

/** Which way a list at each edge leaves the window. */
const OUTWARD: Readonly<Record<PlayersListEdge, Outward>> = { right: [1, 0], left: [-1, 0], top: [0, -1], bottom: [0, 1] };

/** The way out of the window from the edge `panel` stands at, in its parent's frame (a turned list's too). */
export function outwardOf(panel: HTMLElement): Outward {
  return OUTWARD[(panel.dataset.edge ?? 'right') as PlayersListEdge] ?? OUTWARD.right;
}

/**
 * A list that leaves stands as it was last seen: it is put back into every drawing until it is gone, and a CSS
 * animation starts over each time its element is, so the turn's flash would play again.
 */
export function settle(panel: HTMLElement): void {
  panel.querySelectorAll('.atlas-initiative-card--turn-flash').forEach((card) => card.removeClass('atlas-initiative-card--turn-flash'));
}

/** How long a list takes to grow or shrink to its new content, as a condition's badges make room or leave. */
const GLIDE_MS = 300;

/**
 * A list drawn anew at another height glides there from the height it had, so its surface and the theme's ivy
 * move instead of jumping. Its content stays where it rests meanwhile (`player-initiative.scss`); a row along the top
 * jumps, since its content rests at its top.
 */
export function glideHeight(panel: HTMLElement, from: number): void {
  const to = panel.offsetHeight;
  if (Math.abs(to - from) < 0.5 || panel.hasClass('atlas-player-initiative--top') || prefersReducedMotion(panel)) return;
  // The cards keep their own height meanwhile, past the gliding box: a list squeezed to it moved them and back
  panel.addClass('atlas-player-initiative--gliding');
  const glided = (): void => panel.removeClass('atlas-player-initiative--gliding');
  panel.animate([{ height: `${from}px` }, { height: `${to}px` }], { duration: GLIDE_MS, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }).finished.then(glided, glided);
}
