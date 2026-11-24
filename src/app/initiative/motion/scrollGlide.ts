import { cubicBezier, prefersReducedMotion } from '../../utils/motion';
import { MOVE_EASING_POINTS, TURN_MOVE_MS } from './turnMotion';

const moveEase = cubicBezier(...MOVE_EASING_POINTS);
/** The lists whose scroll is gliding now. */
const gliding = new WeakSet<HTMLElement>();

/** Whether `list`'s scroll is still on its way (`glideScroll`): a list drawn anew in its place carries the glide on. */
export function isGliding(list: HTMLElement): boolean {
  return gliding.has(list);
}

/**
 * Glides `list`'s scroll along `axis` from `from` to where it stands now, as the cards glide when the turn passes
 * (`TURN_MOVE_MS`, the same soft start and long settle): the players' list, drawn anew, would otherwise jump to its new
 * place. `settled` runs once it has arrived, for what waits for it (the conditions tip). A list drawn anew mid-glide is
 * glided on from where this one stood (`isGliding`); the old one stops once it leaves the document, and never settles.
 * Under reduced motion it stays where it is. Answers whether it glides: nothing settles where it does not.
 */
export function glideScroll(list: HTMLElement, from: number, axis: 'x' | 'y', settled: () => void = () => undefined): boolean {
  const scroll = axis === 'y' ? 'scrollTop' : 'scrollLeft';
  const to = list[scroll];
  const win = list.ownerDocument.defaultView;
  if (!win || Math.abs(to - from) < 1 || prefersReducedMotion(list)) return false;
  const begun = win.performance.now();
  gliding.add(list);
  const step = (now: number): void => {
    if (!list.isConnected) {
      gliding.delete(list);
      return;
    }
    const progress = Math.min(1, (now - begun) / TURN_MOVE_MS);
    list[scroll] = from + (to - from) * moveEase(progress);
    if (progress < 1) {
      win.requestAnimationFrame(step);
      return;
    }
    gliding.delete(list);
    settled();
  };
  step(begun);
  return true;
}
