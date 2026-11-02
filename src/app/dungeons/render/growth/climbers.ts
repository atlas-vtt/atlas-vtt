import type { Rng } from '../../rng';
import { valueNoise } from '../art/noise';
import { smoothstep } from '../art/paths';
import type { Vec } from '../geometry';
import { addLeaf, addStem, emptyForm, type PlantForm, type PlantPalette } from './forms';
import type { LeafShape } from './leafShapes';
import type { RunFrame } from './runFrame';

/**
 * A climber grown along a wall (or round a column) in the wall's own frame: vines start at the
 * wall's foot and wander along it, steering towards where no leaf is yet and staying within a
 * band that swells and thins along the wall, branching as they go; side shoots climb over the
 * wall's top or trail down onto the floor. Leaves sit at the nodes, alternately left and right,
 * larger on the old wood than towards the tips, so every stretch fills in its own irregular way.
 */

export type ClimberKind = 'ivy' | 'vine' | 'creeper';

interface Habit {
  shape: LeafShape;
  palette: PlantPalette;
  /** Leaves per cell of wall at full density. */
  leaves: number;
  /** Chance of a leaf at a node. */
  leafy: number;
  /** Rib length of a leaf on the old wood, in cells. */
  size: number;
  branching: number;
  /** How far the band reaches up the wall and down onto the floor at its fullest, in cells. */
  up: number;
  down: number;
  /** How much a stem wanders. */
  wander: number;
  stem: number;
  blossoms: number;
}

const HABITS: Readonly<Record<ClimberKind, Habit>> = {
  ivy: { shape: 'ivy', palette: 'green', leaves: 150, leafy: 0.95, size: 0.115, branching: 0.2, up: 0.42, down: 0.26, wander: 0.13, stem: 0.011, blossoms: 0 },
  vine: { shape: 'heart', palette: 'flowering', leaves: 110, leafy: 0.85, size: 0.1, branching: 0.22, up: 0.4, down: 0.26, wander: 0.2, stem: 0.008, blossoms: 0.2 },
  creeper: { shape: 'withered', palette: 'dead', leaves: 60, leafy: 0.42, size: 0.09, branching: 0.3, up: 0.38, down: 0.26, wander: 0.26, stem: 0.011, blossoms: 0 },
};

const STEP = 0.026;
/** The coverage grid's cell, in cells. */
const COVER = 0.035;

/** Where leaves already are, in the frame, so vines grow towards the gaps. */
class Coverage {
  private readonly values: Float32Array;
  private readonly w: number;
  private readonly h: number;
  constructor(
    private readonly s0: number,
    length: number,
    private readonly h0: number,
    span: number,
  ) {
    this.w = Math.ceil((length + 2 * -s0) / COVER) + 1;
    this.h = Math.ceil(span / COVER) + 1;
    this.values = new Float32Array(this.w * this.h);
  }
  private index(s: number, h: number): number {
    const i = Math.floor((s - this.s0) / COVER);
    const j = Math.floor((h - this.h0) / COVER);
    return i < 0 || j < 0 || i >= this.w || j >= this.h ? -1 : j * this.w + i;
  }
  at(s: number, h: number): number {
    const k = this.index(s, h);
    return k < 0 ? 9 : this.values[k]!;
  }
  mark(s: number, h: number, r: number): void {
    for (let ds = -r; ds <= r; ds += COVER) {
      for (let dh = -r; dh <= r; dh += COVER) {
        if (ds * ds + dh * dh > r * r) continue;
        const k = this.index(s + ds, h + dh);
        if (k >= 0) this.values[k]! += 1;
      }
    }
  }
}

interface Tip {
  s: number;
  h: number;
  a: number;
  gen: number;
  reach: number;
  width: number;
}

export interface ClimberSpec {
  kind: ClimberKind;
  density: number;
  /** Scales how far up and down the band reaches (a column's top is narrower than a wall's). */
  reach?: number;
  /** Whether the run is closed (round a column): no thinning at its ends. */
  closed?: boolean;
}

