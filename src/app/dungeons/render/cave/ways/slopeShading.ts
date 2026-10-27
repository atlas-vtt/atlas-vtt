import type { StairEnd } from '../../../floors/stairSpots';
import type { Hand } from '../../art/hand';
import { SHADOW_DIR, TO_LIGHT } from '../../art/light';
import { valueNoise } from '../../art/noise';
import { polyPath, polysPath, type PathFn } from '../../art/paths';
import { pointsBounds, type Vec } from '../../geometry';
import { mixColours, withAlpha } from '../../palette';
import type { WayFrame } from './narrows';
import type { ScreeShape } from './screeShape';
import { stoneOf } from './wayColours';

/**
 * A scree cutting's light. The face on the side towards the light looks away from it and lies in
 * shade, casting its shadow onto the ramp below it; the far face is lit. Down the slope everything
 * darkens with depth until the ramp runs into the dark under its brow (`upper`); from below, it
 * comes out of the dark under the ceiling (`lower`), where the raised ramp's faces take the light the
 * other way round and its shadow falls on the floor beside it. Stone lays it as fills and one
 * gradient; Engraved as constant hatching where the slope goes dark, with its ticks for the faces.
 */

/** The side of the ramp (−1, +1 of `u`) that lies towards the light. */
export function lightSide(frame: WayFrame): number {
  const a = frame.at(0, 0);
  const b = frame.at(1, 0);
  return (b.x - a.x) * TO_LIGHT.x + (b.y - a.y) * TO_LIGHT.y > 0 ? 1 : -1;
}

function fill(hand: Hand, path: PathFn, style: string | CanvasGradient): void {
  const { ctx } = hand.scene.env;
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = style;
  ctx.fill();
}

/** The hollow's darkness out from its deep end (share of its reach, black's alpha). */
const HOLLOW: Record<StairEnd | 'steps', readonly (readonly [number, number])[]> = {
  upper: [[0, 0.97], [0.25, 0.9], [0.45, 0.6], [0.7, 0.24], [1, 0]],
  lower: [[0, 0.88], [0.3, 0.6], [0.6, 0.2], [1, 0]],
  steps: [[0, 0.32], [0.5, 0.14], [1, 0]],
};

/** The faces in rock, shaded and lit by their facing (Stone), before the slope's depth is laid. */
export function layFaces(hand: Hand, frame: WayFrame, shape: ScreeShape, end?: StairEnd): void {
  const c = stoneOf(hand);
  if (!c) return;
  // The lit face in the rock's own colour, the shaded one deeper: two fills, as the pile's stones are toned.
  const towards = lightSide(frame) * (end === 'lower' ? -1 : 1);
  const tone = (shaded: boolean): string => (shaded ? mixColours(c.rock, '#000000', c.dark ? 0.4 : 0.3) : mixColours(c.rock, c.light, c.dark ? 0.08 : 0.16));
  for (const face of shape.faces) fill(hand, polyPath(face.poly), tone(face.side === towards));
}

/**
 * Depth, in one fill over the whole cutting: the ramp and its faces darken down the slope into the
 * mouth; the shaded face's shadow on the ramp (a cutting) or on the floor beside it (a raised ramp).
 */
export function layDepth(hand: Hand, frame: WayFrame, shape: ScreeShape, end?: StairEnd): void {
  const { ctx } = hand.scene.env;
  const c = stoneOf(hand);
  const cut = polysPath([shape.ramp, ...shape.faces.map(f => f.poly)]);
  if (!c) {
    inkDepth(hand, frame, shape, end, cut);
    return;
  }
  if (!hand.scene.raster) {
    if (end) fill(hand, polyPath(shape.ramp), withAlpha('#000000', 0.3));
    return;
  }
  // A hollow, not a flat ramp: the depth is an ellipse round the cutting's deep end, so its contours
  // curve across the slope and reach farther up its middle than along its faces.
  const { hollow } = shape;
  const [rx, ry] = frame.down.x ? [hollow.along, hollow.across] : [hollow.across, hollow.along];
  // The path is traced in the map's frame and the gradient laid in the ellipse's: one fill, no clip.
  ctx.save();
  ctx.beginPath();
  polyPath(shape.outline)(ctx);
  ctx.translate(hollow.at.x, hollow.at.y);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  // Out from the deep end: black along the brow, falling off up the ramp, faster towards its faces.
  for (const [q, alpha] of HOLLOW[end ?? 'steps']) g.addColorStop(q, withAlpha('#000000', alpha));
  ctx.fillStyle = g;
  ctx.fill();
  ctx.restore();
  if (shape.opening) fill(hand, polyPath(shape.opening), withAlpha('#000000', 0.9));
  layFaceShadow(hand, frame, shape, end);
}

