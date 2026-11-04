/**
 * Hover on a card (spec §3.1, §3.3), attribute-only: `pointerover` on the
 * surface's root finds the innermost target (an ability where the surface has
 * them, else a block's frame) and hands it to the hover store, which marks it.
 * The strip left of the target counts as hovering it, so the pointer can move
 * from the text to the handle in the gutter; leaving both, the target goes
 * after a short grace. Keyboard focus on a target shows its handle too.
 */

import { useEffect, type RefObject } from 'react';
import type { HoverStore, HoverTarget } from './hoverStore';

/** An ability of a list: its identity in the list's values. */
export const ITEM_SELECTOR = '[data-item-key]';
const FRAME_SELECTOR = '[data-block-id]';
const SHEET_SELECTOR = '.atlas-statblock';
/** How far left of a target the pointer may go and still point at it: the gutter its handle stands in. */
export const CORRIDOR = 28;

export interface SurfaceHoverOptions {
  /** Whether abilities are targets of their own (the note panel) or part of their block (the template editor). */
  items: boolean;
  /** Off: nothing is marked (a read-only card, a drag under way elsewhere). */
  enabled: boolean;
  /** Elements whose pointer events leave the hover alone: the surface's own floating chrome. */
  ignore?: string | undefined;
}

function closestIn(node: EventTarget | null, selector: string, within: Element): HTMLElement | null {
  const element = node as Partial<Element> | null;
  if (typeof element?.closest !== 'function') return null;
  const found = element.closest(selector);
  return found && within.contains(found) && found.instanceOf(HTMLElement) ? found : null;
}

/** The innermost target a node lies in, on the card inside `root`; null off the card's blocks. */
export function targetAt(root: HTMLElement, node: EventTarget | null, items: boolean): HoverTarget | null {
  const sheet = root.querySelector(SHEET_SELECTOR) ?? root;
  const item = items ? closestIn(node, ITEM_SELECTOR, sheet) : null;
  const frame = closestIn(item ?? node, FRAME_SELECTOR, sheet);
  const blockId = frame?.getAttribute('data-block-id');
  if (!frame || !blockId) return null;
  if (item) return { kind: 'item', element: item, blockId, itemKey: item.getAttribute('data-item-key') ?? undefined };
  return { kind: 'block', element: frame, blockId };
}

/** Whether a client point lies in the target's box or the gutter strip left of it. */
export function inCorridor(target: HoverTarget, x: number, y: number): boolean {
  const box = target.element.getBoundingClientRect();
  return y >= box.top && y <= box.bottom && x >= box.left - CORRIDOR && x <= box.right;
}

export function useSurfaceHover(rootRef: RefObject<HTMLElement | null>, store: HoverStore, options: SurfaceHoverOptions): void {
  const { items, enabled, ignore } = options;
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !enabled) return undefined;
    const ignored = (node: EventTarget | null): boolean => {
      const element = node as Partial<Element> | null;
      return ignore !== undefined && typeof element?.closest === 'function' && element.closest(ignore) !== null;
    };
    const point = (event: PointerEvent): void => {
      if (event.pointerType === 'touch' || ignored(event.target)) return;
      const found = targetAt(root, event.target, items);
      if (found) {
        store.set(found);
        return;
      }
      const current = store.getSnapshot().target;
      if (current && inCorridor(current, event.clientX, event.clientY)) store.cancelClear();
      else store.scheduleClear(root.win);
    };
    const leave = (): void => store.scheduleClear(root.win);
    const focus = (event: FocusEvent): void => {
      const element = event.target as Partial<Element> | null;
      if (typeof element?.matches !== 'function') return;
      if (!element.matches(FRAME_SELECTOR) && !(items && element.matches(ITEM_SELECTOR))) return;
      const found = targetAt(root, event.target, items);
      if (found) store.set(found);
    };
    root.addEventListener('pointerover', point);
    root.addEventListener('pointermove', point);
    root.addEventListener('pointerleave', leave);
    root.addEventListener('focusin', focus);
    return () => {
      root.removeEventListener('pointerover', point);
      root.removeEventListener('pointermove', point);
      root.removeEventListener('pointerleave', leave);
      root.removeEventListener('focusin', focus);
      store.clear();
    };
  }, [rootRef, store, items, enabled, ignore]);
}
