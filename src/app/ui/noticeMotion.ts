import { animate, type AnimationOptions } from 'framer-motion';
import type { Notice } from 'obsidian';
import { EASE_OUT_CONTROL_POINTS, prefersReducedMotion } from '../utils/motion';

/**
 * How Atlas' notices come and go, in the language of the dice rolls that hang from the same
 * corner (`DiceRollPanel`): they drop in from above as they grow out of the top-right corner,
 * settle with a touch of spring, and lift away the way they came while the notices below
 * close up. Reduced motion only fades them.
 */
const ENTER_FROM = 'translateY(-16px) scale(0.94)';
/** Spelled out: Motion reads `none` as a transform of zeros and shrinks the notice to nothing. */
const AT_REST = 'translateY(0px) scale(1)';
const ENTER: AnimationOptions = { type: 'spring', duration: 0.42, bounce: 0.16 };
const LEAVE_TO = 'translateY(-8px) scale(0.96)';
const LEAVE: AnimationOptions = { duration: 0.16, ease: [...EASE_OUT_CONTROL_POINTS] };
/** The notices below start to close the gap once the leaving one is mostly gone. */
const CLOSE_UP: AnimationOptions = { type: 'spring', duration: 0.32, bounce: 0, delay: 0.08 };
const FADE: AnimationOptions = { duration: 0.12 };
/**
 * Marks Obsidian's notice container from the first Atlas notice until it empties, so
 * `styles/_notices.scss` can place it and let the shadow out (a `:has()` there would stand on
 * an element not Atlas' own).
 */
const HOST_CLASS = 'atlas-notice-host';

/**
 * Gives `notice` Atlas' entrance now and its exit whenever it is hidden: by its timer, a click,
 * its close button or code. Obsidian's own slide is switched off in `styles/_notices.scss`.
 */
export function animateNotice(notice: Notice): void {
  const el = notice.containerEl;
  el.parentElement?.addClass(HOST_CLASS);
  const reduce = prefersReducedMotion(el);
  // Motion starts on the next frame; until then the notice would show at rest.
  el.setCssStyles({ opacity: '0', transform: reduce ? AT_REST : ENTER_FROM });
  void animate(el, { opacity: [0, 1], transform: reduce ? AT_REST : [ENTER_FROM, AT_REST] }, reduce ? FADE : ENTER);

  let leaving = false;
  // Obsidian calls `hide` on the instance from its timer and its click handler, so this
  // replaces its exit (a 120 ms fade) everywhere.
  notice.hide = (): void => {
    if (leaving) return;
    leaving = true;
    el.addClass('atlas-notice--leaving');
    const fade = animate(el, { opacity: 0, transform: reduce ? AT_REST : LEAVE_TO }, reduce ? FADE : LEAVE);
    if (reduce) {
      void fade.then(() => remove(el));
      return;
    }
    const closed = -(el.offsetHeight + (parseFloat(getComputedStyle(el).marginBottom) || 0));
    void animate(el, { marginTop: `${closed}px` }, CLOSE_UP).then(() => remove(el));
  };
}

/** What Obsidian's own `hide` ends with: the notice goes, and its container once it is empty. */
function remove(el: HTMLElement): void {
  const container = el.parentElement;
  el.detach();
  if (!container) return;
  if (container.childElementCount === 0) {
    container.removeClass(HOST_CLASS);
    container.detach();
    return;
  }
  // The notices still there keep Atlas' place, so they never jump; the class goes once they have
  // gone too, however they go (Obsidian detaches the emptied container itself).
  if (container.querySelector(':scope > .atlas-notice')) return;
  const watch = new MutationObserver(() => {
    if (container.querySelector(':scope > .atlas-notice')) return watch.disconnect();
    if (container.childElementCount > 0) return;
    container.removeClass(HOST_CLASS);
    watch.disconnect();
  });
  watch.observe(container, { childList: true });
}
