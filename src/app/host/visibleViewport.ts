/** A box in a window's client coordinates, the ones `getBoundingClientRect` answers in. */
export interface ViewportBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

let followsVisual = false;

/**
 * Lets `visibleViewport` answer with a window's visual viewport: what an on-screen keyboard and a
 * pinch leave of it. The application switches it on where there is such a keyboard. Off, the answer
 * is the window's own size, which is what a desktop window shows; its visual viewport can differ
 * from that by a fraction of a pixel under page zoom, so it is never asked there. Returns the
 * function that puts the previous choice back.
 */
export function followVisualViewport(on: boolean): () => void {
  const previous = followsVisual;
  followsVisual = on;
  return () => {
    followsVisual = previous;
  };
}

/**
 * The part of `win` the user sees. Everything that places a popover, a tooltip or a floating
 * window against "the window" asks here, in the window the element lives in (a popout has its own).
 */
export function visibleViewport(win: Window): ViewportBox {
  const visual = followsVisual ? win.visualViewport : null;
  if (!visual) return { left: 0, top: 0, right: win.innerWidth, bottom: win.innerHeight };
  return {
    left: visual.offsetLeft,
    top: visual.offsetTop,
    right: visual.offsetLeft + visual.width,
    bottom: visual.offsetTop + visual.height,
  };
}

/**
 * What the user sees of `box`, a part of `win` (a leaf): the box itself where the window shows all
 * of itself, and cut at the visual viewport's edges where a keyboard may cover its lower part.
 */
export function visiblePartOf(box: ViewportBox, win: Window): ViewportBox {
  if (!followsVisual || !win.visualViewport) return box;
  const viewport = visibleViewport(win);
  return {
    left: Math.max(box.left, viewport.left),
    top: Math.max(box.top, viewport.top),
    right: Math.min(box.right, viewport.right),
    bottom: Math.min(box.bottom, viewport.bottom),
  };
}
