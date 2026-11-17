import { useCallback, useEffect, useState, type CSSProperties } from 'react';

/** Obsidian's minimise, maximise and close buttons of a frameless window on Windows and Linux. */
const WINDOW_CONTROLS = '.titlebar-button-container.mod-right';
/** The room left between the moved widgets and the buttons: the top row's own gap. */
const GAP = 8;

type Box = Pick<DOMRect, 'left' | 'right' | 'top' | 'bottom' | 'width' | 'height'>;

interface ClearOfWindowControls {
  /** Moves the bar out from under the buttons, if they lie over it. */
  clear: (bar: HTMLElement) => void;
  style: CSSProperties | undefined;
}

/**
 * How far the widgets must move left to stand clear of the window's buttons: 0 where the buttons
 * are not there (macOS, a framed window) or lie elsewhere (a tab bar above the map, another pane).
 * `resting` is where the widgets stand unmoved.
 */
export function windowControlsClearance(resting: Box, controls: Box | undefined): number {
  if (!controls || controls.width === 0 || controls.height === 0) return 0;
  const overlapsY = resting.top < controls.bottom && resting.bottom > controls.top;
  const overlapsX = resting.left < controls.right && resting.right > controls.left;
  return overlapsY && overlapsX ? resting.right - controls.left + GAP : 0;
}

/**
 * A window whose tab bar is hidden (Atlas Sidebar's clutter-free mode) lays its buttons over the
 * map's top right corner, where the widgets stand; they only show while hovered, so the cards keep
 * the corner at rest. While the pointer uses the widgets they move left, clear of the buttons, and
 * they move back once the bar falls asleep (`awake` false).
 */
export function useClearOfWindowControls(awake: boolean): ClearOfWindowControls {
  const [shift, setShift] = useState(0);

  useEffect(() => {
    if (!awake) setShift(0);
  }, [awake]);

  const clear = useCallback((bar: HTMLElement): void => {
    // The bar's parent is not moved, so it says where the bar rests even mid-move.
    const anchor = bar.parentElement ?? bar;
    const controls = bar.doc.querySelector(WINDOW_CONTROLS)?.getBoundingClientRect();
    setShift(windowControlsClearance(anchor.getBoundingClientRect(), controls));
  }, []);

  return { clear, style: shift > 0 ? { translate: `${-shift}px 0` } : undefined };
}
