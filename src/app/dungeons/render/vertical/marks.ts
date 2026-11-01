import type { Hand } from '../art/hand';
import { SHADOW_DIR, TO_LIGHT } from '../art/light';
import { valueNoise } from '../art/noise';
import { polyPath, polysPath, runsPath, type Field, type PathFn } from '../art/paths';
import type { Bounds, Vec } from '../geometry';
import { withAlpha } from '../palette';
import { stoneOf } from '../cave/ways/wayColours';
import { along, normalsOf, offsetRun } from './runs';

/**
 * The marks every way up or down is drawn with, in each look's manner, as surveys and the best
 * hand-drawn maps mark height: the low side of every edge carries a band as wide as the drop is
 * deep (the cue that tells up from down), short ticks hang from the edge into it, the high side
 * catches the one light at the top left as a pale lip. Ink and tone grades the band in grey; the
 * engraving hatches it across the edge; crayon presses it in, its paper's tooth always showing.
 */

export type Look = 'ink' | 'engraving' | 'crayon';

export function lookOf(hand: Hand): Look {
  const { direction } = hand.scene.env.style;
  return direction === 'stone' ? 'ink' : direction === 'engraved' ? 'engraving' : 'crayon';
}

/** The depth a bottomless drop is drawn for: the band at its widest. */
export const BOTTOMLESS = 60;

/** How wide the low side's band is for a drop of `feet`, in cells: the shadow grows with the height. */
export function band(feet: number): number {
  return Math.min(0.6, 0.06 + 0.012 * feet);
}

/** The ink every look draws its lines with. */
export function inkOf(hand: Hand): string {
  return hand.scene.env.palette.ink;
}

/** How wide the band lies where its low side looks along `n`: whole where it faces away from the light, three fifths where it faces it. */
export function facingScale(n: Vec): number {
  return 0.8 + 0.2 * (n.x * SHADOW_DIR.x + n.y * SHADOW_DIR.y);
}

/** How strongly a lip looking along `n` catches the light: fully facing it, nothing past 60° from it. */
export function catchesLight(n: Vec): number {
  return Math.max(0, Math.min(1, ((n.x * TO_LIGHT.x + n.y * TO_LIGHT.y) - 0.5) / 0.5));
}

export function fillWith(hand: Hand, path: PathFn, colour: string): void {
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}

export function strokeWith(hand: Hand, runs: readonly (readonly Vec[])[], colour: string | CanvasPattern, width: number, closed = false): void {
  if (!runs.length) return;
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  runsPath(runs, closed)(ctx);
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.stroke();
  ctx.restore();
}

/** What a look shades with in tone: Stone's shadow colour, or black on a dark look. */
function shadeColour(hand: Hand): string {
  const c = stoneOf(hand);
  return c && !c.dark ? c.shadow : '#000000';
}

/**
 * Darkens `path` by `field` (0..1): Crayon presses its umber in (stronger where the field is), a
 * monochrome or vector Crayon and the other looks lay their own tone.
 */
export function shadeArea(hand: Hand, field: Field, bounds: Bounds, path: PathFn, kind: 'shade' | 'depth'): void {
  if (hand.wax) hand.wax(path, 0.95, 3, field, bounds);
  else hand.tone(field, bounds, path, kind);
}

/** The band on a run's low side (`low`), `width(i)` cells at point `i`, from `skip` past the edge. */
function bandPolygon(run: readonly Vec[], normals: readonly Vec[], low: number, width: (i: number) => number, skip: number, closed: boolean): PathFn {
  const near = offsetRun(run, normals, () => skip, low);
  const far = offsetRun(run, normals, i => skip + width(i), low);
  return closed ? polysPath([near, far.slice().reverse()]) : polyPath([...near, ...far.reverse()]);
}

export interface BandOptions {
  closed?: boolean;
  /** Cross-hatch where the run meets the walls at its ends (an open run from wall to wall). */
  corners?: boolean;
  /** How strong the band is, 0..1 (a lower terrace darker, a ghost of one fainter). */
  strength?: number;
  /** Crayon's two layers' pressure, the whole band's and the foot's; unset, a light pair that leaves a slope or terrace soft. */
  covers?: readonly [number, number];
}

/**
 * The band on the low side of an edge, `width` cells at its widest: graded grey in ink and tone,
 * hatch lines across the edge in the engraving (a gap at the edge, the lip), two layers of crayon.
 * Its width follows the light: whole where the low side faces away from it, three fifths facing it.
 */
