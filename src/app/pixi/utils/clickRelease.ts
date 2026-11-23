import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';

/**
 * Follows the press that began with `down` and calls `onClick` when it is released in place.
 * The press itself stays unhandled, so dragging still pans the map or draws a marquee. "In place"
 * is the viewport's own drag threshold: a press is a click exactly as long as it does not pan.
 * `onEnd` runs once when the press is over: released, dragged away, lost or stopped by the returned function.
 */
export function watchClick(
  viewport: Viewport,
  down: FederatedPointerEvent,
  onClick: (up: FederatedPointerEvent) => void,
  onEnd?: () => void,
): () => void {
  const start = { x: down.global.x, y: down.global.y };
  let watching = true;

  const isClick = (event: FederatedPointerEvent): boolean =>
    Math.abs(event.global.x - start.x) < viewport.threshold && Math.abs(event.global.y - start.y) < viewport.threshold;

  const stop = (): void => {
    if (!watching) return;
    watching = false;
    viewport.off('pointermove', onMove);
    viewport.off('pointerup', onRelease);
    viewport.off('pointerupoutside', stop);
    viewport.off('pointercancel', stop);
    onEnd?.();
  };
  const onMove = (move: FederatedPointerEvent): void => {
    if (!isClick(move)) stop();
  };
  const onRelease = (up: FederatedPointerEvent): void => {
    stop();
    if (isClick(up)) onClick(up);
  };

  viewport.on('pointermove', onMove);
  viewport.on('pointerup', onRelease);
  viewport.on('pointerupoutside', stop);
  // A press the gesture layer takes back (`PointerGate.cancel`) is no click
  viewport.on('pointercancel', stop);
  return stop;
}
