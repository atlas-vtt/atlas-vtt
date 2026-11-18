import type { ViewportBox } from '../host/visibleViewport';

/** Room kept between a revealed input and the edge of what is seen (the keyboard's top edge). */
export const REVEAL_MARGIN = 12;

type Span = Pick<ViewportBox, 'top' | 'bottom'>;

/**
 * How far content must scroll up (positive) or down (negative) for `box` to stand inside `seen`
 * with `margin` to spare; 0 where it already does. A box taller than the room keeps its top in view.
 */
export function revealDistance(box: Span, seen: Span, margin = REVEAL_MARGIN): number {
  const top = seen.top + margin;
  const bottom = seen.bottom - margin;
  if (box.top < top) return box.top - top;
  if (box.bottom > bottom) return Math.min(box.bottom - bottom, box.top - top);
  return 0;
}

/** What is typed into: a text field, a text area, or editable text. Buttons, sliders and switches are not. */
const TEXT_INPUT = 'textarea, [contenteditable]:not([contenteditable="false"]), input:not([type="button"], [type="checkbox"], [type="radio"], [type="range"], [type="color"], [type="file"], [type="submit"], [type="reset"], [type="image"])';
/** Atlas' own surfaces. Obsidian's editor (also inside a note preview) brings its cursor into view by itself. */
const ATLAS_SURFACE = '[class*="atlas-"]';
const OBSIDIAN_EDITOR = '.cm-editor';

/** The field of Atlas being typed into in `doc`, if there is one. */
export function focusedAtlasInput(doc: Document): HTMLElement | null {
  const focused = doc.activeElement;
  if (!focused?.instanceOf(HTMLElement) || !focused.matches(TEXT_INPUT)) return null;
  return focused.closest(ATLAS_SURFACE) && !focused.closest(OBSIDIAN_EDITOR) ? focused : null;
}

const scrolls = (overflow: string): boolean => overflow === 'auto' || overflow === 'scroll';

/**
 * Scrolls the scrollers around `input`, innermost first, until it stands in what is seen: inside
 * `seen` and inside each scroller's own box, which clips it. `scrollIntoView` does not do this: it
 * brings an element into its scroller, and a scroller whose lower half lies under the keyboard
 * counts as showing all of itself.
 */
export function revealInput(input: HTMLElement, seen: Span, margin = REVEAL_MARGIN): void {
  const win = input.win;
  for (let scroller = input.parentElement; scroller; scroller = scroller.parentElement) {
    if (scroller.scrollHeight <= scroller.clientHeight || !scrolls(win.getComputedStyle(scroller).overflowY)) continue;
    const frame = scroller.getBoundingClientRect();
    const shown = { top: Math.max(seen.top, frame.top), bottom: Math.min(seen.bottom, frame.bottom) };
    const distance = revealDistance(input.getBoundingClientRect(), shown, margin);
    if (Math.abs(distance) >= 1) scroller.scrollTop += distance;
  }
}
