import { valueNoise } from './noise';
import { smoothstep } from './paths';

/**
 * Molten rock, calm and smooth: darker where it cools against the shore, warming towards its
 * middle, with broad, slow swirls of heat. No crust plates or small-scale grain, so it reads as one
 * surface at any size. Colours per point, shared by every look that draws lava.
 */

export type Molten = 'lava' | 'acid';

type Rgb = [number, number, number];

/** From the shore to the middle. */
const STOPS: Record<Molten, readonly Rgb[]> = {
  lava: [[112, 36, 20], [170, 58, 26], [214, 96, 40], [240, 150, 70]],
  acid: [[52, 74, 26], [86, 122, 34], [128, 176, 52], [176, 214, 96]],
};

/** The colour of molten rock `d` cells in from its shore at (x, y), into `out` at `o`. */
export function moltenAt(kind: Molten, x: number, y: number, d: number, out: Uint8ClampedArray, o: number): void {
  if (d <= 0) return;
  const stops = STOPS[kind];
  const swirl = valueNoise(x * 0.7 + valueNoise(x * 0.35, y * 0.35, 46) * 1.5, y * 0.7, 44) - 0.5;
  const t = Math.min(1, Math.max(0, smoothstep(0.02, 1.1, d) * 0.9 + swirl * 0.3)) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  for (let ch = 0; ch < 3; ch++) out[o + ch] = stops[i]![ch]! + (stops[i + 1]![ch]! - stops[i]![ch]!) * f;
  out[o + 3] = 255 * smoothstep(0, 0.01, d);
}

/** The glow a pool of `kind` throws onto the floor round it. */
export const GLOW: Record<Molten, Rgb> = { lava: [255, 110, 35], acid: [140, 230, 60] };
