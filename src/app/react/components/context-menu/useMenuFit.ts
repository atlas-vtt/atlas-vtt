import { useLayoutEffect, useState, type RefObject } from 'react';
import { observeResize } from '../../../utils/observeResize';

/** The menu's content does not fit its height, which would make it scroll. */
const overflows = (menu: HTMLElement): boolean => menu.scrollHeight > menu.clientHeight;

/**
 * Lays a menu too tall for its window out in columns, of as many rows as fit. Arrow keys go through
 * the items in their order, as in one column.
 */
function intoColumns(menu: HTMLElement): void {
  const items = menu.childElementCount;
  let rows = Math.floor(items * menu.clientHeight / menu.scrollHeight);
  menu.classList.add('atlas-ctx-menu--columns');
  do {
    menu.style.setProperty('--atlas-ctx-rows', String(Math.max(1, rows)));
    rows--;
  } while (overflows(menu) && rows > 0);
}

/**
 * A menu never scrolls: rows that scroll out of sight are rows nobody finds. It keeps to `pane`
 * while it fits there, and otherwise has the whole window, which a menu may cover like any other;
 * one too tall even for that (a system's forty conditions) goes into columns. Returns the boundary
 * to place the menu in. Measured once placed, since only then is its height limited.
 */
export function useMenuFit(menu: RefObject<HTMLElement | null>, pane: Element | null | undefined): Element | never[] {
  const [inWindow, setInWindow] = useState(!pane);

  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return undefined;
    return observeResize([element], () => {
      if (!overflows(element)) return;
      if (inWindow) intoColumns(element);
      else setInWindow(true);
    });
  }, [menu, inWindow]);

  return inWindow || !pane ? [] : pane;
}
