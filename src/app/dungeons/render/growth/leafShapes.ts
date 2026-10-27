import type { Vec } from '../geometry';

/**
 * Leaves as drawn from above, each as its two halves either side of the midrib, so a hand can
 * light one half and shade the other as a real leaf folded along its rib is. Shapes are in the
 * leaf's own frame (the rib from the stalk at (0, 0) to the tip at (1, 0), the left half at y < 0)
 * and scaled by the leaf's length; `lobes` and `serration` vary each leaf a little, so no two match.
 */

export type LeafShape = 'ivy' | 'heart' | 'ovate' | 'pinna' | 'blade' | 'withered';

export interface LeafHalves {
  /** From the stalk round to the tip, on the left of the rib. */
  left: Vec[];
  /** From the stalk round to the tip, on the right. */
  right: Vec[];
}

/** Points per half: enough for a smooth edge at the largest a leaf is drawn. */
const POINTS = 16;

/** Ivy's palmate leaf: a long terminal lobe, two side lobes, two short basal ones round a heart-shaped notch. */
function ivyRadius(phi: number, lobes: number): number {
  const lobe = (at: number, size: number, width: number): number => size * Math.max(0, 1 - Math.abs(phi - at) / width) ** 1.5;
  const side = 0.55 + 0.25 * lobes;
  return 0.26 + lobe(0, 0.74, 0.95) + lobe(0.95, side * 0.62, 0.62) + lobe(1.9, side * 0.38, 0.55);
}

/** A broad leaf with two rounded lobes at its base: a vine's. */
function heartRadius(phi: number, lobes: number): number {
  const tip = Math.max(0, 1 - phi / 1.5) ** 1.2;
  const base = 0.55 + 0.18 * lobes;
  return 0.18 + 0.82 * tip + base * Math.exp(-(((phi - 1.85) / 0.55) ** 2)) * 0.62;
}

/** Half-width along the rib (t from 0 at the stalk to 1 at the tip) of the leaves that are longer than broad. */
function width(shape: LeafShape, t: number, lobes: number, serration: number): number {
  const teeth = serration > 0 ? 1 - serration * 0.18 * Math.abs(Math.sin(t * Math.PI * (7 + lobes * 4))) : 1;
  switch (shape) {
    case 'pinna':
      return 0.2 * Math.sin(Math.PI * t ** 0.75) ** 0.8 * teeth;
    case 'blade':
      return 0.085 * (1 - t) ** 0.7 * Math.min(1, t * 6);
    case 'withered':
      return 0.22 * Math.sin(Math.PI * t ** 0.8) ** 1.4 * (0.75 + 0.25 * Math.sin(t * 9 + lobes * 5)) * teeth;
    default:
      return (0.34 + 0.06 * lobes) * Math.sin(Math.PI * t ** 0.7) ** 0.85 * teeth;
  }
}

/** The leaf's halves. `lobes` and `serration` are 0..1; `curl` bends the rib sideways (-1..1). */
export function leafHalves(shape: LeafShape, lobes: number, serration: number, curl = 0): LeafHalves {
  if (shape === 'ivy' || shape === 'heart') {
    const radius = shape === 'ivy' ? ivyRadius : heartRadius;
    const reach = shape === 'ivy' ? 2.45 : 2.35;
    const scale = 1 / radius(0, lobes);
    const half = (sign: number): Vec[] =>
      Array.from({ length: POINTS * 2 + 1 }, (_, k) => {
        const phi = reach * (1 - k / (POINTS * 2));
        const r = radius(phi, lobes) * scale;
        return { x: Math.cos(phi) * r, y: sign * Math.sin(phi) * r * 0.92 };
      });
    return { left: half(-1), right: half(1) };
  }
  const bend = (t: number): number => curl * 0.18 * t * t;
  const half = (sign: number): Vec[] =>
    Array.from({ length: POINTS + 1 }, (_, k) => {
      const t = k / POINTS;
      return { x: t, y: bend(t) + sign * width(shape, t, lobes, serration) };
    });
  return { left: half(-1), right: half(1) };
}

/** The rib of a leaf, in its frame: straight, or bent as `curl` bends it. */
export function ribOf(shape: LeafShape, curl = 0): Vec[] {
  if (shape === 'ivy' || shape === 'heart') return [{ x: 0, y: 0 }, { x: 0.96, y: 0 }];
  return Array.from({ length: 6 }, (_, k) => ({ x: (k / 5) * 0.96, y: curl * 0.18 * (k / 5) ** 2 }));
}

/** Where an ivy or vine leaf's side veins run from the stalk, by angle; none for the other shapes. */
export function veinAngles(shape: LeafShape): number[] {
  if (shape === 'ivy') return [0.95, -0.95, 1.85, -1.85];
  if (shape === 'heart') return [0.7, -0.7, 1.5, -1.5];
  return [];
}
