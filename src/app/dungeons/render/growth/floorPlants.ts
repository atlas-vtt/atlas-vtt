import type { Rng } from '../../rng';
import { valueNoise } from '../art/noise';
import type { Vec } from '../geometry';
import { addLeaf, addStem, cover, type PlantForm } from './forms';

/**
 * Single plants on the floor, each from a stream of its own: a tuft of grass blades, a fern's
 * crown of fronds, a cluster of fungus caps, a gnarled root, a bramble's arching canes. Angles
 * round a crown follow the golden angle with a jitter, so fronds and blades never fan regularly.
 */

const GOLDEN = Math.PI * (3 - Math.sqrt(5));

/** A tuft of blades from one point, arching outwards and leaning a little one way. */
export function grassTuft(form: PlantForm, rng: Rng, at: Vec, size: number): void {
  const blades = 12 + Math.floor(rng() * 16);
  const lean = rng() * Math.PI * 2;
  const leanBy = rng() * 0.6;
  let a = rng() * Math.PI * 2;
  for (let k = 0; k < blades; k++) {
    a += GOLDEN + (rng() - 0.5) * 0.7;
    // Blades lean towards one side: those that point that way are longer.
    const along = Math.cos(a - lean);
    const length = size * (0.35 + 0.65 * rng() ** 0.7) * (1 + leanBy * along * 0.6);
    addLeaf(form, {
      x: at.x + (rng() - 0.5) * size * 0.12,
      y: at.y + (rng() - 0.5) * size * 0.12,
      angle: a + leanBy * Math.sin(lean - a) * 0.4,
      length,
      breadth: 0.7 + rng() * 0.6,
      shape: 'blade',
      lobes: 0,
      serration: 0,
      curl: (rng() < 0.5 ? -1 : 1) * (0.6 + rng() * 1.6),
      layer: 1 - length / size + rng() * 0.3,
      tone: (rng() - 0.5) * 2,
    });
  }
}

/** A clump of tufts round a point, of several sizes, the largest in its middle. */
export function grassClump(form: PlantForm, rng: Rng, at: Vec, size: number): void {
  const tufts = 1 + Math.floor(rng() * 5);
  for (let k = 0; k < tufts; k++) {
    const r = size * 0.6 * Math.sqrt(k / tufts);
    const a = rng() * Math.PI * 2;
    grassTuft(form, rng, { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, size * (1 - 0.45 * (k / tufts)) * (0.8 + rng() * 0.4));
  }
}

/** A fern: fronds from a crown, each a curving rib with pinnae that shrink towards its tip. */
export function fern(form: PlantForm, rng: Rng, at: Vec, size: number): void {
  const fronds = 5 + Math.floor(rng() * 5);
  let a = rng() * Math.PI * 2;
  for (let f = 0; f < fronds; f++) {
    a += GOLDEN + (rng() - 0.5) * 0.5;
    const length = size * (0.65 + 0.35 * rng());
    const bend = (rng() - 0.5) * 1.1;
    const layer = 0.25 + 0.75 * rng();
    const rib: Vec[] = [];
    const steps = 14;
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const dir = a + bend * t * t;
      const r = length * t;
      rib.push({ x: at.x + Math.cos(a) * r * 0.25 + Math.cos(dir) * r * 0.75, y: at.y + Math.sin(a) * r * 0.25 + Math.sin(dir) * r * 0.75 });
    }
    addStem(form, { points: rib, from: size * 0.022, to: size * 0.006, layer, tone: 0 });
    const pairs = 9 + Math.floor(rng() * 5);
    for (let k = 1; k <= pairs; k++) {
      const t = 0.12 + (0.86 * k) / pairs;
      const i = Math.min(steps - 1, Math.floor(t * steps));
      const p = rib[i]!;
      const q = rib[i + 1]!;
      const dir = Math.atan2(q.y - p.y, q.x - p.x);
      const pinna = length * 0.26 * Math.sin(Math.PI * Math.min(1, t * 1.05)) ** 0.7 * (0.85 + 0.3 * rng());
      for (const side of [-1, 1]) {
        addLeaf(form, {
          x: p.x,
          y: p.y,
          angle: dir + side * (1.05 + rng() * 0.25) - side * t * 0.35,
          length: pinna,
          breadth: 0.85 + rng() * 0.3,
          shape: 'pinna',
          lobes: rng(),
          serration: 0.3 + rng() * 0.5,
          curl: side * (0.4 + rng() * 0.6),
          layer: layer + t * 0.02,
          tone: (rng() - 0.5) * 2,
        });
      }
    }
  }
}

/** Fungus caps in a cluster: a few large ones, many small round them, crowding towards one side. */
export function fungi(form: PlantForm, rng: Rng, at: Vec, size: number): void {
  const caps = 2 + Math.floor(rng() * 6);
  const drift = rng() * Math.PI * 2;
  for (let k = 0; k < caps; k++) {
    const r = size * Math.sqrt(k / caps) * 0.75;
    const a = k * GOLDEN + drift;
    const radius = size * (0.36 - 0.24 * (k / caps) ** 0.7) * (0.65 + rng() * 0.7);
    const c = { x: at.x + Math.cos(a) * r + Math.cos(drift) * r * 0.3, y: at.y + Math.sin(a) * r + Math.sin(drift) * r * 0.3 };
    form.caps.push({ x: c.x, y: c.y, radius, stretch: 1 + rng() * 0.25, angle: rng() * Math.PI, tone: (rng() - 0.5) * 2, layer: 1 - k / caps });
    cover(form, c, radius);
  }
}

