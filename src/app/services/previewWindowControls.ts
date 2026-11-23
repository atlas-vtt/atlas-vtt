import { setIcon } from 'obsidian';
import { t } from '../i18n';
import type { ViewFrame } from '../packages/components/primitives/popoverFit';
import { dragThreshold } from '../pixi/utils/pointerReach';
import { shiftIntoFrame } from './previewWindowLayout';
import { swallowNextClick } from '../utils/swallowClick';
import { followPointer } from '../utils/pointerDrag';

/**
 * The pin button of a floating preview window (note and statblock previews):
 * a pinned window stays open when the Mod key is released or the pointer leaves its anchor.
 */
export function createPinButton(parent: HTMLElement, className: string, onToggle: () => void): HTMLButtonElement {
  const button = parent.createEl('button', { cls: className });
  button.type = 'button';
  button.onclick = onToggle;
  showPinState(button, false);
  return button;
}

/** Shows whether the window is pinned: the icon, its accessible name and the `is-pinned` class. */
export function showPinState(button: HTMLButtonElement, pinned: boolean): void {
  button.empty();
  setIcon(button, pinned ? 'pin-off' : 'pin');
  button.setAttribute('aria-label', pinned ? t('preview.unpin') : t('preview.pin'));
  button.classList.toggle('is-pinned', pinned);
}

/** Where a preview window must stay reachable: the part that moves and closes it, and the view it must stay in. */
export interface PreviewWindowReach {
  /** The controls and the grab area beside them, in window (client) coordinates; null while the window is hidden. */
  reach: () => ViewFrame | null;
  /** The map view the window hangs over, in the same coordinates. */
  frame: () => ViewFrame;
}

/** Moves the window just enough that its controls are in view again, after its view shrank. */
export function keepPreviewReachable(element: HTMLElement, reach: PreviewWindowReach): void {
  const part = reach.reach();
  if (!part) return;
  const { x, y } = shiftIntoFrame(part, reach.frame());
  if (x === 0 && y === 0) return;
  element.style.left = `${element.offsetLeft + x}px`;
  element.style.top = `${element.offsetTop + y}px`;
}

/**
 * Moves a floating preview window with the pointer (a mouse, a finger or a pen), from a press on
 * its handle until the pointer is let go or lost, then calls `onEnd`. The window never leaves
 * its controls outside its view (`reach`), so it can always be moved back and
 * closed. Presses on a button inside the handle are left to the button. With a
 * `threshold` (a handle that holds links, such as a statblock's name), the
 * window moves only once the pointer has gone that far, so a click stays a
 * click, and the click that ends a move is swallowed. Returns a function that
 * stops a drag still under way, for a window closed meanwhile; it does
 * nothing otherwise.
 */
export function startPreviewWindowDrag(
  element: HTMLElement,
  event: PointerEvent,
  reach: PreviewWindowReach,
  onEnd: () => void,
  threshold = 0,
): () => void {
  if ((event.target as HTMLElement | null)?.closest('button')) return () => {};
  const doc = element.ownerDocument;
  const startX = event.clientX;
  const startY = event.clientY;
  const startLeft = element.offsetLeft;
  const startTop = element.offsetTop;
  const startReach = reach.reach();
  const frame = reach.frame();
  // A handle that waits for a move before it drags waits a little longer for a finger, which wanders
  const moveThreshold = threshold > 0 ? dragThreshold(threshold, event) : 0;
  let dragging = false;
  let moved = false;

  const follow = followPointer(element, event, {
    move: (e) => {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < moveThreshold) return;
        begin();
        // A press on text began a selection, which the move must not extend.
        doc.getSelection()?.removeAllRanges();
      }
      moved = true;
      const fit = startReach
        ? shiftIntoFrame({ left: startReach.left + dx, right: startReach.right + dx, top: startReach.top + dy, bottom: startReach.bottom + dy }, frame)
        : { x: 0, y: 0 };
      element.style.left = `${startLeft + dx + fit.x}px`;
      element.style.top = `${startTop + dy + fit.y}px`;
    },
    end: (_e, lost) => {
      element.classList.remove('is-dragging');
      if (!dragging) return;
      if (threshold > 0 && moved && !lost) swallowNextClick(element.win);
      onEnd();
    },
  });
  // Captured only as a drag: a click on a link in the handle must reach the link.
  function begin(): void {
    dragging = true;
    element.classList.add('is-dragging');
    follow.capture();
  }
  if (threshold === 0) begin();

  return (): void => {
    element.classList.remove('is-dragging');
    follow.stop();
  };
}
