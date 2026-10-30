import type { Viewport } from 'pixi-viewport';

/** On the canvas' parent while a point is being picked: the map shows a crosshair. */
export const PICKING_POINT_CLASS = 'atlas-picking-point';

/**
 * Turns the map's cursor into a crosshair until the next press on `canvas`. A left click goes to
 * `onPick` as a world point instead of to the active tool; any other press or Escape cancels.
 * `onEnd` runs either way; `onMove` follows the pointer over the map. Returns the function that cancels.
 */
export function pickMapPoint(
  canvas: HTMLCanvasElement,
  viewport: Pick<Viewport, 'toWorld'>,
  onPick: (x: number, y: number) => void,
  onEnd: () => void,
  onMove?: (x: number, y: number) => void,
): () => void {
  // Listens on the parent, capturing: PIXI's own listener sits on the canvas and never sees the press
  const host = canvas.parentElement ?? canvas;
  const doc = canvas.ownerDocument;
  let ended = false;
  const end = (): void => {
    if (ended) return;
    ended = true;
    host.removeEventListener('pointerdown', onPointerDown, true);
    host.removeEventListener('pointermove', onPointerMove, true);
    doc.removeEventListener('keydown', onKeyDown, true);
    host.classList.remove(PICKING_POINT_CLASS);
    onEnd();
  };
  const onPointerDown = (event: PointerEvent): void => {
    // The bars and panels over the map keep their clicks
    if (event.target !== canvas) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.button === 0) {
      const point = worldAt(event);
      onPick(point.x, point.y);
    }
    end();
  };
  // Moves still reach the map: hover effects stay as they are
  const onPointerMove = (event: PointerEvent): void => {
    const point = worldAt(event);
    onMove?.(point.x, point.y);
  };
  const worldAt = (event: PointerEvent): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return viewport.toWorld(event.clientX - rect.left, event.clientY - rect.top);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    end();
  };
  host.addEventListener('pointerdown', onPointerDown, true);
  if (onMove) host.addEventListener('pointermove', onPointerMove, true);
  doc.addEventListener('keydown', onKeyDown, true);
  host.classList.add(PICKING_POINT_CLASS);
  return end;
}
