import React from 'react';
import type { ContextMenuEntry } from '../react/components/context-menu/AtlasContextMenu';
import { SideBySideRow } from './SideBySideRow';
import type { RunAction, SelectionAction } from './selectionActions';

function item(action: RunAction): ContextMenuEntry {
  return {
    type: 'item',
    label: action.label,
    ...(action.icon !== undefined && { icon: action.icon }),
    ...(action.checked !== undefined && { checked: action.checked }),
    ...(!action.enabled && { disabled: true }),
    ...(action.destructive && { destructive: true }),
    onClick: () => action.run(),
  };
}

/**
 * The context menu of `actions`, row by row in their order: an action is an item, choices are a
 * submenu, and actions that stand side by side share one row. `close` closes the menu after a
 * press in such a row, which the menu itself does for its own rows; a list without such a row
 * needs none.
 */
export function selectionMenu(actions: readonly SelectionAction[], close: () => void = () => undefined): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];
  let beside: RunAction[] | null = null;
  for (const action of actions) {
    if (action.kind === 'run' && action.sideBySide) {
      if (beside) {
        beside.push(action);
        continue;
      }
      const row: RunAction[] = [action];
      beside = row;
      entries.push({ type: 'custom', render: () => <SideBySideRow actions={row} onClose={close} /> });
      continue;
    }
    beside = null;
    if (action.kind === 'row') entries.push(action.row);
    else if (action.kind === 'run') entries.push(item(action));
    else {
      entries.push({
        type: 'submenu', label: action.label, ...(action.icon !== undefined && { icon: action.icon }), children: action.choices,
        ...(action.follow && { subscribe: action.follow }),
      });
    }
  }
  return entries;
}
