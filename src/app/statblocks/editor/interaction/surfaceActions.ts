/**
 * What a target's menu offers, as descriptors (spec §5.1): one builder per
 * target kind returns them, and every way into the menu (right-click, the
 * handle, the toolbar's More, Shift+F10) renders the same list through
 * Atlas' context menu. Destructive rows come last; a row with a key shows it.
 */

import React from 'react';
import { MENU_SEPARATOR, MenuIcon, type ContextMenuEntry } from '../../../react/components/context-menu/AtlasContextMenu';

/** At most this many rows in one menu; a submenu counts on its own (J11). */
export const MAX_MENU_ROWS = 12;

export type SurfaceAction =
  | {
    kind: 'item';
    id: string;
    label: string;
    icon?: string | undefined;
    /** The key that does the same, written as the platform writes it. */
    hint?: string | undefined;
    disabled?: boolean | undefined;
    destructive?: boolean | undefined;
    /** A choice among several: ticked while it is the one in use. */
    checked?: boolean | undefined;
    run: () => unknown;
  }
  | { kind: 'submenu'; id: string; label: string; icon?: string | undefined; children: SurfaceAction[] }
  | { kind: 'separator' };

export type SurfaceItem = Extract<SurfaceAction, { kind: 'item' }>;

export const SEPARATOR: SurfaceAction = { kind: 'separator' };

/**
 * Drops separators that would stand first, last or twice in a row, and empty
 * submenus, so a builder may add sections freely.
 */
export function tidy(actions: readonly SurfaceAction[]): SurfaceAction[] {
  const out: SurfaceAction[] = [];
  for (const action of actions) {
    if (action.kind === 'submenu' && action.children.length === 0) continue;
    if (action.kind === 'separator' && (out.length === 0 || out.at(-1)?.kind === 'separator')) continue;
    out.push(action.kind === 'submenu' ? { ...action, children: tidy(action.children) } : action);
  }
  if (out.at(-1)?.kind === 'separator') out.pop();
  return out;
}

/** The rows a menu shows, separators left out; a submenu is one row here. */
export function rowCount(actions: readonly SurfaceAction[]): number {
  return actions.filter((action) => action.kind !== 'separator').length;
}

/** Every menu in a tree of actions holds at most `MAX_MENU_ROWS` rows. */
export function fitsMenuLimit(actions: readonly SurfaceAction[]): boolean {
  return rowCount(actions) <= MAX_MENU_ROWS
    && actions.every((action) => action.kind !== 'submenu' || fitsMenuLimit(action.children));
}

/**
 * The descriptors as Atlas' context menu draws them. A menu where any row has
 * an icon (a submenu always keeps an icon slot) gives every row one, empty
 * where it has none, so every label starts on one edge.
 */
export function toMenuEntries(actions: readonly SurfaceAction[]): ContextMenuEntry[] {
  const tidied = tidy(actions);
  const slots = tidied.some((action) => action.kind === 'submenu' || (action.kind === 'item' && action.icon));
  return tidied.map((action): ContextMenuEntry => {
    switch (action.kind) {
      case 'separator': return MENU_SEPARATOR;
      case 'submenu': return { type: 'submenu', label: action.label, ...(action.icon && { icon: action.icon }), children: toMenuEntries(action.children) };
      case 'item': return {
        type: 'item',
        label: action.label,
        onClick: action.run,
        ...(slots && { leading: React.createElement(MenuIcon, { name: action.icon ?? '' }) }),
        ...(action.hint && { detail: action.hint }),
        ...(action.disabled !== undefined && { disabled: action.disabled }),
        ...(action.destructive && { destructive: true }),
        ...(action.checked !== undefined && { checked: action.checked }),
      };
    }
  });
}

/** The first item with this id, anywhere in the tree (tests, and keys that run a menu's action). */
export function findAction(actions: readonly SurfaceAction[], id: string): SurfaceItem | null {
  for (const action of actions) {
    if (action.kind === 'item' && action.id === id) return action;
    if (action.kind === 'submenu') {
      const found = findAction(action.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Atlas' menus draw an item's icon only as `leading`: entries written with
 * `icon` get it there, and once any row of a menu has an icon (a submenu
 * always keeps an icon slot) every row gets a slot, empty where it has none.
 */
export function alignedEntries(entries: readonly ContextMenuEntry[]): ContextMenuEntry[] {
  const slots = entries.some((entry) => entry.type === 'submenu' || (entry.type === 'item' && (Boolean(entry.icon) || entry.leading !== undefined)));
  return entries.map((entry): ContextMenuEntry => {
    if (entry.type === 'submenu') {
      return Array.isArray(entry.children) ? { ...entry, children: alignedEntries(entry.children) } : entry;
    }
    if (entry.type !== 'item' || !slots || entry.leading !== undefined) return entry;
    return { ...entry, leading: React.createElement(MenuIcon, { name: entry.icon ?? '' }) };
  });
}