export function lowBand(hand: Hand, run: readonly Vec[], low: number, width: number | ((p: Vec) => number), options: BandOptions = {}): void {
  if (run.length < 2) return;
  const closed = options.closed ?? false;
  const strength = options.strength ?? 1;
  const normals = normalsOf(run, closed);
  const widthAt = typeof width === 'number' ? (): number => width : width;
  const w = (i: number): number => widthAt(run[i]!) * facingScale({ x: normals[i]!.x * low, y: normals[i]!.y * low });
  const look = lookOf(hand);
  if (look === 'engraving' || (look === 'crayon' && !hand.waxStroke)) {
    hatchBand(hand, run, low, widthAt, closed, options.corners ?? false);
    return;
  }
  if (look === 'crayon' && hand.waxStroke) {
    // Two layers of broad strokes along the edge, heavier at its foot, the lip left bare.
    const mean = run.reduce((sum, _, i) => sum + w(i), 0) / run.length;
    const along = (share: number): Vec[] => offsetRun(run, normals, i => 0.02 + w(i) * share / 2, low);
    const runs = (share: number): Vec[][] => [closed ? [...along(share), along(share)[0]!] : along(share)];
    const [whole, foot] = options.covers ?? [0.32, 0.36];
    hand.waxStroke(runs(1), mean, whole * strength);
    hand.waxStroke(runs(0.5), mean * 0.5, foot * strength);
    return;
  }
  // Ink and tone: darkest at the foot, fading out over the band.
  const colour = shadeColour(hand);
  const alpha = (stoneOf(hand)?.dark ? 0.2 : 0.15) * strength;
  for (const share of [1, 0.45]) fillWith(hand, bandPolygon(run, normals, low, i => w(i) * share, 0, closed), withAlpha(colour, alpha * 1.25));
}

/** The engraving's band: lines across the edge, a little apart, long and short in turn, never touching it; crossed where it meets the walls. */
function hatchBand(hand: Hand, run: readonly Vec[], low: number, width: (p: Vec) => number, closed: boolean, corners: boolean): void {
  const step = Math.max(0.035, 3.2 / hand.scene.env.pxPerCell);
  const lines: Vec[][] = [];
  const points = along(run, step, step / 2, closed);
  const total = points.length * step;
  points.forEach(({ p, n }, k) => {
    const out = { x: n.x * low, y: n.y * low };
    const len = width(p) * facingScale(out) * (k % 3 === 0 ? 1 : k % 3 === 1 ? 0.62 : 0.82) * (0.85 + 0.3 * valueNoise(p.x * 7, p.y * 7, 41));
    const a = { x: p.x + out.x * 0.025, y: p.y + out.y * 0.025 };
    lines.push([a, { x: a.x + out.x * len, y: a.y + out.y * len }]);
    // The corners against the walls, where the shadow is deepest: crossed at a slant.
    const fromEnd = Math.min(k * step, total - k * step);
    if (corners && !closed && fromEnd < 0.3) {
      const slant = { x: out.x * 0.7 + n.y * 0.7 * low, y: out.y * 0.7 - n.x * 0.7 * low };
      lines.push([a, { x: a.x + slant.x * len * 0.9, y: a.y + slant.y * len * 0.9 }]);
    }
  });
  hand.line(lines, 'fine');
}

/** An edge's band, for `lowBands`. */
export interface BandRun {
  run: readonly Vec[];
  low: number;
  width: number | ((p: Vec) => number);
  closed?: boolean;
}

/** Several edges' bands, each as `lowBand` lays it. */
export function lowBands(hand: Hand, bands: readonly BandRun[], corners = false): void {
  for (const b of bands) lowBand(hand, b.run, b.low, b.width, { closed: b.closed ?? false, corners: corners && !b.closed });
}

export interface TickOptions {
  closed?: boolean;
  /** Ticks fan by up to this much either way, in radians. */
  fan?: number;
  seed?: number;
  /** No tick within 0.14 cells of this point (where a rope goes over). */
  keepClear?: Vec;
  /** Crayon's ticks apart and at their base, in cells, where an edge asks for fewer and fatter than the look's own. */
  crayon?: { spacing: number; base: number };
}

