import { clamp } from '../utils/math';

/** Space kept between the card, its target and the window's edges. */
const GAP = 16;

interface Box { left: number; top: number; right: number; bottom: number }
interface Size { width: number; height: number }

/**
 * Where a tutorial card goes next to the element it explains: below it, above
 * it, then beside it on the right or left, so the card never hides its target.
 * A target too large for any of these gets the card over it, kept on screen.
 */
export function placeTutorialCard(target: Box, card: Size, view: Size): { left: number; top: number } {
  const alongX = clamp(target.left, GAP, view.width - card.width - GAP);
  const alongY = clamp(target.top, GAP, view.height - card.height - GAP);
  if (target.bottom + GAP + card.height <= view.height - GAP) return { left: alongX, top: target.bottom + GAP };
  if (target.top - GAP - card.height >= GAP) return { left: alongX, top: target.top - GAP - card.height };
  if (target.right + GAP + card.width <= view.width - GAP) return { left: target.right + GAP, top: alongY };
  if (target.left - GAP - card.width >= GAP) return { left: target.left - GAP - card.width, top: alongY };
  return { left: alongX, top: clamp(target.bottom + GAP, GAP, view.height - card.height - GAP) };
}
