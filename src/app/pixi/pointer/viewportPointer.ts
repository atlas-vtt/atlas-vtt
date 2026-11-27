import type { FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { showMapCursor, toolCursorOf } from '../utils/canvasCursor';
import { watchClick } from '../utils/clickRelease';
import { isCtrlClick } from '../utils/pointerButtons';
import type { PointerAt } from './mapLayers';
import type { MapPointer, OpenOnRelease } from './MapPointer';

/**
 * The cursor of the part of the map PIXI hit below the viewport (a token's name badge, a rotate or resize
 * handle, a bar button), which PIXI writes itself; null where the viewport itself was hit or the part sets none.
 */
function partCursor(event: FederatedPointerEvent, viewport: Viewport): string | null {
  const target = event.target as { cursor?: unknown } | null | undefined;
  if (!target || target === viewport) return null;
  return typeof target.cursor === 'string' && target.cursor !== '' ? target.cursor : null;
}

/**
 * Feeds `pointer` the viewport's pointer events and the canvas's double clicks and leaves, and
 * shows the cursor of each move: the map's own (a pin, a token), else the part PIXI hit (a handle,
 * a name badge), else the cursor a tool or panel set, else the system's arrow. Call it before
 * anything else listens to the viewport's presses: a listener that leaves claimed presses alone
 * (`isHandled`) must hear them after the claim, and PIXI calls a target's listeners in the order
 * they were added. Returns the function that stops it.
 */
export function listenToViewport(pointer: MapPointer, viewport: Viewport, canvas: HTMLCanvasElement): () => void {
  let stopMenu: (() => void) | null = null;
  const dropMenu = (): void => {
    stopMenu?.();
    stopMenu = null;
  };
  const openOnRelease: OpenOnRelease = (down, open) => {
    dropMenu();
    // A right-drag pans, so the right button's menu waits for a release in place. A Ctrl+click on macOS cannot pan: its menu opens at once
    if (isCtrlClick(down)) open(down);
    else stopMenu = watchClick(viewport, down, open);
  };
  let showsOwn = false;
  const at = (event: FederatedPointerEvent): PointerAt => {
    const world = viewport.toWorld(event.global);
    return { x: world.x, y: world.y, event };
  };

  const onDown = (event: FederatedPointerEvent): void => pointer.press(at(event), openOnRelease);
  const onMove = (event: FederatedPointerEvent): void => {
    // PIXI hears moves on the whole document, so moves over DOM overlays (note previews, panels) reach the viewport too: only the canvas drives hover
    const target = event.nativeEvent?.target;
    if (target instanceof Node && target !== canvas) return;
    const cursor = pointer.move(at(event));
    if (cursor === null) return;
    viewport.cursor = cursor.own ?? 'default';
    const tool = toolCursorOf(canvas);
    // With no tool cursor and nothing of the map's shown before, PIXI's own write for the event stands
    if (cursor.own === null && tool === null && !showsOwn) return;
    showsOwn = cursor.own !== null;
    const shown = cursor.own ?? partCursor(event, viewport) ?? tool ?? 'default';
    // PIXI writes the cursor of this event after its listeners: it is written again once PIXI has
    queueMicrotask(() => showMapCursor(canvas, shown));
  };
  const onUp = (): void => pointer.release();
  // The gesture layer took the pointer away (`PointerGate.cancel`): PIXI itself maps no cancel
  const onCancel = (): void => {
    dropMenu();
    pointer.cancel();
  };
  const onDoubleClick = (): void => pointer.doubleClick();
  const onLeave = (): void => pointer.leave();

  viewport.on('pointerdown', onDown);
  viewport.on('pointermove', onMove);
  viewport.on('pointerup', onUp);
  viewport.on('pointerupoutside', onUp);
  viewport.on('pointercancel', onCancel);
  canvas.addEventListener('dblclick', onDoubleClick);
  canvas.addEventListener('pointerleave', onLeave);
  return () => {
    dropMenu();
    viewport.off('pointerdown', onDown);
    viewport.off('pointermove', onMove);
    viewport.off('pointerup', onUp);
    viewport.off('pointerupoutside', onUp);
    viewport.off('pointercancel', onCancel);
    canvas.removeEventListener('dblclick', onDoubleClick);
    canvas.removeEventListener('pointerleave', onLeave);
  };
}
