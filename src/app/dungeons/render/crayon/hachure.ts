import type { Bounds, Canvas2D } from '../geometry';
import type { Field, PathFn } from '../art/paths';
import type { AreaMask } from './areaMask';
import { rngFrom, type Rng } from '../../rng';

/**
 * Wax crayon laid on by hand, as the Reprieve map of the Lockwood Manor collection is coloured (and
 * the Dolmenwood world map before it): an area is never filled, it is hatched in three passes of
 * short, bowed strokes that lift and set down again, each area at its own angle. What the eye takes
 * for texture is the paper left between the strokes. Sizes are in the hand's unit (`crayonUnit`).
 */

/** One stroke weight of a pass: strokes are dealt out over a pass's weights at random. */
interface Lane {
  width: number;
  opacity: number;
}

interface Pass {
  /** Between two lines of strokes. */
  gap: number;
  /** The share of strokes left out. */
  skip: number;
  minLen: number;
  maxLen: number;
  /** How far a stroke bows off its line, either way. */
  bow: number;
  /** The most the crayon lifts between two strokes. */
  lift: number;
  /** The pass's angle against the area's. */
  turn: number;
  lanes: readonly Lane[];
}

/** The fill, a second pass in almost the same direction, and a light pass across: Reprieve's three, in its units. */
const PASSES: readonly Pass[] = [
  {
    gap: 1.2, skip: 0.06, minLen: 16, maxLen: 44, bow: 0.55, lift: 2.8, turn: 0,
    lanes: [{ width: 1.9, opacity: 0.56 }, { width: 1.6, opacity: 0.48 }, { width: 1.25, opacity: 0.4 }],
  },
  {
    gap: 2.2, skip: 0.25, minLen: 12, maxLen: 34, bow: 0.7, lift: 3.4, turn: 0.1,
    lanes: [{ width: 1.6, opacity: 0.4 }, { width: 1.25, opacity: 0.32 }],
  },
  {
    gap: 4.5, skip: 0.3, minLen: 12, maxLen: 30, bow: 0.7, lift: 3.4, turn: Math.PI / 2.3,
    lanes: [{ width: 1.4, opacity: 0.23 }, { width: 1.1, opacity: 0.19 }],
  },
];

/**
 * How much harder than Reprieve the hand presses: a map is lit by the scene's lights, whose warm
 * colour and tonemap take a light tint back to the paper's colour (Reprieve is only ever seen unlit).
 */
const PRESSURE = 1.35;

/** Steps a stroke's strength is rounded to, so an area that darkens is still a few strokes calls. */
const LEVELS = 4;
/** The most weights a pass has. */
const MOST_LANES = Math.max(...PASSES.map(pass => pass.lanes.length));

/**
 * The hand's unit in cells: Reprieve's 3 px, its strokes about 6 px wide, so they stay strokes on a
 * scene's map (150 px a cell, lossy WebP, a Retina screen showing it twice its size; strokes half
 * that wide were a smear there). On a smaller picture no coarser than a fiftieth of a cell, and never
 * under a pixel.
 */
export function crayonUnit(pxPerCell: number): number {
  return Math.max(1.1 / pxPerCell, Math.min(3 / pxPerCell, 0.022));
}

export interface CrayonArea {
  path: PathFn;
  bounds: Bounds;
  /** A colour, or a pattern of it that carries the paper's tooth (`crayonPaint`). */
  paint: string | CanvasPattern;
  /** How much colour the hand leaves, 0..1. */
  cover: number;
  /** 1 washes an area, 3 colours it in. */
  passes: number;
  seed: number;
  /** Where the colour is heavier or lighter (0..1, read at each stroke's middle); even where unset. */
  strength?: Field;
  /** Where the area lies: strokes are laid only along the runs of a line inside it. */
  inside?: AreaMask;
  /** The strokes' direction in radians (along a floor's boards); unset, the area's own from its seed. */
  angle?: number;
}

