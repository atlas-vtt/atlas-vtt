import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { SLIDE_MS } from './welcomeSlides';

interface SlideTimer {
  index: number;
  /** Shows that slide and gives it its whole time; the slide that shows already keeps its time. */
  go: (index: number) => void;
}

/**
 * Which of `count` slides shows: the next one every `SLIDE_MS`, after the last the first. While `paused` the time
 * stands, and the slide goes on with what it had left, as its story bar does.
 */
export function useSlideTimer(count: number, paused: boolean): SlideTimer {
  const [index, setIndex] = useState(0);
  const left = useRef(SLIDE_MS);
  // Set when a slide starts, so the timer of the slide before does not count its time against the new one.
  const started = useRef(false);

  const go = useCallback((next: number): void => {
    const wrapped = ((next % count) + count) % count;
    setIndex((current) => {
      if (current === wrapped) return current;
      left.current = SLIDE_MS;
      started.current = true;
      return wrapped;
    });
  }, [count]);

  useEffect(() => {
    if (paused || count < 2) return;
    started.current = false;
    const from = Date.now();
    const timer = window.setTimeout(() => go(index + 1), left.current);
    return () => {
      window.clearTimeout(timer);
      if (!started.current) left.current = Math.max(0, left.current - (Date.now() - from));
    };
  }, [paused, count, index, go]);

  return { index, go };
}

/** Whether the document `element` lies in (a popout's own) is hidden: its window minimised or behind another tab. */
export function useDocumentHidden(element: RefObject<HTMLElement | null>): boolean {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const doc = element.current?.ownerDocument ?? document;
    const follow = (): void => setHidden(doc.hidden);
    follow();
    doc.addEventListener('visibilitychange', follow);
    return () => doc.removeEventListener('visibilitychange', follow);
  }, [element]);
  return hidden;
}
