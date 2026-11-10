import { Point as PixiPoint, type Application, type FederatedPointerEvent } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import { watchClick } from '../utils/clickRelease';
import { setCanvasCursor } from '../utils/canvasCursor';
import { canRunMapHotkeys, matchesMapHotkey } from '../../keyboard/mapHotkeys';
import type { SettingsService } from '../../services/SettingsService';
import type { PlacementSession } from './PlacementSession';
import type { Point } from './placementLayout';
import { WheelSteps } from './wheelSteps';

export interface PlacementInputDeps {
  app: Application;
  viewport: Viewport;
  canvas: HTMLCanvasElement;
  viewId: string;
  settings(): SettingsService | undefined;
}

/** How long after a placement a double click on the map is still taken as part of it, in ms. */
const DOUBLE_CLICK_GUARD_MS = 500;

/**
 * Hands the pointer and keys to `session` while it lasts; returns the function that gives them back.
 * A left press on the map is the session's alone: it is taken before PIXI sees it, so no tool,
 * token or marquee answers it. Moved while held it turns the tokens, released it puts them down.
 * A right-drag still pans and a right click in place puts the tokens away, as Escape does (which
 * first lets go of a press). With Shift held the wheel cycles the queue instead of zooming. Shift is
 * read from every pointer, key and wheel event and dropped when the window loses focus. The system
 * cursor is hidden over the map, the held tokens being the cursor, and shown while a press turns them.
 */
export function bindPlacementInput(deps: PlacementInputDeps, session: PlacementSession): () => void {
  const { app, viewport, canvas } = deps;
  const host = canvas.parentElement ?? canvas;
  const win = canvas.ownerDocument.defaultView ?? window;
  let stopRightClick: (() => void) | null = null;
  const wheel = new WheelSteps();
  const cursor = (): string => (session.pressing ? 'grabbing' : 'none');

  const screenOf = (event: { clientX: number; clientY: number }): Point => {
    const point = new PixiPoint();
    app.renderer.events.mapPositionToPoint(point, event.clientX, event.clientY);
    return { x: point.x, y: point.y };
  };

  const onMove = (event: FederatedPointerEvent): void => {
    session.moveTo({ x: event.global.x, y: event.global.y }, event.shiftKey);
    // After PIXI's own cursor write for this event
    queueMicrotask(() => { if (session.active) setCanvasCursor(canvas, cursor()); });
  };
  const onPress = (event: PointerEvent): void => {
    if (event.target !== canvas || event.button !== 0) return;
    event.stopPropagation();
    event.preventDefault();
    session.pressAt(screenOf(event), event.shiftKey);
    setCanvasCursor(canvas, cursor());
  };
  const onPressMove = (event: PointerEvent): void => {
    if (session.pressing) session.turn(screenOf(event), event.altKey);
  };
  const onRelease = (event: PointerEvent): void => {
    if (event.button !== 0 || !session.pressing) return;
    session.release();
    if (session.active) setCanvasCursor(canvas, cursor());
  };
  const onPressLost = (): void => {
    session.cancelPress();
    if (session.active) setCanvasCursor(canvas, cursor());
  };
  const onWheel = (event: WheelEvent): void => {
    if (event.target !== canvas || !event.shiftKey) return;
    session.setShift(true);
    if (!session.cycling) return;
    event.preventDefault();
    event.stopPropagation();
    session.cycle(wheel.take(event));
  };
  const onDoubleClick = (event: MouseEvent): void => {
    if (event.target !== canvas) return;
    event.stopPropagation();
    event.preventDefault();
  };
  const onRightPress = (event: FederatedPointerEvent): void => {
    if (event.button !== 2 || session.pressing) return;
    stopRightClick?.();
    stopRightClick = watchClick(viewport, event, () => session.cancel());
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === 'Shift') session.setShift(event.type === 'keydown');
    else if (event.type === 'keydown' && matchesMapHotkey(event, 'cancel', deps.settings()) && canRunMapHotkeys(event, deps.viewId)) {
      event.preventDefault();
      event.stopPropagation();
      if (session.pressing) onPressLost();
      else session.cancel();
    }
  };
  const onBlur = (): void => {
    onPressLost();
    session.setShift(false);
  };
  const onLeave = (): void => session.setOnMap(false);
  const onViewChanged = (): void => session.viewChanged();

  viewport.on('pointermove', onMove);
  viewport.on('pointerdown', onRightPress);
  viewport.on('moved', onViewChanged);
  viewport.on('zoomed', onViewChanged);
  host.addEventListener('pointerdown', onPress, { capture: true });
  host.addEventListener('dblclick', onDoubleClick, { capture: true });
  host.addEventListener('wheel', onWheel, { capture: true, passive: false });
  canvas.addEventListener('pointerleave', onLeave);
  win.addEventListener('pointermove', onPressMove, { capture: true });
  win.addEventListener('pointerup', onRelease, { capture: true });
  win.addEventListener('pointercancel', onPressLost, { capture: true });
  win.addEventListener('keydown', onKey, { capture: true });
  win.addEventListener('keyup', onKey, { capture: true });
  win.addEventListener('blur', onBlur);
  setCanvasCursor(canvas, 'none');

  return (): void => {
    viewport.off('pointermove', onMove);
    viewport.off('pointerdown', onRightPress);
    viewport.off('moved', onViewChanged);
    viewport.off('zoomed', onViewChanged);
    stopRightClick?.();
    host.removeEventListener('pointerdown', onPress, { capture: true });
    host.removeEventListener('wheel', onWheel, { capture: true });
    canvas.removeEventListener('pointerleave', onLeave);
    win.removeEventListener('pointermove', onPressMove, { capture: true });
    win.removeEventListener('pointerup', onRelease, { capture: true });
    win.removeEventListener('pointercancel', onPressLost, { capture: true });
    win.removeEventListener('keydown', onKey, { capture: true });
    win.removeEventListener('keyup', onKey, { capture: true });
    win.removeEventListener('blur', onBlur);
    setCanvasCursor(canvas, 'default');
    // The second click of a double click that put the last token down must not open it
    win.setTimeout(() => host.removeEventListener('dblclick', onDoubleClick, { capture: true }), DOUBLE_CLICK_GUARD_MS);
  };
}