/** The shaded face's shadow: across the ramp's edge below a cutting's face, or out on the floor beside a raised ramp. */
function layFaceShadow(hand: Hand, frame: WayFrame, shape: ScreeShape, end?: StairEnd): void {
  if (!hand.scene.env.view.shadow) return;
  const towards = lightSide(frame) * (end === 'lower' ? -1 : 1);
  const index = towards < 0 ? 0 : 1;
  const raised = end === 'lower';
  const line = raised ? shape.rims[index]! : shape.edges[index]!;
  // Into the ramp (−towards) below a cutting's face; out from the ramp (+towards) beside a raised one.
  const away = raised ? towards : -towards;
  const n = line.length - 1;
  const out = line.map((p, i) => {
    const t = i / n;
    const reach = 0.02 + 0.13 * (raised ? 1 - t : t);
    const q = frame.at(away * reach, 0);
    const o = frame.at(0, 0);
    return { x: p.x + (q.x - o.x) + SHADOW_DIR.x * reach * 0.3, y: p.y + (q.y - o.y) + SHADOW_DIR.y * reach * 0.3 };
  });
  fill(hand, polyPath([...line, ...out.reverse()]), withAlpha('#000000', 0.26));
}

/** Ink has no tone to spare: hatching only where the slope goes dark, and solid hatching in its mouth. */
function inkDepth(hand: Hand, frame: WayFrame, shape: ScreeShape, end: StairEnd | undefined, cut: PathFn): void {
  const bands: readonly (readonly [number, number, number, 'shade' | 'depth'])[] = end === 'upper'
    ? [[0.55, 0.82, 0.32, 'shade'], [0.82, 1.2, 1, 'depth']]
    : end === 'lower' ? [[-0.2, 0.3, 0.55, 'shade']] : [[0.7, 1.2, 0.25, 'shade']];
  const { ctx } = hand.scene.env;
  ctx.save();
  ctx.beginPath();
  cut(ctx);
  ctx.clip();
  for (const [t0, t1, level, kind] of bands) {
    const band = slopeBand(frame, shape, t0, t1, end);
    // Hatching costs by the area it covers: only where the band and the cutting meet.
    const [b, c] = [pointsBounds(band), pointsBounds(shape.outline)];
    const bounds = { minX: Math.max(b.minX, c.minX), minY: Math.max(b.minY, c.minY), maxX: Math.min(b.maxX, c.maxX), maxY: Math.min(b.maxY, c.maxY) };
    if (bounds.minX < bounds.maxX && bounds.minY < bounds.maxY) hand.tone(() => level, bounds, polyPath(band), kind);
  }
  ctx.restore();
  if (shape.opening) hand.tone(() => 1, pointsBounds(shape.opening), polyPath(shape.opening), 'depth');
}

/** The slope between `t0` and `t1`, its edges across the slope wandering, so a change of tone reads as rock, not a ruled line. */
function slopeBand(frame: WayFrame, shape: ScreeShape, t0: number, t1: number, end: StairEnd | undefined): Vec[] {
  // A contour of the hollow: bowed towards the high end in the ramp's middle, its edge feathered so
  // the hatching of two bands ends in a ragged line, never a ruled one.
  // The deep end lies at t = 1 (the mouth) or, from below, at t = 0 (the opening): contours bow away from it.
  const away = end === 'lower' ? 1 : -1;
  const half = frame.across / 2;
  const edge = (t: number): Vec[] => Array.from({ length: 21 }, (_, i) => {
    const s = i / 20 * 2 - 1;
    const inner = t > 0 && t < 1;
    const bow = inner ? away * 0.3 * (1 - (s / 0.8) ** 2) : 0;
    // Feathered: the edge wanders at two scales, never a regular tooth.
    const feather = inner ? 0.06 * (valueNoise(i * 0.9, t * 23, 5) - 0.5) * 2 + 0.03 * (valueNoise(i * 2.7, t * 31, 9) - 0.5) * 2 : 0;
    return frame.at(s * half, shape.vAt(t) + bow + feather);
  });
  return [...edge(t0), ...edge(t1).reverse()];
}