/** Colours `area` in by hand, multiplied onto what lies under it, so it can lie over the drawing as well as under it. */
export function crayonArea(ctx: Canvas2D, area: CrayonArea, unit: number): void {
  const rng = rngFrom(area.seed);
  const own = (-38 + (rng() - 0.5) * 34) * (Math.PI / 180);
  const angle = area.angle ?? own;
  const lanes = new Map<number, { lane: Lane; level: number; path: Path2D }>();
  const laneOf = (lane: Lane, index: number, level: number): Path2D => {
    const key = index * (LEVELS + 1) + level;
    let entry = lanes.get(key);
    if (!entry) {
      entry = { lane, level, path: new Path2D() };
      lanes.set(key, entry);
    }
    return entry.path;
  };
  PASSES.slice(0, area.passes).forEach((pass, p) => hatchPass(area, angle + pass.turn, pass, unit, rng, (lane, x, y) => {
    const strength = area.strength ? Math.max(0, Math.min(1, area.strength(x, y))) : 1;
    const level = Math.round(strength * LEVELS);
    return level === 0 ? null : laneOf(pass.lanes[lane]!, p * MOST_LANES + lane, level);
  }));
  ctx.save();
  ctx.beginPath();
  area.path(ctx);
  ctx.clip();
  ctx.globalCompositeOperation = 'multiply';
  ctx.strokeStyle = area.paint;
  ctx.lineCap = 'round';
  for (const { lane, level, path } of lanes.values()) {
    ctx.lineWidth = lane.width * unit;
    ctx.globalAlpha = Math.min(1, lane.opacity * PRESSURE * area.cover * (level / LEVELS));
    ctx.stroke(path);
  }
  ctx.restore();
}

/** The path a stroke of weight `lane` whose middle lies at (x, y) goes into; none where it is not drawn. */
type LaneFor = (lane: number, x: number, y: number) => Path2D | null;

/**
 * One pass: lines across the area's box at `angle`, laid with short bowed strokes along each run of
 * a line that lies in the area, from a little before it to a little past it, as a hand starts and
 * stops at an edge it does not quite meet; the clip makes the edge.
 */
function hatchPass(area: CrayonArea, angle: number, pass: Pass, unit: number, rng: Rng, laneFor: LaneFor): void {
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const { minX, minY, maxX, maxY } = area.bounds;
  const corners = [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]] as const;
  const us = corners.map(([x, y]) => x * ca + y * sa);
  const vs = corners.map(([x, y]) => -x * sa + y * ca);
  const u0 = Math.min(...us);
  const u1 = Math.max(...us);
  const v1 = Math.max(...vs);
  const gap = pass.gap * unit;
  const overshoot = 1.2 * unit;
  // Points along and across the lines, turned into the map; plain numbers, as this runs for every stroke.
  const xOf = (u: number, v: number): number => u * ca - v * sa;
  const yOf = (u: number, v: number): number => u * sa + v * ca;
  const lay = (from: number, to: number, v: number): void => {
    for (let u = from; u < to;) {
      const len = Math.min((pass.minLen + rng() * (pass.maxLen - pass.minLen)) * unit, to - u);
      if (len < 0.8 * unit) break;
      if (rng() > pass.skip) {
        const va = v + (rng() - 0.5) * 0.9 * unit;
        const vb = v + (rng() - 0.5) * 0.9 * unit;
        const vm = v + (rng() - 0.5) * 2 * pass.bow * unit;
        const um = u + len / 2;
        const path = laneFor(Math.floor(rng() * pass.lanes.length), xOf(um, vm), yOf(um, vm));
        if (path) {
          path.moveTo(xOf(u, va), yOf(u, va));
          path.quadraticCurveTo(xOf(um, vm), yOf(um, vm), xOf(u + len, vb), yOf(u + len, vb));
        }
      }
      u += len + rng() * pass.lift * unit;
    }
  };
  const inside = area.inside;
  for (let v = Math.min(...vs) + gap * rng(); v < v1; v += gap) {
    if (!inside) {
      lay(u0 - overshoot * rng(), u1 + overshoot * rng(), v);
      continue;
    }
    let start: number | null = null;
    for (let u = u0; u <= u1 + inside.step; u += inside.step) {
      const on = u <= u1 && inside.at(xOf(u, v), yOf(u, v));
      if (on && start === null) start = u;
      else if (!on && start !== null) {
        // A run starts at its first sample inside, up to a step past the edge.
        lay(start - inside.step - overshoot * rng(), u + overshoot * rng(), v);
        start = null;
      }
    }
  }
}
