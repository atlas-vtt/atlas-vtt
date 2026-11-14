import type { Container, FederatedPointerEvent } from 'pixi.js';

/**
 * Tracks pointer presses already claimed by the viewport-level dispatch (a token, a pin, a door
 * badge, a light marker), so the viewport's other listeners (marquee selection and the drawing,
 * fog, measure, text and note pin tools) leave them alone.
 *
 * PIXI v8 pools and reuses FederatedPointerEvent objects, so the dispatcher
 * must call `resetHandled` at the start of every new pointer event.
 */
const handledEvents = new WeakSet<FederatedPointerEvent>();
/** Pointers whose press was claimed. The tap PIXI sends after the release is another event object. */
const handledPresses = new Set<number>();

export function markHandled(event: FederatedPointerEvent): void {
  handledEvents.add(event);
  handledPresses.add(event.pointerId);
}

export function isHandled(event: FederatedPointerEvent): boolean {
  return handledEvents.has(event);
}

/** Whether `event` is the tap that ends a press the dispatch claimed. */
export function isHandledTap(event: FederatedPointerEvent): boolean {
  return handledPresses.has(event.pointerId);
}

export function resetHandled(event: FederatedPointerEvent): void {
  handledEvents.delete(event);
  handledPresses.delete(event.pointerId);
}

/**
 * Lets `listener` hear the presses on `viewport` after every listener it has now. A reader of
 * `isHandled` must come after the dispatch: heard before it, a press still says what the
 * dispatch found of the press before, and nothing of what it will find of this one. The
 * dispatch (`TokenRenderer`) is built with the first map's grid, after the view's renderers.
 */
export function hearPressesLast(viewport: Container, listener: (event: FederatedPointerEvent) => void): void {
  viewport.off('pointerdown', listener);
  viewport.on('pointerdown', listener);
}