/**
 * Ticks down the faces from their top edge, tapering, as maps draw a bank or a cutting: each as long
 * as the face is wide there, so they lengthen as the slope drops, and heavier on the shaded face.
 * A cutting's top edge is its rim; a raised ramp's is the ramp's own edge.
 */
export function drawFaceTicks(hand: Hand, frame: WayFrame, shape: ScreeShape, end: StairEnd | undefined, alpha: number, seed: number): void {
  const raised = end === 'lower';
  const towards = lightSide(frame) * (raised ? -1 : 1);
  const wedges: Vec[][] = [];
  for (let index = 0; index < 2; index++) {
    const top = raised ? shape.edges[index]! : shape.rims[index]!;
    const foot = raised ? shape.rims[index]! : shape.edges[index]!;
    const heavy = shape.faces[index]!.side === towards ? 1.5 : 1;
    const n = top.length - 1;
    // Along the face, about one tick every 0.16 cells.
    const length = top.reduce((sum, p, i) => (i ? sum + Math.hypot(p.x - top[i - 1]!.x, p.y - top[i - 1]!.y) : 0), 0);
    const count = Math.max(4, Math.round(length / 0.16));
    for (let k = 0; k <= count; k++) {
      const f = (k + 0.3 * (valueNoise(k * 1.9, index * 7, seed) - 0.5)) / count * n;
      const i = Math.min(n - 1, Math.max(0, Math.floor(f)));
      const s = Math.max(0, Math.min(1, f - i));
      const lerp = (run: Vec[]): Vec => ({ x: run[i]!.x + (run[i + 1]!.x - run[i]!.x) * s, y: run[i]!.y + (run[i + 1]!.y - run[i]!.y) * s });
      const a = lerp(top);
      const b = lerp(foot);
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy);
      if (len < 0.025) continue;
      // Long and short in turn, as a hand draws a bank's ticks.
      const reach = k % 2 ? 0.6 : 0.95;
      const w = 0.016 * heavy;
      const nx = -dy / len * w / 2;
      const ny = dx / len * w / 2;
      wedges.push([{ x: a.x - nx, y: a.y - ny }, { x: a.x + nx, y: a.y + ny }, { x: a.x + dx * reach, y: a.y + dy * reach }]);
    }
  }
  if (end === 'upper' && shape.brow && !stoneOf(hand)) {
    // Under the brow, down into the dark the ramp runs into (ink; Stone's dark says it).
    const o = frame.at(0, 0);
    const back = frame.at(0, -1);
    const dx = back.x - o.x;
    const dy = back.y - o.y;
    shape.brow.forEach((p, i) => {
      if (i === 0 || i === shape.brow!.length - 1) return;
      const reach = i % 2 ? 0.1 : 0.16;
      wedges.push([{ x: p.x - dy * 0.012, y: p.y + dx * 0.012 }, { x: p.x + dy * 0.012, y: p.y - dx * 0.012 }, { x: p.x + dx * reach, y: p.y + dy * reach }]);
    });
  }
  const { ctx } = hand.scene.env;
  ctx.beginPath();
  polysPath(wedges)(ctx);
  ctx.fillStyle = withAlpha(hand.paint('rock').ink, alpha);
  ctx.fill();
}

/** Loose stones' contact shadows: Stone lays each stone's shape again a little down the light's fall, under it. */
export function layRubbleShadow(hand: Hand, stones: readonly Vec[][], lift: number): void {
  const { env } = hand.scene;
  if (env.style.direction !== 'stone' || !env.view.shadow) return;
  fill(hand, polysPath(stones.map(poly => poly.map(p => ({ x: p.x + SHADOW_DIR.x * lift, y: p.y + SHADOW_DIR.y * lift })))), withAlpha('#000000', 0.38));
}
