/**
 * Arrow keys across the choices of a picker laid out in `columns` columns (a
 * list is one): where focus goes from `index`, or null for a key that moves
 * nothing. Focus stops at the ends rather than wrapping, as in a native list.
 */
export function gridStep(key: string, index: number, count: number, columns = 1): number | null {
  const last = count - 1;
  let next: number;
  switch (key) {
    case 'ArrowRight': next = columns === 1 ? index : index + 1; break;
    case 'ArrowLeft': next = columns === 1 ? index : index - 1; break;
    // Up and down keep to the column: past the first or last row focus stays.
    case 'ArrowDown': next = index + columns > last ? index : index + columns; break;
    case 'ArrowUp': next = index - columns < 0 ? index : index - columns; break;
    case 'Home': next = 0; break;
    case 'End': next = last; break;
    default: return null;
  }
  return Math.max(0, Math.min(last, next));
}
