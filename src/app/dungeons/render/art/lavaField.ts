import { pointsBounds, type Vec } from '../geometry';
import { valueNoise } from './noise';
import { smoothstep, type Field } from './paths';

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

/** How far in from its shore molten rock is at its hottest, in cells, where it is wide enough to be. */
const FULL_CORE = 1.1;
/** How much of its heat a flow has lost where it leaves its room, against where it rises. */
const COOLING = 0.35;
/** The step at which a body's depth is sampled to find its deepest point, in cells. */
const SAMPLE = 0.125;

/**
 * How a body of molten rock is lit: `core`, how far in from its shore it is at its hottest (its
 * deepest point, so even a channel a cell wide has a bright core between its cooled banks), and
 * `cooled`, how much it has cooled at a point by how far down its flow (`flow`) the point lies.
 */
export interface MoltenHeat {
  core: number;
  cooled: Field;
}

export function moltenHeat(outlines: readonly Vec[][], depth: Field, flow?: Vec): MoltenHeat {
  const points = outlines.flat();
  if (!points.length) return { core: FULL_CORE, cooled: () => 0 };
  const b = pointsBounds(points);
  let deepest = 0;
  for (let y = b.minY; y <= b.maxY; y += SAMPLE) for (let x = b.minX; x <= b.maxX; x += SAMPLE) deepest = Math.max(deepest, depth(x, y));
  const core = Math.max(0.12, Math.min(FULL_CORE, deepest * 0.85));
  if (!flow) return { core, cooled: () => 0 };
  const along = points.map((p) => p.x * flow.x + p.y * flow.y);
  const from = Math.min(...along);
  const span = Math.max(1e-6, Math.max(...along) - from);
  return { core, cooled: (x, y) => COOLING * Math.min(1, Math.max(0, (x * flow.x + y * flow.y - from) / span)) };
}

/** The colour of molten rock `d` cells in from its shore at (x, y), into `out` at `o`: its core full `heat.core` in, `heat.cooled` the heat it has lost there. */
export function moltenAt(kind: Molten, x: number, y: number, d: number, out: Uint8ClampedArray, o: number, heat?: MoltenHeat): void {
  if (d <= 0) return;
  const stops = STOPS[kind];
  const swirl = valueNoise(x * 0.7 + valueNoise(x * 0.35, y * 0.35, 46) * 1.5, y * 0.7, 44) - 0.5;
  const warmth = 1 - (heat?.cooled(x, y) ?? 0);
  const t = Math.min(1, Math.max(0, smoothstep(0.02, heat?.core ?? FULL_CORE, d) * 0.9 + swirl * 0.3)) * warmth * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(t));
  const f = t - i;
  for (let ch = 0; ch < 3; ch++) out[o + ch] = stops[i]![ch]! + (stops[i + 1]![ch]! - stops[i]![ch]!) * f;
  out[o + 3] = 255 * smoothstep(0, 0.01, d);
}

/** The glow a pool of `kind` throws onto the floor round it. */
export const GLOW: Record<Molten, Rgb> = { lava: [255, 110, 35], acid: [140, 230, 60] };