/** Short tapering ticks from an edge into its low side, `length` cells long: fine and close in ink, finer in the engraving, fewer and fatter in crayon. */
export function ticks(hand: Hand, run: readonly Vec[], low: number, length: number | ((p: Vec) => number), options: TickOptions = {}): void {
  const lengthAt = typeof length === 'number' ? (): number => length : length;
  const look = lookOf(hand);
  const spacing = look === 'ink' ? 0.14 : look === 'engraving' ? 0.1 : (options.crayon?.spacing ?? 0.22);
  const base = look === 'ink' ? 0.013 : look === 'engraving' ? 0.011 : (options.crayon?.base ?? 0.026);
  const seed = options.seed ?? 7;
  const fan = options.fan ?? 0.14;
  const wedges: Vec[][] = [];
  for (const { p, t, n } of along(run, spacing, spacing * 0.5, options.closed ?? false)) {
    if (options.keepClear && Math.hypot(p.x - options.keepClear.x, p.y - options.keepClear.y) < 0.14) continue;
    if (lengthAt(p) < 0.02) continue;
    const turn = (valueNoise(p.x * 5, p.y * 5, seed) - 0.5) * 2 * fan;
    const out = { x: n.x * low, y: n.y * low };
    const dir = { x: out.x * Math.cos(turn) - out.y * Math.sin(turn), y: out.x * Math.sin(turn) + out.y * Math.cos(turn) };
    const len = lengthAt(p) * (0.75 + 0.5 * valueNoise(p.x * 11, p.y * 11, seed + 1)) * facingScale(out);
    wedges.push([{ x: p.x - t.x * base / 2, y: p.y - t.y * base / 2 }, { x: p.x + t.x * base / 2, y: p.y + t.y * base / 2 }, { x: p.x + dir.x * len, y: p.y + dir.y * len }]);
  }
  if (wedges.length) fillWith(hand, polysPath(wedges), withAlpha(inkOf(hand), look === 'crayon' ? 0.8 : 0.9));
}

/**
 * An edge in the floor where it steps down: in ink a doubled hairline about a third of a wall's
 * weight, in the engraving one line, in crayon one firmer stroke that breaks where the hand lifts.
 */
export function edgeLine(hand: Hand, run: readonly Vec[], low: number, closed = false, seed = 5): void {
  const ink = inkOf(hand);
  const look = lookOf(hand);
  if (look === 'crayon') {
    const pieces: Vec[][] = [];
    let piece: Vec[] = [];
    for (const p of run) {
      if (valueNoise(p.x * 3, p.y * 3, seed) > 0.82 && piece.length > 2) {
        pieces.push(piece);
        piece = [];
      } else piece.push(p);
    }
    if (closed && run.length) piece.push(run[0]!);
    if (piece.length > 1) pieces.push(piece);
    strokeWith(hand, pieces, withAlpha(ink, 0.85), 0.034);
    return;
  }
  const weight = hand.weight('outline');
  strokeWith(hand, [run], ink, weight, closed);
  if (look === 'engraving') return;
  // The second hairline on the high side: the top of the step seen beside its face.
  const normals = normalsOf(run, closed);
  strokeWith(hand, [offsetRun(run, normals, () => 0.035, -low)], withAlpha(ink, 0.75), weight * 0.7, closed);
}

/** The pale lip on an edge's high side, strongest where the face below it looks towards the light: in ink and tone only (the others leave the paper bare there). */
export function litLip(hand: Hand, run: readonly Vec[], low: number, closed = false, offset = 0.05): void {
  const c = stoneOf(hand);
  if (!c) return;
  const normals = normalsOf(run, closed);
  // Three strengths, each one stroke: the lip fades over 60° either way from the light.
  const levels: Vec[][][] = [[], [], []];
  let current = -1;
  let piece: Vec[] = [];
  const high = offsetRun(run, normals, () => offset, -low);
  high.forEach((p, i) => {
    const s = catchesLight({ x: normals[i]!.x * low, y: normals[i]!.y * low });
    const level = s < 0.15 ? -1 : s < 0.45 ? 0 : s < 0.75 ? 1 : 2;
    if (level !== current) {
      if (current >= 0 && piece.length > 1) levels[current]!.push(piece);
      piece = current >= 0 && level >= 0 ? [high[i - 1] ?? p] : [];
      current = level;
    }
    if (level >= 0) piece.push(p);
  });
  if (current >= 0 && piece.length > 1) levels[current]!.push(piece);
  const strength = c.dark ? 0.35 : 0.8;
  levels.forEach((runs, k) => strokeWith(hand, runs, withAlpha(c.light, strength * (k + 1) / 3), 0.025));
}
