import { useEffect, type RefObject } from 'react';
import type { SoundDirector } from '../../../../soundDirector/SoundDirector';
import { prefersReducedMotion } from '../../../../utils/motion';
import type { MeterBoard } from './meterBoard';

/** Analysers need a moment of sound before there is anything to read. */
const FIRST_READING_MS = 300;
const MAX_FRAME_SECONDS = 0.1;

/**
 * One frame loop for all meters, while the page shows and something plays; analysers exist only for
 * that long. With reduced motion the meters take one reading and stand still.
 */
export function useMeterLoop(board: MeterBoard, director: SoundDirector, rootRef: RefObject<HTMLElement | null>, running: boolean): void {
  useEffect(() => {
    const root = rootRef.current;
    if (!running || !root) return undefined;
    const win = root.ownerDocument.defaultView ?? window;
    const read = (into: Map<string, number>): void => director.readMeters(into);
    const close = director.openMeters();
    let frame = 0;
    let timer = 0;
    if (prefersReducedMotion(root)) {
      const once = (): void => {
        win.clearTimeout(timer);
        timer = win.setTimeout(() => board.draw(read, 0), FIRST_READING_MS);
      };
      board.onChange(once);
      once();
    } else {
      let last = win.performance.now();
      const tick = (now: number): void => {
        board.draw(read, Math.min(MAX_FRAME_SECONDS, (now - last) / 1000));
        last = now;
        frame = win.requestAnimationFrame(tick);
      };
      frame = win.requestAnimationFrame(tick);
    }
    return () => {
      win.cancelAnimationFrame(frame);
      win.clearTimeout(timer);
      board.onChange(null);
      close();
      board.draw((into) => into.clear(), MAX_FRAME_SECONDS * 100);
    };
  }, [board, director, rootRef, running]);
}
