/**
 * What a drag over the canvas reads from the DOM: the boxes of the drawn
 * blocks in the stage's coordinates, which scroll with the card, so a scroll
 * during the drag needs no new measure. dnd-kit's own collision detection is
 * not used: the drop target comes from `dropTargets` over these boxes, and
 * dnd-kit is told of no collisions at all, which keeps its context still
 * while the pointer moves.
 */

import type { Collision, CollisionDetection } from '@dnd-kit/core';
import type { TemplateLayout } from '../../model/templateTypes';
import type { Box, Point } from './dropGeometry';
import type { DropScene } from './dropTargets';

/** The card in the stage; blocks are only looked up there. */
const SHEET = '.atlas-statblock';
/** A frame the drag slides (siblings in the starting list): measured as if it stood still. */
export const SHIFT_ATTRIBUTE = 'data-te-shift';

const NO_COLLISIONS: Collision[] = [];
export const noCollisions: CollisionDetection = () => NO_COLLISIONS;

/** The translation a computed `transform` holds (`matrix(…)`, `matrix3d(…)`), or none. */
export function translationOf(transform: string): Point {
  const values = /^matrix(3d)?\(([^)]*)\)$/.exec(transform.trim());
  if (!values) return { x: 0, y: 0 };
  const numbers = (values[2] ?? '').split(',').map(Number);
  const [x, y] = values[1] ? [numbers[12], numbers[13]] : [numbers[4], numbers[5]];
  return { x: Number.isFinite(x) ? x ?? 0 : 0, y: Number.isFinite(y) ? y ?? 0 : 0 };
}

/** How far the slid frames at or above `element` (below `stage`) move it right now, transitions included. */
function slidBy(element: Element, stage: Element): Point {
  let x = 0;
  let y = 0;
  for (let node: Element | null = element; node && node !== stage; node = node.parentElement) {
    if (!node.hasAttribute(SHIFT_ATTRIBUTE)) continue;
    const moved = translationOf(node.win.getComputedStyle(node).transform);
    x += moved.x;
    y += moved.y;
  }
  return { x, y };
}

/** A client point in the stage's coordinates. */
export function toStage(stage: Element, point: Point): Point {
  const origin = stage.getBoundingClientRect();
  return { x: point.x - origin.left, y: point.y - origin.top };
}

/** A stage box in client coordinates. */
export function toClient(stage: Element, box: Box): Box {
  const origin = stage.getBoundingClientRect();
  return { left: box.left + origin.left, top: box.top + origin.top, right: box.right + origin.left, bottom: box.bottom + origin.top };
}

function boxOf(element: Element, origin: DOMRect, slid: Point): Box {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - origin.left - slid.x,
    top: rect.top - origin.top - slid.y,
    right: rect.right - origin.left - slid.x,
    bottom: rect.bottom - origin.top - slid.y,
  };
}

/**
 * Every drawn block's box in the stage's coordinates, as laid out without the
 * drag's own slides. Blocks inside a folded Section are not drawn.
 */
export function measureScene(stage: HTMLElement, layout: TemplateLayout): DropScene {
  const origin = stage.getBoundingClientRect();
  const boxes = new Map<string, Box>();
  const sheet = stage.querySelector(SHEET);
  for (const frame of sheet?.querySelectorAll('[data-block-id]') ?? []) {
    const id = frame.getAttribute('data-block-id');
    if (!id || frame.getClientRects().length === 0 || frame.closest('[inert]')) continue;
    boxes.set(id, boxOf(frame, origin, slidBy(frame, stage)));
  }
  // The header counts as the card: a drop over it lands in the first row.
  const card = sheet?.querySelector('.atlas-statblock-body') ?? stage.firstElementChild;
  return { layout, boxes, card: card ? boxOf(card, origin, { x: 0, y: 0 }) : null };
}
