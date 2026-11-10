/**
 * Where a cave's wall stands at each place, in cells: rock walls are rough at every scale. The
 * broad swells, a few cells long, bend the whole cave a little (a smooth warp, the same for both
 * walls of a thin fin or a narrow passage, so it sways rather than pinches); wobble about a cell
 * long, a fine grain and here and there a small spur or recess push the wall out or in. Read by
 * place (never by the way round), so the same cave always gets the same wall and a cell changed
 * moves only the wall near it. The wall leans a little out into the rock, so a floor cell keeps
 * most of its ground.
 */

import { fnv1a32 } from '../../../utils/hashing';
import { fractalNoise } from '../../water/noise';
import { type Rng, rngFrom } from '../../rng';

/** Where the wall at (x, y), whose rock lies towards (nx, ny), is drawn instead. */
export type Relief = (x: number, y: number, nx: number, ny: number) => { x: number; y: number };
type Offset = (x: number, y: number) => number;

/** How far the wall leans out into the rock on average. */
const LEAN = 0.08;
/** The broad warp: its period, and how far it moves the wall (the noise itself spans about ±0.7). */
const SWAY = { period: 3.6, amount: 0.4 };
/** Each finer scale: its period and how strongly it pushes the wall out or in. */
const SCALES: readonly { period: number; octaves: number; amount: number }[] = [
  { period: 2.6, octaves: 1, amount: 0.6 },
  { period: 1.3, octaves: 1, amount: 0.4 },
  { period: 0.55, octaves: 2, amount: 0.1 },
];
/**
 * A ripple of about two cells along both axes, its phase pushed about by slow noise: whichever way
 * a wall runs, one of its two waves runs along it, so no wall stays straight for long, however
 * quiet the noise is there.
 */
const RIPPLE = { period: 2.2, amount: 0.16, phase: 2.5, phasePeriod: 4 };
/** Spurs and recesses: one may stand in each square of this side, this often, this far out and this wide. */
const SPUR_SPACING = 1.4;
const SPUR_CHANCE = 0.3;
const SPUR_HEIGHT: readonly [number, number] = [0.12, 0.28];
const SPUR_RADIUS = 0.28;

const unit = (h: number, shift: number): number => ((h >>> shift) & 0xff) / 0xff;

interface Spur {
  x: number;
  y: number;
  height: number;
}

/** The spurs near a place: each square of the spur grid holds at most one, by a hash of the cave and the square (worked out once a square). */
function spurs(key: string): Offset {
  const squares = new Map<number, Spur | null>();
  const spurOf = (sx: number, sy: number): Spur | null => {
    const id = (sx + 32768) * 65536 + (sy + 32768);
    let spur = squares.get(id);
    if (spur === undefined) {
      const h = fnv1a32(`${key}:${sx}:${sy}`);
      spur =
        unit(h, 0) >= SPUR_CHANCE
          ? null
          : {
              x: (sx + unit(h, 8)) * SPUR_SPACING,
              y: (sy + unit(h, 16)) * SPUR_SPACING,
              height: (SPUR_HEIGHT[0] + (SPUR_HEIGHT[1] - SPUR_HEIGHT[0]) * unit(h, 24)) * (h & 1 ? 1 : -1),
            };
      squares.set(id, spur);
    }
    return spur;
  };
  return (x, y) => {
    const gx = Math.floor(x / SPUR_SPACING);
    const gy = Math.floor(y / SPUR_SPACING);
    let sum = 0;
    for (let sy = gy - 1; sy <= gy + 1; sy++) {
      for (let sx = gx - 1; sx <= gx + 1; sx++) {
        const spur = spurOf(sx, sy);
        if (spur) sum += spur.height * Math.exp(-((x - spur.x) ** 2 + (y - spur.y) ** 2) / SPUR_RADIUS ** 2);
      }
    }
    return sum;
  };
}

function rippleOf(rng: Rng): Offset {
  const phaseX = fractalNoise(rng, 1, 0.5, RIPPLE.phasePeriod);
  const phaseY = fractalNoise(rng, 1, 0.5, RIPPLE.phasePeriod);
  const k = (2 * Math.PI) / RIPPLE.period;
  return (x, y) => (RIPPLE.amount / 2) * (Math.sin(k * x + RIPPLE.phase * 2 * Math.PI * phaseX(x, y)) + Math.sin(k * y + RIPPLE.phase * 2 * Math.PI * phaseY(x, y)));
}

/** The relief of floor `floor` of the cave of `seed`. */
export function outlineRelief(seed: number, floor: number): Relief {
  const key = `relief:${seed}:${floor}`;
  const rng = rngFrom(fnv1a32(key));
  const layers = SCALES.map(({ period, octaves, amount }) => ({ noise: fractalNoise(rng, octaves, 0.5, period), amount }));
  const spur = spurs(key);
  const swayX = fractalNoise(rng, 1, 0.5, SWAY.period);
  const swayY = fractalNoise(rng, 1, 0.5, SWAY.period);
  const ripple = rippleOf(rng);
  return (x, y, nx, ny) => {
    const out = layers.reduce((sum, { noise, amount }) => sum + amount * noise(x, y), LEAN) + spur(x, y) + ripple(x, y);
    return { x: x + SWAY.amount * swayX(x, y) + nx * out, y: y + SWAY.amount * swayY(x, y) + ny * out };
  };
}
