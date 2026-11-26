/** Places per row, for arrow key navigation; the stylesheet lays the grid out with the same count. */
const COLUMNS = 8;

/**
 * The icons `shown` in a place flyout as rows laid out on screen: each group's grid starts a row
 * of its own, and a group's last row may be short, so up and down cannot step by `COLUMNS`.
 */
function placeRows(shown: readonly HTMLButtonElement[]): HTMLButtonElement[][] {
  const rows: HTMLButtonElement[][] = [];
  for (const button of shown) {
    const last = rows[rows.length - 1];
    if (last && last.length < COLUMNS && last[0]?.parentElement === button.parentElement) last.push(button);
    else rows.push([button]);
  }
  return rows;
}

/** The icon an arrow key leads to from `button` among those `shown`: the neighbour in reading order, or the same column one row up or down. */
export function placeNeighbour(shown: readonly HTMLButtonElement[], button: HTMLButtonElement, key: string): HTMLButtonElement | undefined {
  if (key === 'ArrowLeft' || key === 'ArrowRight') return shown[shown.indexOf(button) + (key === 'ArrowLeft' ? -1 : 1)];
  const rows = placeRows(shown);
  const row = rows.findIndex((candidates) => candidates.includes(button));
  const current = rows[row];
  const next = rows[row + (key === 'ArrowUp' ? -1 : 1)];
  if (!current || !next) return undefined;
  return next[Math.min(current.indexOf(button), next.length - 1)];
}
