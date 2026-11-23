import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import { SLIDE_MS } from './welcomeSlides';

/** A stretch of the showing slide's time: how much of it had passed when the stretch began, and its count. */
interface SlideRun {
  elapsed: number;
  run: number;
}

interface SlideTimer extends SlideRun {
  index: number;
  /** Shows that slide and gives it its whole time; the slide that shows already keeps its time. */
  go: (index: number) => void;
}

/**
 * Which of `count` slides shows: the next one every `SLIDE_MS`, after the last the first. While `paused` the time
 * stands, and the slide goes on with what it had left. Every slide start and every hold begins a new run, so whatever
 * shows the time (the story bar) can start again from `elapsed` and never runs on while the time stands, as a CSS
 * animation in a hidden window does.
 */
export function useSlideTimer(count: number, paused: boolean): SlideTimer {
  const [index, setIndex] = useState(0);
  const [{ elapsed, run }, setRun] = useState<SlideRun>({ elapsed: 0, run: 0 });
  const left = useRef(SLIDE_MS);
  // Set when a slide starts, so the timer of the slide before does not count its time against the new one.
  const started = useRef(false);

  const go = useCallback((next: number): void => {
    const wrapped = ((next % count) + count) % count;
    if (wrapped === index) return;
    left.current = SLIDE_MS;
    started.current = true;
    setIndex(wrapped);
    setRun((current) => ({ elapsed: 0, run: current.run + 1 }));
  }, [count, index]);

  useEffect(() => {
    if (paused || count < 2) return;
    started.current = false;
    const from = Date.now();
    const timer = window.setTimeout(() => go(index + 1), left.current);
    return () => {
      window.clearTimeout(timer);
      if (started.current) return;
      left.current = Math.max(0, left.current - (Date.now() - from));
      setRun((current) => ({ elapsed: SLIDE_MS - left.current, run: current.run + 1 }));
    };
  }, [paused, count, index, go]);

  return { index, go, elapsed, run };
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