/** A climber along `frame`, drawn from `rng`. */
export function growClimber(rng: Rng, frame: RunFrame, spec: ClimberSpec): PlantForm {
  const habit = HABITS[spec.kind];
  const { length } = frame;
  const reach = spec.reach ?? 1;
  const seed = Math.floor(rng() * 1e6);
  const fullness = (s: number): number => {
    const ends = spec.closed ? 1 : smoothstep(-0.1, 0.8, s) * smoothstep(-0.1, 0.8, length - s);
    return ends * (0.45 + 0.55 * valueNoise(s * 1.1, 0.5, seed)) * (0.55 + 0.45 * spec.density);
  };
  const up = (s: number): number => reach * (0.07 + habit.up * fullness(s));
  const down = (s: number): number => reach * (0.03 + habit.down * fullness(s));
  const cover = new Coverage(-0.4, length, -0.9, 1.8);
  const form = emptyForm(habit.palette, 0.12);
  const target = length * habit.leaves * (0.35 + 0.65 * spec.density);
  const angleAt = (s: number, h: number, a: number): number => {
    const p = frame.at(s, h);
    const q = frame.at(s + Math.cos(a) * 0.01, h + Math.sin(a) * 0.01);
    return Math.atan2(q.y - p.y, q.x - p.x);
  };
  const tips: Tip[] = [];
  const roots = Math.max(1, Math.round(length * (0.45 + 0.6 * spec.density)));
  for (let k = 0; k < roots; k++) {
    const s = length * (k + 0.2 + rng() * 0.6) / roots;
    const a = (rng() < 0.5 ? 0 : Math.PI) + (rng() - 0.5) * 0.6;
    tips.push({ s, h: -0.02 + rng() * 0.04, a, gen: 0, reach: 0.6 + rng() * 2.4, width: habit.stem * (0.8 + rng() * 0.4) });
  }
  // Trailing shoots down onto the floor, sparse.
  const trails = Math.round(length * 0.9 * spec.density);
  for (let k = 0; k < trails; k++) tips.push({ s: rng() * length, h: -0.01, a: -Math.PI / 2 + (rng() - 0.5) * 1.1, gen: 2, reach: 0.12 + rng() * 0.3, width: habit.stem * 0.45 });

  let side = 1;
  for (let t = 0; t < tips.length && form.leaves.length < target; t++) {
    const tip = tips[t]!;
    let { s, h, a } = tip;
    const run: Vec[] = [frame.at(s, h)];
    let walked = 0;
    let node = 0;
    while (walked < tip.reach && form.leaves.length < target) {
      // Look ahead three ways and lean towards the emptiest, kept within the band.
      let best = a;
      let bestScore = Infinity;
      for (const d of [-0.5, 0, 0.5]) {
        const b = a + d;
        const ps = s + Math.cos(b) * 0.09;
        const ph = h + Math.sin(b) * 0.09;
        const outside = Math.max(0, ph - up(ps)) + Math.max(0, -down(ps) - ph);
        const score = cover.at(ps, ph) + outside * 40 + rng() * 0.9;
        if (score < bestScore) {
          bestScore = score;
          best = b;
        }
      }
      a = a * 0.55 + best * 0.45 + (rng() - 0.5) * habit.wander * 2;
      s += Math.cos(a) * STEP;
      h += Math.sin(a) * STEP;
      walked += STEP;
      if (h > up(s) + 0.08 || h < -down(s) - 0.08 - (tip.gen === 2 ? 0.35 : 0) || s < -0.3 || s > length + 0.3) break;
      run.push(frame.at(s, h));
      if (++node % 2 !== 0) continue;
      const young = 1 - walked / tip.reach;
      if (rng() < habit.leafy) {
        side = -side;
        const la = a + side * (0.65 + rng() * 0.7);
        const size = habit.size * (0.62 + 0.38 * young) * (tip.gen === 0 ? 1 : tip.gen === 1 ? 0.88 : 0.74) * (0.82 + rng() * 0.36);
        const stalk = size * 0.18;
        const ls = s + Math.cos(la) * stalk;
        const lh = h + Math.sin(la) * stalk;
        const p = frame.at(ls, lh);
        addLeaf(form, {
          x: p.x,
          y: p.y,
          angle: angleAt(ls, lh, la + (rng() - 0.5) * 0.5),
          length: size,
          breadth: 0.85 + rng() * 0.3,
          shape: habit.shape,
          lobes: rng(),
          serration: spec.kind === 'creeper' ? rng() : 0,
          curl: (rng() - 0.5) * 2,
          layer: Math.max(0, Math.min(1, 0.45 + h * 1.4 + (rng() - 0.5) * 0.6)),
          tone: (rng() - 0.5) * 2,
        });
        cover.mark(s + Math.cos(la) * size * 0.55, h + Math.sin(la) * size * 0.55, size * 0.55);
      }
      if (habit.blossoms > 0 && rng() < habit.blossoms * spec.density) {
        const p = frame.at(s + (rng() - 0.5) * 0.04, h + (rng() - 0.5) * 0.04);
        const count = 1 + Math.floor(rng() * 3);
        for (let k = 0; k < count; k++) {
          form.blossoms.push({ x: p.x + (rng() - 0.5) * 0.06, y: p.y + (rng() - 0.5) * 0.06, radius: 0.017 + rng() * 0.012, petals: 5, angle: rng() * Math.PI, tone: (rng() - 0.5) * 2, layer: 0.7 + rng() * 0.3 });
        }
      }
      if (tip.gen < 3 && rng() < habit.branching) {
        const sideways = rng() < 0.5 ? 1 : -1;
        tips.push({ s, h, a: a + sideways * (0.6 + rng() * 0.8), gen: tip.gen + 1, reach: (0.12 + rng() * 0.5) * (tip.gen === 0 ? 1 : 0.65), width: tip.width * 0.6 });
      }
    }
    if (run.length > 1) addStem(form, { points: run, from: tip.width, to: tip.width * 0.3, layer: tip.gen === 2 ? 0.1 : 0.3, tone: (rng() - 0.5) * 2 });
  }
  return form;
}
