import { WHEEL_LINE_PX } from '../react/hooks/useTabStripOverflow';

/** Less than this left to scroll is rounding: a scroll offset is fractional on a scaled screen, its maximum is not. */
const SCROLL_END_SLACK_PX = 0.5;

function inPixels(delta: number, event: WheelEvent, pageSize: number): number {
  if (event.deltaMode === event.DOM_DELTA_LINE) return delta * WHEEL_LINE_PX;
  if (event.deltaMode === event.DOM_DELTA_PAGE) return delta * pageSize;
  return delta;
}

function canMove(overflow: string, offset: number, maxOffset: number, delta: number): boolean {
  if (overflow !== 'auto' && overflow !== 'scroll') return false;
  if (delta < 0) return offset > 0;
  return delta > 0 && maxOffset - offset > SCROLL_END_SLACK_PX;
}

/** Scrolls the nearest box from the wheel's target up to the preview that can still move, as the browser's own scrolling picks. */
function scrollNearestBox(event: WheelEvent, preview: HTMLElement): void {
  const target = event.target as Node;
  if (!target.instanceOf(Element)) return;
  for (let box: Element | null = target; box; box = box.parentElement) {
    const across = inPixels(event.deltaX, event, box.clientWidth);
    const down = inPixels(event.deltaY, event, box.clientHeight);
    const { overflowX, overflowY } = box.win.getComputedStyle(box);
    const movesAcross = canMove(overflowX, box.scrollLeft, box.scrollWidth - box.clientWidth, across);
    const movesDown = canMove(overflowY, box.scrollTop, box.scrollHeight - box.clientHeight, down);
    if (movesAcross) box.scrollLeft += across;
    if (movesDown) box.scrollTop += down;
    if (movesAcross || movesDown || box === preview) return;
  }
}

/**
 * Makes Ctrl+wheel scroll a Mod+hover preview, the only way to scroll one that closes when Ctrl is
 * let go (Windows, Linux). Chromium scrolls nothing on a mouse's Ctrl+wheel there, and on every
 * system a note view inside answers it with Obsidian's font size action, so the event stops here,
 * in the capture phase, before either sees it. A wheel without Ctrl, Cmd on macOS among them, is
 * left to the browser's smoother scrolling. The listener goes with the element; a preview that
 * outlives it takes it off itself.
 */
export function scrollOnCtrlWheel(preview: HTMLElement): () => void {
  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    event.stopPropagation();
    scrollNearestBox(event, preview);
  };
  preview.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return (): void => preview.removeEventListener('wheel', onWheel, { capture: true });
}
