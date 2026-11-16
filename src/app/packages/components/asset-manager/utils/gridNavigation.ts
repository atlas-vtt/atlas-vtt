/** The keys of a key event that `nextGridIndex` and `cardKeyAction` read. */
export interface GridKey {
  key: string;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
}

/**
 * Where focus goes in a grid of `count` items laid out `columns` to a row, read
 * row by row: the arrows step to the neighbouring item (up and down by a row,
 * staying put at the first and last row), Home and End go to the first and last
 * item, Page Up and Page Down a page of `pageRows` rows. Down from a row above a
 * shorter last row lands on the last item, as in Finder. Null for any other key.
 */
export function nextGridIndex(index: number, event: GridKey, columns: number, count: number, pageRows = 1): number | null {
  if (count === 0 || event.altKey) return null;
  const last = count - 1;
  const row = Math.floor(index / columns);
  const lastRow = Math.floor(last / columns);
  const down = (rows: number): number => (row >= lastRow ? index : Math.min(index + columns * Math.min(rows, lastRow - row), last));
  const up = (rows: number): number => (row === 0 ? index : index - columns * Math.min(rows, row));
  switch (event.key) {
    case 'ArrowRight': return Math.min(index + 1, last);
    case 'ArrowLeft': return Math.max(index - 1, 0);
    case 'ArrowDown': return down(1);
    case 'ArrowUp': return up(1);
    case 'PageDown': return down(Math.max(1, pageRows));
    case 'PageUp': return up(Math.max(1, pageRows));
    case 'Home': return 0;
    case 'End': return last;
    default: return null;
  }
}

/** What a key pressed on an asset card does; null leaves the key alone. */
export type CardKeyAction = 'open' | 'select' | 'delete' | 'menu';

/**
 * Enter runs the card's main action (spawn, open, create a scene, place), Space
 * selects it as a click does (Shift and Cmd/Ctrl extend), Delete or Backspace
 * asks to delete the selection, Shift+F10 opens the card's menu.
 */
export function cardKeyAction(event: GridKey): CardKeyAction | null {
  const modified = event.ctrlKey || event.metaKey || event.altKey;
  if (event.key === 'Enter' && !modified && !event.shiftKey) return 'open';
  if (event.key === ' ' && !event.altKey) return 'select';
  if ((event.key === 'Delete' || event.key === 'Backspace') && !event.altKey && !event.shiftKey) return 'delete';
  if (event.key === 'F10' && event.shiftKey && !modified) return 'menu';
  return null;
}

/** How many items of a wrapping row layout sit in its first row: its column count. */
export function columnsOfRow(items: readonly HTMLElement[]): number {
  const top = items[0]?.offsetTop;
  if (top === undefined) return 1;
  const columns = items.findIndex((item) => item.offsetTop !== top);
  return columns === -1 ? items.length : Math.max(1, columns);
}
