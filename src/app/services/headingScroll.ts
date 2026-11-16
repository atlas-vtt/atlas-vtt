/** Frames the heading must hold still before the scroll counts as settled. */
const SETTLED_FRAMES = 3;
/** About a second: long enough for the view to draw the heading's line. */
const MAX_FRAMES = 60;
/** Input by which the reader takes over the scroll. */
const READER_INPUT = ['wheel', 'pointerdown', 'keydown', 'touchstart'] as const;

export interface HeadingScrollTarget {
  /** The note view's element, where the reader's input ends the hold. */
  container: HTMLElement;
  /** The drawn heading, or null while the view has not drawn it. */
  findHeading: () => HTMLElement | null;
  /** Scrolls roughly to the heading's line, so the view draws it. */
  scrollToLine: () => void;
  /** Has the view go to the heading's line once it has drawn the note, for a note too long to draw in the time held. */
  scrollOnceDrawn?: () => void;
}

/**
 * Scrolls `scroller` so the text of `heading` starts where its content does,
 * as a note's first line would. Returns how far it moved.
 */
export function alignHeading(heading: HTMLElement, scroller: HTMLElement): number {
  const contentTop = scroller.getBoundingClientRect().top + paddingTop(scroller);
  const textTop = heading.getBoundingClientRect().top + paddingTop(heading);
  const before = scroller.scrollTop;
  scroller.scrollTop = before + textTop - contentTop;
  return scroller.scrollTop - before;
}

/**
 * Scrolls a note view to its heading and keeps it there while the view
 * settles. The editor and reading view estimate the height of lines they have
 * not drawn and correct it as they draw them, so a single scroll drifts off
 * the heading; this aligns the drawn heading every frame until it holds
 * still. `onSettled` gets the heading, or null when it was never drawn, which
 * leaves it to `scrollOnceDrawn`. The reader's own scrolling ends it early.
 * Returns a function that cancels.
 */
export function holdHeadingInView(target: HeadingScrollTarget, onSettled: (heading: HTMLElement | null) => void): () => void {
  const { container, findHeading, scrollToLine, scrollOnceDrawn } = target;
  let frame = 0;
  let stillFrames = 0;
  let request = 0;
  let finished = false;

  const finish = (): void => {
    finished = true;
    window.cancelAnimationFrame(request);
    READER_INPUT.forEach((type) => container.removeEventListener(type, settle, true));
  };

  function settle(): void {
    if (finished) return;
    finish();
    onSettled(findHeading());
  }

  const step = (): void => {
    frame++;
    const element = findHeading();
    if (!element) {
      scrollToLine();
      stillFrames = 0;
      if (frame >= MAX_FRAMES) scrollOnceDrawn?.();
    } else if (Math.abs(alignHeading(element, scrollerOf(element, container))) < 1) {
      stillFrames++;
    } else {
      stillFrames = 0;
    }
    if (stillFrames >= SETTLED_FRAMES || frame >= MAX_FRAMES) settle();
    else request = window.requestAnimationFrame(step);
  };

  READER_INPUT.forEach((type) => container.addEventListener(type, settle, { capture: true, passive: true }));
  scrollToLine();
  request = window.requestAnimationFrame(step);
  return () => {
    if (!finished) finish();
  };
}

/** The element that scrolls the heading: the editor's scroller or the reading view. */
function scrollerOf(heading: HTMLElement, container: HTMLElement): HTMLElement {
  return heading.closest<HTMLElement>('.cm-scroller, .markdown-preview-view') ?? container;
}

function paddingTop(element: HTMLElement): number {
  return parseFloat(getComputedStyle(element).paddingTop) || 0;
}