export interface RootOptions {
  /** Whether it dives under the floor and breaks out again along its way. */
  dives?: boolean;
  depth?: number;
}

/**
 * A root from `at` towards `heading`: its way bends in long smooth curves (noise along its
 * length, not a jitter per step), it swells and thins, forks at shallow angles as it thins, and
 * where it dives it leaves the floor broken at either end.
 */
export function root(form: PlantForm, rng: Rng, at: Vec, heading: number, length: number, width: number, options: RootOptions = {}): void {
  const depth = options.depth ?? 0;
  const seed = Math.floor(rng() * 1e6);
  const freq = 1.1 + rng() * 1.3;
  const step = 0.028;
  let p = at;
  let walked = 0;
  let points: Vec[] = [at];
  let widths: number[] = [width];
  let above = true;
  // Where it dives or breaks out, it narrows into the floor.
  const sink = (list: number[], fromEnd: boolean): void => {
    for (let k = 0; k < Math.min(4, list.length); k++) {
      const i = fromEnd ? list.length - 1 - k : k;
      list[i] = list[i]! * (0.45 + 0.14 * k);
    }
  };
  const flush = (): void => {
    if (points.length > 1) addStem(form, { points, from: width, to: width * 0.1, widths, layer: depth === 0 ? 0.5 : 0.42, tone: (rng() - 0.5) * 2 });
    points = [];
    widths = [];
  };
  const hole = (q: Vec, a: number, w: number): void => {
    form.holes.push({ x: q.x, y: q.y, radius: w * 0.85 + 0.008, angle: a });
  };
  // A root that dives breaks out of the floor where it begins, too.
  if (options.dives && depth === 0) hole(at, heading, width);
  while (walked < length) {
    const t = walked / length;
    const a = heading + (valueNoise(walked * freq, 0.5, seed) - 0.5) * 2.4;
    p = { x: p.x + Math.cos(a) * step, y: p.y + Math.sin(a) * step };
    walked += step;
    const w = width * (1 - 0.88 * t ** 0.8) * (0.82 + 0.36 * valueNoise(walked * 5, 2.5, seed));
    const show = !options.dives || t < 0.15 || valueNoise(walked * 1.7, 4.5, seed) > 0.3;
    if (show !== above) {
      hole(p, a, w);
      if (!show) {
        sink(widths, true);
        flush();
      }
      above = show;
    }
    if (show) {
      points.push(p);
      widths.push(w);
      if (points.length === 4 && (walked > step * 4 || (options.dives && depth === 0))) sink(widths, false);
    }
    if (depth < 2 && t > 0.2 && t < 0.85 && rng() < 0.035) {
      root(form, rng, p, a + (rng() < 0.5 ? -1 : 1) * (0.35 + rng() * 0.4), (length - walked) * (0.45 + rng() * 0.4), w * 0.62, { ...options, depth: depth + 1 });
    }
  }
  flush();
}

/** A bramble: arching canes from one crown, thorny, with leaves in threes. */
export function bramble(form: PlantForm, rng: Rng, at: Vec, size: number): void {
  const canes = 3 + Math.floor(rng() * 3);
  let heading = rng() * Math.PI * 2;
  for (let k = 0; k < canes; k++) {
    heading += GOLDEN + (rng() - 0.5) * 0.8;
    cane(form, rng, at, heading, size * (0.6 + 0.4 * rng()));
  }
}

/** A bramble's arching cane with its leaves in threes. */
function cane(form: PlantForm, rng: Rng, at: Vec, heading: number, length: number): void {
  const points: Vec[] = [at];
  let a = heading;
  let p = at;
  const bend = (rng() - 0.5) * 2.2;
  const steps = Math.max(4, Math.round(length / 0.03));
  for (let k = 1; k <= steps; k++) {
    a = heading + bend * (k / steps) ** 1.4 + (rng() - 0.5) * 0.15;
    p = { x: p.x + Math.cos(a) * (length / steps), y: p.y + Math.sin(a) * (length / steps) };
    points.push(p);
    if (k % 2 !== 0 || k === steps) continue;
    const side = k % 4 === 0 ? 1 : -1;
    const base = a + side * (0.8 + rng() * 0.5);
    // A leaf of three: one ahead, two to its sides.
    for (const [turn, scale] of [[0, 1], [-0.8, 0.76], [0.8, 0.76]] as const) {
      addLeaf(form, { x: p.x, y: p.y, angle: base + turn + (rng() - 0.5) * 0.3, length: 0.085 * scale * (0.8 + rng() * 0.4) * (1 - 0.35 * (k / steps)), breadth: 0.95 + rng() * 0.2, shape: 'ovate', lobes: rng(), serration: 0.6 + rng() * 0.4, curl: (rng() - 0.5), layer: 0.3 + 0.7 * (k / steps) * rng(), tone: (rng() - 0.5) * 2 });
    }
  }
  addStem(form, { points, from: 0.014, to: 0.006, layer: 0.3, tone: (rng() - 0.5) * 2, thorns: true });
}
