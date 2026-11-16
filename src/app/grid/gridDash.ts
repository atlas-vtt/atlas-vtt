/**
 * How a cell edge is dashed, by its length alone, so every edge of a grid shows the same rhythm:
 * two dashes centred on the edge, one where two would be too short, none on an edge too short for
 * one. The grid shader draws from this, and so do the drawers that grid detection and the
 * shader's tests read the lattice from, so all of them dash alike.
 */
export interface DashPattern {
  /** Dashes per edge: 0, 1 or 2. */
  count: 0 | 1 | 2;
  /** Length of each dash. */
  dash: number;
  /** Gap between dashes, and from each edge end to its first dash. */
  gap: number;
}

const PREFERRED_GAP = 4;
const MIN_DASH = 1;
/** Dashes are shortened to leave a little more air than the preferred gap alone gives. */
const SHORTENING = 0.8;

function dashes(length: number, count: 1 | 2): DashPattern | null {
  const dash = ((length - (count + 1) * PREFERRED_GAP) / count) * SHORTENING;
  if (dash < MIN_DASH) return null;
  return { count, dash, gap: (length - count * dash) / (count + 1) };
}

/** The dashes of an edge `length` long. */
export function dashPattern(length: number): DashPattern {
  return dashes(length, 2) ?? dashes(length, 1) ?? { count: 0, dash: 0, gap: length };
}
