import type * as React from 'react';
import type { SelectionEvent } from '../types';
import { columnsOfRow, nextGridIndex } from '../utils/gridNavigation';

const FOLDER = '[data-folder-id]';

/**
 * Arrow keys over the folders' listbox: focus moves folder by folder and row by row
 * (the CSS grid's column count read from where its rows break), Home and End to the
 * ends; Shift with them selects the folder focus lands on, as Shift+click does.
 */
export function useFolderGridKeys(
  onSelection: (folderId: string, event?: SelectionEvent) => void,
): (event: React.KeyboardEvent<HTMLElement>) => void {
  return (event) => {
    if (event.ctrlKey || event.metaKey) return;
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(FOLDER));
    const index = items.findIndex((item) => item === event.target);
    if (index === -1) return;
    const next = nextGridIndex(index, event, columnsOfRow(items), items.length);
    if (next === null) return;
    event.preventDefault();
    event.stopPropagation();
    const target = items[next]!;
    target.focus();
    if (event.shiftKey && target.dataset.folderId) onSelection(target.dataset.folderId, event);
  };
}
