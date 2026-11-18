import type { Container, EventSystem } from 'pixi.js';

const acting = new WeakSet<Container>();

/**
 * Marks a display object whose own press does something at once that a lost pointer does not take
 * back: a bar's + and -, a bar that opens its value, a name that is edited. A finger presses such
 * a thing by a tap alone (`GestureHost.pressActsAt`); what is dragged from its press is never marked.
 */
export function actsOnPress<T extends Container>(target: T): T {
  acting.add(target);
  return target;
}

/** Whether the display object that a press at a point of the canvas goes to is one that acts on it: PIXI's own hit test, so the two cannot differ. */
export function pressActsOnCanvas(events: EventSystem, x: number, y: number): boolean {
  const target: Container | null | undefined = events.rootBoundary.rootTarget ? events.rootBoundary.hitTest(x, y) : null;
  return target != null && acting.has(target);
}
