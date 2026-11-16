import type { DungeonTerrain } from '../../model';
import { chaikin, resample } from '../../water/smooth';
import type { ArtScene } from '../art/artScene';
import { valueNoise } from '../art/noise';
import { PolyField } from '../cave/polyField';
import { depthField } from '../art/pools';
import { polysPath, smoothstep, type Field, type PathFn } from '../art/paths';
import { pointsBounds, type Bounds, type Vec } from '../geometry';
import { cellRings } from './cellRings';
import { chiselled } from './stones';

/**
 * The ground a scatter of loose stones lies on: the tint under them, where it ends, and the box
 * both lie in. A built floor's lies over whole cells, so a cell reads plainly as one thing; a
 * cave's rock fell where it fell, so its field is one ragged patch, its outline traced through the
 * cells and rounded as the cave's own walls are, its tint fading out towards that outline.
 */
export interface ScatterGround {
  clip: PathFn;
  field: Field;
  bounds: Bounds;
  /** Whether a stone at the point lies on the ground; unset where every stone of the cells does. */
  holds?: (x: number, y: number) => boolean;
}

/** The faint, uneven tone of loose rock: darker in places, never more than a shade. */
function rubbleTone(piece: DungeonTerrain): Field {
  return (x, y) => 0.06 + 0.08 * valueNoise(x * 3, y * 3, piece.id);
}

/** Whole cells, their edges chipped a little: the field as a built floor draws it. */
export function cellGround(piece: DungeonTerrain): ScatterGround {
  const rings = cellRings(piece.cells).map((r) => chiselled(r, piece.id * 7 + 3, 0.06));
  return { clip: polysPath(rings), field: rubbleTone(piece), bounds: pointsBounds(rings.flat()) };
}

/** Corners per cell along a ring before it is rounded, as the cave's outline is walked. */
const STEPS_PER_CELL = 4;
/** Holes in the field this small (a heap standing in it) are tinted through; the heap is drawn over them. */
const SMALLEST_HOLE = 4;
/** How far in from its outline the tint takes its full strength, in cells. */
const FADE = 0.55;

/**
 * How a ring of cell edges is roughened: how softly its corners are averaged with their
 * neighbours (`sigma`, in corners a quarter cell apart; a staircase of cells becomes a slope, a
 * corner a curve), then how far it is pushed out (positive) or in, in cells: a slow swell (of
 * `waves` per cell) and a small ragged step on it, and an offset on the whole.
 */
export interface RaggedShape {
  sigma: number;
  waves: number;
  swell: number;
  rag: number;
  outwards: number;
}

/** A rubble patch: a little outwards on the whole, so it covers its cells. */
const RUBBLE: RaggedShape = { sigma: 2.2, waves: 0.9, swell: 0.24, rag: 0.07, outwards: 0.06 };

const WEIGHTS = new Map<number, { weights: number[]; sum: number }>();

/** The averaging weights of a softness, reaching about two and a third of it either way. */
function weightsOf(sigma: number): { weights: number[]; sum: number } {
  let found = WEIGHTS.get(sigma);
  if (!found) {
    const reach = Math.round(sigma * 2.3);
    const weights = Array.from({ length: 2 * reach + 1 }, (_, k) => Math.exp(-((k - reach) ** 2) / (2 * sigma * sigma)));
    found = { weights, sum: weights.reduce((a, b) => a + b, 0) };
    WEIGHTS.set(sigma, found);
  }
  return found;
}

/** Twice the area a ring encloses: positive for an outer ring of `cellRings` (clockwise on screen), negative for a hole. */
function doubleArea(ring: readonly Vec[]): number {
  return ring.reduce((sum, p, i) => {
    const q = ring[(i + 1) % ring.length]!;
    return sum + p.x * q.y - q.x * p.y;
  }, 0);
}

/** A ring of cell edges walked every quarter cell, averaged along itself and pushed along its normal by a noise of its own. */
export function raggedRing(ring: readonly Vec[], seed: number, shape: RaggedShape = RUBBLE): Vec[] {
  const base = resample(ring, 1 / STEPS_PER_CELL);
  const n = base.length;
  const { weights, sum } = weightsOf(shape.sigma);
  const reach = (weights.length - 1) / 2;
  const smooth = base.map((_, i) => {
    let x = 0;
    let y = 0;
    for (let k = -reach; k <= reach; k++) {
      const p = base[(((i + k) % n) + n) % n]!;
      const w = weights[k + reach]!;
      x += w * p.x;
      y += w * p.y;
    }
    return { x: x / sum, y: y / sum };
  });
  const moved = smooth.map((s, i) => {
    const before = smooth[(i - 1 + n) % n]!;
    const after = smooth[(i + 1) % n]!;
    const dx = after.x - before.x;
    const dy = after.y - before.y;
    const length = Math.hypot(dx, dy) || 1;
    // The cells lie on the right of the way round, so out of the patch is on the left: (dy, −dx).
    const swell = (valueNoise(s.x * shape.waves, s.y * shape.waves, seed) - 0.5) * 2 * shape.swell;
    const rag = (valueNoise(s.x * 4.5, s.y * 4.5, seed + 1) - 0.5) * 2 * shape.rag;
    const d = shape.outwards + swell + rag;
    return { x: s.x + (dy / length) * d, y: s.y - (dx / length) * d };
  });
  return chaikin(moved, 1);
}

/** The field as one ragged patch on a cave's floor, its tint fading towards its outline and its stones within it. */
export function raggedGround(scene: ArtScene, piece: DungeonTerrain): ScatterGround {
  const seed = scene.env.dungeon.model.seed + piece.id * 13 + 401;
  const rings = cellRings(piece.cells)
    .filter((ring) => doubleArea(ring) > 0 || doubleArea(ring) <= -2 * SMALLEST_HOLE)
    .map((ring) => raggedRing(ring, seed));
  const clip = polysPath(rings);
  const points = rings.flat();
  const depth = depthField(scene, clip, points);
  const tone = rubbleTone(piece);
  const inside = new PolyField(rings);
  return { clip, field: (x, y) => tone(x, y) * smoothstep(0, FADE, depth(x, y)), bounds: pointsBounds(points), holds: (x, y) => inside.inside(x, y) };
}
