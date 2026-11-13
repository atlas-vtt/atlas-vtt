import type { EventSystem } from 'pixi.js';
import type { Viewport } from 'pixi-viewport';
import type { Point } from '../../types/visionTypes';

/** Where the pointer is on the canvas, in the viewport's screen pixels, and whether Alt was held there. */
export interface PointerPlace {
  screen: Point;
  free: boolean;
}

/** A view without PIXI's own events (a test) has none of this. */
const eventsOf = (viewport: Viewport): Partial<EventSystem> | undefined => viewport.options.events;

/**
 * Where the pointer rests over the canvas of `viewport`, where no pointer move has told of it: the
 * place of the last pointer event of any kind, if the canvas is what lies there now (not a bar, a
 * panel or a text's field). Null for a finger, which rests nowhere, and where that cannot be told.
 */
export function restingPointer(viewport: Viewport): PointerPlace | null {
  const events = eventsOf(viewport);
  const canvas = events?.domElement;
  const pointer = events?.pointer;
  const native = pointer?.nativeEvent as Partial<PointerEvent> | null | undefined;
  if (!canvas || !pointer || !native || typeof native.clientX !== 'number' || typeof native.clientY !== 'number') return null;
  if (native.pointerType === 'touch') return null;
  const doc = canvas.ownerDocument;
  if (typeof doc.elementFromPoint !== 'function' || doc.elementFromPoint(native.clientX, native.clientY) !== canvas) return null;
  return { screen: { x: pointer.global.x, y: pointer.global.y }, free: native.altKey === true };
}

/**
 * Sets the cursor of the canvas of `viewport` where no pointer event does; null for the system's
 * own. PIXI sets the canvas's cursor again after every press and release, to what its last pointer
 * move left, so that is told too.
 */
export function setCanvasCursor(viewport: Viewport, cursor: string | null): void {
  const shown = cursor ?? 'default';
  viewport.cursor = shown;
  const events = eventsOf(viewport);
  if (!events?.rootBoundary || typeof events.setCursor !== 'function') return;
  events.rootBoundary.cursor = shown;
  events.setCursor(shown);
}
