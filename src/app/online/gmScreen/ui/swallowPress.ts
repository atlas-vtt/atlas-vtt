/** What a press sends after its `pointerdown`, up to the click, context menu or drag it ends in. */
const REST_OF_PRESS = ['pointermove', 'pointerup', 'pointercancel', 'mousedown', 'mouseup', 'click', 'auxclick', 'dblclick', 'contextmenu', 'touchstart', 'touchmove', 'touchend', 'dragstart', 'selectstart'] as const;

/** How long after a press ended its trailing events (the click; a context menu, where it opens on release) may still come. */
const TRAIL_MS = 300;

/**
 * Takes the press `down` begins in `view` from everyone else: its `pointerdown` and all it sends until it
 * ended and its trail came, or the next press begins. Listeners on the window's capture phase go first, so
 * neither the page's own handlers nor the canvas nor React's root hear any of it.
 */
export function swallowPress(view: Window, down: PointerEvent): void {
  const take = (event: Event): void => {
    if (event.cancelable) event.preventDefault();
    event.stopImmediatePropagation();
  };
  let timer: number | undefined;
  const onRest = (event: Event): void => {
    const pointer = (event as Partial<PointerEvent>).pointerId;
    if (pointer !== undefined && event.type.startsWith('pointer') && pointer !== down.pointerId) return;
    // A click the keyboard made (Enter on a button) carries no count of presses: it is no part of this press.
    if ((event.type === 'click' || event.type === 'auxclick') && (event as MouseEvent).detail === 0) return;
    take(event);
    if (event.type === 'pointerup' || event.type === 'pointercancel') timer ??= view.setTimeout(end, TRAIL_MS);
  };
  const end = (): void => {
    view.clearTimeout(timer);
    for (const type of REST_OF_PRESS) view.removeEventListener(type, onRest, true);
    view.removeEventListener('pointerdown', end, true);
  };
  take(down);
  for (const type of REST_OF_PRESS) view.addEventListener(type, onRest, true);
  view.addEventListener('pointerdown', end, true);
}
