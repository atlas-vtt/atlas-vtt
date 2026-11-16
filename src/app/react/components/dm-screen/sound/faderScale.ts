import { CHANNEL_DB_RANGE } from '../../../../services/soundSettings';

/**
 * Where a level lies on a fader, from its foot (0) to its top (1), as a mixing desk's scale: the top third of the travel
 * holds 0 to −12 dB, where small trims are made, and the long tail to silence is compressed below. The levels are the
 * same dB as ever; only the distance between them changes. A meter in the fader reads on the same scale.
 */
const KNOTS: readonly (readonly [db: number, position: number])[] = [
  [CHANNEL_DB_RANGE.min, 0],
  [-40, 0.15],
  [-24, 0.33],
  [-12, 0.53],
  [0, 0.86],
  [CHANNEL_DB_RANGE.max, 1],
];

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

/** Maps `value` through the knots from one column to the other: piecewise straight between neighbours. */
function through(value: number, from: 0 | 1): number {
  const to = from === 0 ? 1 : 0;
  let low = KNOTS[0];
  for (const knot of KNOTS) {
    if (low && value <= knot[from]) {
      const span = knot[from] - low[from];
      return span === 0 ? knot[to] : low[to] + ((value - low[from]) / span) * (knot[to] - low[to]);
    }
    low = knot;
  }
  return low ? low[to] : 0;
}

export function faderPosition(db: number): number {
  return through(clamp(db, CHANNEL_DB_RANGE.min, CHANNEL_DB_RANGE.max), 0);
}

export function faderDb(position: number): number {
  return through(clamp(position, 0, 1), 1);
}
