import React from 'react';
import { MENU_SEPARATOR, MenuIcon, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';
import { openContextMenuGlobal } from '../../../react/root/ContextMenuContext';

/** A row of one of the control's menus. */
export interface MenuEntry {
  readonly title: string;
  /** An Obsidian icon name; rows without one keep the icon's room only where another row has one. */
  readonly icon?: string;
  readonly run: () => void;
  readonly warning?: boolean;
  /** A separator goes above it, where a row stands above it. */
  readonly apart?: boolean;
  /** A switch or a choice: ticked while on. */
  readonly checked?: boolean;
  /** Stays in its place, switched off. */
  readonly disabled?: boolean;
}

/** Atlas' menu entries for `entries`. A separator never opens the menu: a list may begin with a row that stands apart in a longer one. */
export function menuEntries(entries: readonly MenuEntry[]): ContextMenuEntry[] {
  const icons = entries.some((entry) => entry.icon !== undefined);
  return entries.flatMap((entry, index): ContextMenuEntry[] => [
    ...(entry.apart === true && index > 0 ? [MENU_SEPARATOR] : []),
    {
      type: 'item',
      label: entry.title,
      onClick: entry.run,
      ...(icons && { leading: React.createElement(MenuIcon, { name: entry.icon ?? '' }) }),
      ...(entry.warning === true && { destructive: true }),
      ...(entry.disabled === true && { disabled: true }),
      ...(entry.checked !== undefined && { checked: entry.checked }),
    },
  ]);
}

/**
 * Opens Atlas' menu below `anchor`, in the window `anchor` lives in; `anchor` stays shown while it is
 * open, and takes focus back when the menu closes from the keyboard.
 */
export function openMenuBelow(entries: readonly MenuEntry[], anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  anchor.addClass('is-open');
  openContextMenuGlobal(menuEntries(entries), { x: rect.left, y: rect.bottom }, {
    doc: anchor.doc,
    returnFocus: anchor,
    onClose: () => anchor.removeClass('is-open'),
  });
}
