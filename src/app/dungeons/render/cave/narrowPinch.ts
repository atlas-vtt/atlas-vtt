/**
 * A narrow way is drawn narrower than its cell, the rock closing in on both sides along its whole
 * length: the passage itself is the mark, hatched as any rock, so no sign need stand across open
 * floor. The outline is smoothed first and then moved in along its own normal, so a passage that
 * winds keeps its width round each bend rather than having its inner bends cut by the smoothing;
 * how far it moves fades in over a fraction of a cell inside the way's mouths, never past its own
 * cells, and the rock's relief fades out over a cell, since the way's width is its sign.
 */

import type { NarrowShare } from './outlineGuard';
import type { Vec } from '../geometry';

/** How much more of a narrow cell the drawing leaves than the guard asks (`NARROW_SHARE`), so a bend's rounding rarely sends it back. */
const PINCH_MARGIN = 0.03;
/** How far into the floor a corner's cell is looked for, from the corner against its normal, in cells. */
const INTO_FLOOR = 0.3;
/** How the depth fades in at a mouth: a Gaussian of this many corners (a quarter cell each), this far either way. */
const TAPER_SIGMA = 1.5;
const TAPER_REACH = 4;
/** How the relief fades out: over about a cell, as the outline's own smoothing reaches. */
const RELIEF_SIGMA = 3.4;
const RELIEF_REACH = 8;

/** How far each walked corner moves into the floor, and how much of the rock's relief it keeps (1 all, 0 none). */
export interface Pinches {
  depth: number[];
  relief: number[];
}

function gaussian(sigma: number, reach: number): number[] {
  return Array.from({ length: 2 * reach + 1 }, (_, k) => Math.exp(-((k - reach) ** 2) / (2 * sigma * sigma)));
}

const TAPER = gaussian(TAPER_SIGMA, TAPER_REACH);
const RELIEF = gaussian(RELIEF_SIGMA, RELIEF_REACH);

/** The values averaged along the loop by `weights`. */
function along(values: readonly number[], weights: readonly number[]): number[] {
  const n = values.length;
  const reach = (weights.length - 1) / 2;
  const total = weights.reduce((a, b) => a + b, 0);
  return values.map((_, i) => {
    let sum = 0;
    for (let k = -reach; k <= reach; k++) sum += weights[k + reach]! * values[(i + k + n) % n]!;
    return sum / total;
  });
}

/** The pinch of every walked corner, its `normal` (on the cell edges) pointing into the rock. */
export function pinches(base: readonly Vec[], normal: readonly Vec[], narrow: NarrowShare | undefined): Pinches {
  const raw = base.map(() => 0);
  if (!narrow) return { depth: raw, relief: base.map(() => 1) };
  const on = base.map((b, i) => {
    const n = normal[i]!;
    const share = narrow(Math.floor(b.x - n.x * INTO_FLOOR), Math.floor(b.y - n.y * INTO_FLOOR));
    if (share === undefined) return 0;
    raw[i] = (1 - Math.min(1, share + PINCH_MARGIN)) / 2;
    return 1;
  });
  if (!on.some((x) => x > 0)) return { depth: raw, relief: base.map(() => 1) };
  const faded = along(on, RELIEF);
  // Never deeper than the corner's own way: a crawl beside a letterbox's door keeps its own width.
  const tapered = along(raw, TAPER).map((d, i) => Math.min(d, raw[i]!));
  return { depth: tapered, relief: faded.map((w, i) => 1 - Math.max(w, on[i]!)) };
}
