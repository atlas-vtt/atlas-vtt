import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';

export interface PointerTrackHandlers {
  onMove: (event: FederatedPointerEvent) => void;
  /** The pointer was released, on the canvas or off it. */
  onUp: () => void;
  /** The pointer was lost: cancelled, or the window lost focus. */
  onAbort: () => void;
}

/**
 * Follows the pointer on `viewport` from a press until the returned function is called: its moves
 * and its release there, and on `canvas` and its window what takes the pointer away without a
 * release. The window is the canvas's own, so a map in a popout is followed there.
 */
export function trackPointer(viewport: Viewport, canvas: HTMLElement, { onMove, onUp, onAbort }: PointerTrackHandlers): () => void {
  const win = canvas.ownerDocument.defaultView;
  viewport.on('pointermove', onMove);
  viewport.on('pointerup', onUp);
  viewport.on('pointerupoutside', onUp);
  canvas.addEventListener('pointercancel', onAbort);
  win?.addEventListener('blur', onAbort);
  return () => {
    viewport.off('pointermove', onMove);
    viewport.off('pointerup', onUp);
    viewport.off('pointerupoutside', onUp);
    canvas.removeEventListener('pointercancel', onAbort);
    win?.removeEventListener('blur', onAbort);
  };
}
