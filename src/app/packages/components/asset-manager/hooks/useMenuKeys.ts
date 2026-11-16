import type * as React from 'react';
import { useEffect, useRef } from 'react';

const ITEM = '[role^="menuitem"]:not(:disabled)';

/** Which item focus goes to as a menu opens from the keyboard. */
export type MenuFocus = 'first' | 'last';

/** The item an arrow, Home or End moves to among `count` items, wrapping at the ends; null for any other key. */
export function nextMenuItem(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case 'ArrowDown': return (index + 1) % count;
    case 'ArrowUp': return index <= 0 ? count - 1 : index - 1;
    case 'Home': return 0;
    case 'End': return count - 1;
    default: return null;
  }
}

export interface MenuKeys {
  /** Opens the menu from the keyboard with focus on its first or last item (WAI-ARIA menu button). */
  openWith: (focus: MenuFocus) => void;
  onMenuKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
}

/**
 * The keys of a menu button's menu: Down and Up (and Enter or Space on the button) open it with
 * focus on its first or last item, then move between its items, Home and End go to the ends,
 * Tab closes it. Escape is the menu's own (`useDialogEscape`), which gives focus back.
 */
export function useMenuKeys(menuRef: React.RefObject<HTMLElement | null>, isOpen: boolean, setOpen: (open: boolean) => void): MenuKeys {
  const pending = useRef<MenuFocus | null>(null);

  const focusItem = (focus: MenuFocus): void => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM) ?? []);
    (focus === 'first' ? items[0] : items[items.length - 1])?.focus();
  };

  useEffect(() => {
    if (!isOpen || !pending.current) return;
    focusItem(pending.current);
    pending.current = null;
  }, [isOpen, menuRef]);

  // A menu the pointer opened is open already: the arrow key on its button only moves focus into it.
  const openWith = (focus: MenuFocus): void => {
    if (isOpen) {
      focusItem(focus);
      return;
    }
    pending.current = focus;
    setOpen(true);
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Tab') {
      setOpen(false);
      return;
    }
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(ITEM));
    const next = nextMenuItem(event.key, items.indexOf(event.target as HTMLElement), items.length);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    items[next]?.focus();
  };

  return { openWith, onMenuKeyDown };
}
