import type * as React from 'react';

/** Between a button and the menu it hangs below itself, as Atlas' dropdowns keep (`sideOffset`). */
const MENU_GAP = 4;

/** Where an item's menu opens, and the element that takes focus back when it closes from the keyboard. */
export interface MenuAnchor {
  clientX: number;
  clientY: number;
  returnFocus: HTMLElement | null;
}

/** A menu opened by the pointer: at the pointer, over the element it was opened on. */
export function anchorAtPointer(event: React.MouseEvent<HTMLElement>): MenuAnchor {
  return { clientX: event.clientX, clientY: event.clientY, returnFocus: event.currentTarget };
}

/** A menu opened from the keyboard (Shift+F10): from the middle of the focused element, which it hands focus back to. */
export function anchorAtElement(element: HTMLElement): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return { clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, returnFocus: element };
}

/**
 * A menu opened from a button that hangs it below itself (a card's ⋯): under the button's start, handing focus,
 * when it closes from the keyboard, to `returnFocus` (the item the button acts for).
 */
export function anchorUnder(element: HTMLElement, returnFocus: HTMLElement | null): MenuAnchor {
  const rect = element.getBoundingClientRect();
  return { clientX: rect.left, clientY: rect.bottom + MENU_GAP, returnFocus };
}
