import { getDomHost } from '../../../host/dom';
import { swallowNextClick } from '../../../utils/swallowClick';

/** How far the pointer moves, in screen px, before a press on the chip is a drag and no click. */
export const GLASS_DRAG_THRESHOLD = 4;

/** What a drag of the glass's chip does, in client pixels. */
export interface GlassDragSteps {
  /** The pointer passed the threshold; false leaves it a press that drags nothing. */
  start(clientX: number, clientY: number): boolean;
  /** `free` while Alt is held: no snapping. */
  move(clientX: number, clientY: number, free: boolean): void;
  end(): void;
  /** Escape, a cancelled pointer or the window losing focus: everything goes back. */
  cancel(): void;
}

/**
 * Follows the press `down` on `element`: below the threshold it stays a press, so a button in the
 * chip still gets its click; past it the pointer is captured and `steps` are told of every move,
 * and the click that ends the drag goes nowhere. Listens on the element's own window, so a map
 * in a popout drags too. Returns what stops following at once (the chip unmounting).
 */
export function trackGlassDrag(element: HTMLElement, down: PointerEvent, steps: GlassDragSteps): () => void {
  const win = getDomHost().ownerWindow(element);
  let dragging = false;
  let done = false;

  const stop = (): void => {
    if (done) return;
    done = true;
    win.removeEventListener('pointermove', onMove, true);
    win.removeEventListener('pointerup', onUp, true);
    win.removeEventListener('pointercancel', onCancel, true);
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('blur', onCancel);
    if (element.hasPointerCapture?.(down.pointerId)) element.releasePointerCapture(down.pointerId);
  };
  const onMove = (event: PointerEvent): void => {
    if (event.pointerId !== down.pointerId) return;
    if (!dragging) {
      if (Math.hypot(event.clientX - down.clientX, event.clientY - down.clientY) < GLASS_DRAG_THRESHOLD) return;
      if (!steps.start(down.clientX, down.clientY)) {
        stop();
        return;
      }
      dragging = true;
      element.setPointerCapture?.(down.pointerId);
    }
    steps.move(event.clientX, event.clientY, event.altKey);
  };
  const onUp = (event: PointerEvent): void => {
    if (event.pointerId !== down.pointerId) return;
    stop();
    if (!dragging) return;
    swallowNextClick(win);
    steps.end();
  };
  const onCancel = (): void => {
    stop();
    if (dragging) steps.cancel();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !dragging) return;
    // The map's own Escape (deselect, leave a tool) must not run as well
    event.preventDefault();
    event.stopPropagation();
    onCancel();
  };

  win.addEventListener('pointermove', onMove, true);
  win.addEventListener('pointerup', onUp, true);
  win.addEventListener('pointercancel', onCancel, true);
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('blur', onCancel);
  return (): void => {
    const wasDragging = dragging && !done;
    stop();
    if (wasDragging) steps.cancel();
  };
}
