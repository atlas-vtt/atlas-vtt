import { rngFrom } from '../../rng';
import type { Hand } from '../art/hand';
import { centroid } from '../art/paths';
import type { Vec } from '../geometry';
import { withAlpha } from '../palette';
import { dashes } from '../cave/ways/shaftMouth';
import { fillWith, inkOf, lookOf, strokeWith } from './marks';
import { drawRubble, rubbleStone } from './rubble';

/**
 * An opening overhead seen from the floor below it (an aven, a chimney, the hole a pitch comes down
 * through): its outline in the ceiling dashed, as surveys draw a ceiling form, never shaded and
 * never filled, so it cannot be read as a hole in the floor. A chimney that narrows as it rises
 * shows a second, smaller ring inside. Under it lie a few drips, or what fell down it.
 */

export interface OverheadOptions {
  seed: number;
  /** A second ring inside, for a chimney narrowing as it rises. */
  narrows: boolean;
  /** What lies under it: a small pile of what fell, drip marks, or nothing of its own (the floor under a hole draws its rubble). */
  under: 'rubble' | 'drips' | 'none';
}

/** The ring shrunk `by` cells towards its middle. */
function shrunk(ring: readonly Vec[], by: number): Vec[] {
  const c = centroid(ring);
  return ring.map(p => {
    const d = Math.hypot(p.x - c.x, p.y - c.y) || 1;
    const k = Math.max(0.2, (d - by) / d);
    return { x: c.x + (p.x - c.x) * k, y: c.y + (p.y - c.y) * k };
  });
}

/** The dashed outline: a hairline in ink and the engraving, a light broken stroke in crayon, so it reads as a ghost and never as an edge. */
function dashed(hand: Hand, ring: readonly Vec[], dash: number, gap: number, scale: number): void {
  const look = lookOf(hand);
  const runs = dashes(ring, dash, gap);
  if (look === 'crayon') strokeWith(hand, runs, withAlpha(inkOf(hand), 0.4), 0.03 * scale);
  else strokeWith(hand, runs, withAlpha(inkOf(hand), 0.85), (look === 'ink' ? 0.017 : 0.014) * scale);
}

export function drawOverhead(hand: Hand, rim: readonly Vec[], options: OverheadOptions): void {
  const c = centroid(rim);
  const rng = rngFrom(options.seed);
  if (options.under === 'rubble') {
    // What came down lies under the opening, a heap in its middle and stones thrown a little wider.
    const reach = Math.max(...rim.map(p => Math.hypot(p.x - c.x, p.y - c.y))) * 0.55;
    const stones = Array.from({ length: 7 }, (_, i) => {
      const a = rng() * Math.PI * 2;
      const d = i < 2 ? 0.05 * rng() : reach * (0.3 + 0.7 * Math.sqrt(rng()));
      return rubbleStone(rng, { x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d }, i < 2 ? 0.06 + 0.025 * rng() : 0.022 + 0.025 * rng());
    });
    drawRubble(hand, stones);
  } else if (options.under === 'drips') {
    const dots: Vec[][] = [];
    for (let i = 0; i < 3; i++) {
      const p = { x: c.x + (rng() - 0.5) * 0.3, y: c.y + (rng() - 0.5) * 0.3 };
      const r = 0.014 + 0.008 * rng();
      dots.push(Array.from({ length: 8 }, (_, k) => ({ x: p.x + Math.cos(k * Math.PI / 4) * r, y: p.y + Math.sin(k * Math.PI / 4) * r })));
    }
    fillWith(hand, path => dots.forEach(d => { path.moveTo(d[0]!.x, d[0]!.y); d.slice(1).forEach(q => path.lineTo(q.x, q.y)); path.closePath(); }), withAlpha(inkOf(hand), 0.7));
  }
  dashed(hand, rim, 0.12, 0.07, 1);
  if (options.narrows) dashed(hand, shrunk(rim, 0.15), 0.08, 0.07, 0.8);
}

/** A coil of rope at the foot of a pitch, where the rope from above lands: a spiral of two and a half turns. */
export function drawCoil(hand: Hand, at: Vec, seed: number): void {
  const turn = rngFrom(seed)() * Math.PI * 2;
  const spiral = Array.from({ length: 61 }, (_, i) => {
    const t = i / 60;
    const a = turn + t * Math.PI * 5;
    const r = 0.06 + 0.13 * t;
    return { x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r * 0.85 };
  });
  strokeWith(hand, [spiral], inkOf(hand), 0.034);
  strokeWith(hand, [spiral], hand.paint('rope').fill, 0.02);
}
