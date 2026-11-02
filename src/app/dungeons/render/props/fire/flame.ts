import { rotate, type Vec } from '../../geometry';
import type { GlyphPen } from '../../glyphPen';
import { fireColours } from './burning';

/**
 * A flame as battlemap artists draw a torch's or a candle's, seen from above at a slant: a teardrop,
 * a rounded base tapering to a soft tip, a little crooked, its pale heart low in it. Stone paints an
 * orange body with a warm rim and a yellow-white core; Engraved outlines it on paper with a small
 * flame line inside. Every fire and wall light draws its flames through `flames`.
 */

export interface Flame {
  /** The middle of its rounded base. */
  at: Vec;
  /** The base's half width. */
  r: number;
  /** How far its tip stands from `at`. */
  length: number;
  /** The way it points, a unit vector. */
  lean: Vec;
  /** How crooked, −1..1: the tip drawn aside and one shoulder fuller, so no two flames match. */
  bend: number;
}

/** A flame's teardrop, `scale` of its size, its base moved `rise` of its length along it. */
export function teardrop(path: CanvasPath, f: Flame, scale = 1, rise = 0): void {
  const { lean } = f;
  const r = f.r * scale;
  const length = f.length * scale;
  const c = { x: f.at.x + lean.x * f.length * rise, y: f.at.y + lean.y * f.length * rise };
  const n = { x: -lean.y, y: lean.x };
  const a = Math.atan2(lean.y, lean.x);
  const sway = f.bend * r * 0.7;
  const tip = { x: c.x + lean.x * length + n.x * sway, y: c.y + lean.y * length + n.y * sway };
  const left = { x: c.x + n.x * r, y: c.y + n.y * r };
  const right = { x: c.x - n.x * r, y: c.y - n.y * r };
  // Near the tip the sides turn in across the flame rather than meeting at a point, so it ends soft.
  const tipSide = r * 0.32;
  const tipBack = length * 0.14;
  const shoulder = (side: number): number => r * (1.15 + side * f.bend * 0.2);
  path.moveTo(tip.x, tip.y);
  path.bezierCurveTo(tip.x - lean.x * tipBack + n.x * tipSide, tip.y - lean.y * tipBack + n.y * tipSide, left.x + lean.x * shoulder(1), left.y + lean.y * shoulder(1), left.x, left.y);
  path.arc(c.x, c.y, r, a + Math.PI / 2, a + (Math.PI * 3) / 2);
  path.bezierCurveTo(right.x + lean.x * shoulder(-1), right.y + lean.y * shoulder(-1), tip.x - lean.x * tipBack - n.x * tipSide, tip.y - lean.y * tipBack - n.y * tipSide, tip.x, tip.y);
  path.closePath();
}

/** Stone & shadow fills with colour; Engraved leaves the paper and cuts its parts in lines. */
function painted(pen: GlyphPen): boolean {
  return pen.hand.scene.env.style.direction === 'stone';
}

/**
 * The flames, each pass over all of them at once: in Stone the orange bodies with their warm rim,
 * then the yellow-white cores low in them; in Engraved the paper bodies outlined, then a small flame
 * line inside each.
 */
export function flames(pen: GlyphPen, list: readonly Flame[]): void {
  const { ctx } = pen;
  const { flame, core, ember } = fireColours(pen);
  const ink = ctx.strokeStyle;
  const width = ctx.lineWidth;
  ctx.beginPath();
  for (const f of list) teardrop(ctx, f);
  ctx.fillStyle = flame;
  ctx.fill();
  ctx.lineWidth = pen.fine * (painted(pen) ? 0.9 : 1.6);
  if (painted(pen)) ctx.strokeStyle = ember;
  ctx.stroke();
  ctx.beginPath();
  for (const f of list) teardrop(ctx, f, 0.52, 0.06);
  if (painted(pen)) {
    ctx.fillStyle = core;
    ctx.fill();
  } else {
    ctx.strokeStyle = ink;
    ctx.lineWidth = pen.fine;
    ctx.stroke();
  }
  ctx.strokeStyle = ink;
  ctx.lineWidth = width;
}

/** The way up the map in a piece's own frame, which free-standing fires point their flames, as a map's artist draws them. */
export function upTheMap(pen: GlyphPen): Vec {
  return rotate({ x: 0, y: -1 }, -pen.rotation);
}

/**
 * The flames of a fire in the open (a fire pit, a brazier) round `at`, `size` the tallest's length:
 * one tall flame and two smaller beside it, all pointing up the map and leaning a little apart.
 */
export function openFire(pen: GlyphPen, at: Vec, size: number): void {
  const up = upTheMap(pen);
  const across = { x: -up.y, y: up.x };
  const lean = (k: number): Vec => {
    const v = { x: up.x + across.x * k, y: up.y + across.y * k };
    const len = Math.hypot(v.x, v.y);
    return { x: v.x / len, y: v.y / len };
  };
  const beside = (side: number, drop: number): Vec => ({ x: at.x + across.x * size * 0.36 * side - up.x * size * drop, y: at.y + across.y * size * 0.36 * side - up.y * size * drop });
  flames(pen, [
    { at: beside(-1, 0.12), r: size * 0.22, length: size * 0.68, lean: lean(-0.3), bend: -0.5 },
    { at: beside(1, 0.18), r: size * 0.2, length: size * 0.6, lean: lean(0.35), bend: 0.6 },
    { at: { x: at.x - up.x * size * 0.25, y: at.y - up.y * size * 0.25 }, r: size * 0.3, length: size, lean: lean(0.05), bend: 0.3 },
  ]);
}
