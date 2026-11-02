import { BASE_TEXEL, BOUNCE } from '../../../lighting/lightingConstants';
import type { Rect } from '../../../lighting/segments';
import { sameCone } from '../../../vision/visionCone';
import type { DrawnDarkness } from './DarknessMap';
import { drawnRect, union, type DrawnLight } from './LightMap';

/** What the steady light map drew, by light, in its order. */
export type SteadyDrawing = ReadonlyMap<string, DrawnLight | DrawnDarkness>;

/**
 * How much coarser than on an ordinary map the bounce is built on a world of `texel` world px
 * whose grid cell is `cell` px (unknown: the texel alone decides): its probes, emission texels and
 * intervals are as many per cell as on a map of `BOUNCE.cell` px cells, and never finer than the
 * picture's texel allows. Bounce is soft light: at 16 px probes a 282 px cell held 300 probes of
 * it, and a drag waited a third of a second for each build. 1 on ordinary maps, which keep it as it was.
 */
export function bounceScale(texel: number, cell?: number): number {
  const byCell = cell && Number.isFinite(cell) && cell > 0 ? cell / BOUNCE.cell : 0;
  return Math.max(1, texel / BASE_TEXEL, byCell);
}

/** Where cascade `i`'s intervals start at `scale` (`bounceScale`); each is four times longer than the last. */
export function intervalStart(i: number, scale = 1): number {
  return (BOUNCE.interval * scale * (4 ** i - 1)) / 3;
}

/**
 * How far from a change of the light map the bounce at `scale` can change: a probe of the top
 * cascade reads the floor up to its interval's end, and each cascade below reads the probes of the
 * one above up to √2 of their spacing away (`cascadeFragment`), plus the emission's bilinear read.
 */
export function bounceReach(scale = 1): number {
  return scale * (intervalStart(BOUNCE.cascades)
    + Array.from({ length: BOUNCE.cascades - 1 }, (_, i) => Math.SQRT2 * BOUNCE.probe * 2 ** (i + 1)).reduce((sum, d) => sum + d, 0)
    + 2 * BOUNCE.emitTexel);
}

/**
 * The world rect of the light map that differs between two steady drawings (each changed light's
 * rect before and now), or null where the whole map must be taken as changed: no drawing before,
 * a darkness in either (it erases over its area), or no light that differs.
 */
export function changedArea(before: SteadyDrawing | null, now: SteadyDrawing): Rect | null {
  if (!before) return null;
  let area: Rect | null = null;
  const add = (light: DrawnLight | DrawnDarkness | undefined): boolean => {
    if (!light) return true;
    if ('polygon' in light) return false;
    area = area ? union(area, drawnRect(light)) : drawnRect(light);
    return true;
  };
  for (const [key, light] of now) {
    const old = before.get(key);
    if (old && sameDrawing(old, light)) continue;
    if (!add(light) || !add(old)) return null;
  }
  for (const [key, old] of before) if (!now.has(key) && !add(old)) return null;
  return area;
}

function sameDrawing(a: DrawnLight | DrawnDarkness, b: DrawnLight | DrawnDarkness): boolean {
  if ('polygon' in a || 'polygon' in b) return false;
  return a.tile === b.tile && a.reflection === b.reflection && a.bright === b.bright && a.dim === b.dim && a.intensity === b.intensity
    && a.color.every((c, i) => c === b.color[i]) && sameCone(a.cone, b.cone) && a.edge === b.edge;
}
