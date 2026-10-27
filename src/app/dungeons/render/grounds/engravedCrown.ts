/**
 * Engraved's tree crowns, inked as a mapmaker inks a tree from above: masses of leaves with a
 * scalloped outline, laid one over the other from the rim up, so each higher mass cuts its outline
 * across the ones below; the lit side left white, the side away from the light hatched in one
 * direction with a few leaf scallops in it and its edge pressed heavier. Gaps are solid ink with a
 * limb left in paper across them. A conifer's whorls are star-pointed, their needles ruled out from
 * the leader.
 */

import type { Hand } from '../art/hand';
import { SHADOW_DIR, TO_LIGHT } from '../art/light';
import { hash2 } from '../art/noise';
import { polyPath } from '../art/paths';
import type { Pens } from '../engraved/pens';
import type { Canvas2D, Vec } from '../geometry';
import { traceShape, type Clump, type Crown } from './crowns';

/** The hatching's direction: the burin's lines up to the right, as the cast shadows are cut. */
const HATCH = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };

export function cutCrown(hand: Hand, pens: Pens, crown: Crown): void {
  const { ctx } = hand.scene.env;
  const scalloped = crown.species === 'broadleaf';
  const fine = hand.weight('fine');
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = pens.ink;
  let gapsDrawn = crown.gaps.length === 0;
  for (const clump of crown.clumps) {
    if (!gapsDrawn && clump.height > 0.2) {
      cutGaps(ctx, pens, crown, fine);
      gapsDrawn = true;
    }
    const rim = clump.height < 0.2;
    ctx.beginPath();
    traceShape(ctx, clump.shape);
    ctx.fillStyle = pens.floor;
    ctx.fill();
    // The body's face is all but hidden by the masses on it: its outline is enough.
    if (!clump.body) shadeClump(ctx, pens, clump, fine, scalloped, clump.height < 0.6);
    // The rim's masses are outlined whole; a higher mass only where it overhangs the ones below, on its shaded side.
    if (rim || !scalloped) {
      ctx.beginPath();
      traceShape(ctx, clump.shape);
      ctx.lineWidth = rim ? hand.weight('outline') : fine * 1.2;
      ctx.stroke();
    }
    if (!clump.body) pressShadedEdge(ctx, clump, rim ? hand.weight('heavy') : fine * 1.6);
    if (!scalloped) ruleNeedles(ctx, clump, fine);
  }
  if (!gapsDrawn) cutGaps(ctx, pens, crown, fine);
  ctx.restore();
}

/** The side of a mass away from the light: hatched in one direction where the lit part does not reach (on the lower masses), with a few scallops of leaves in it. */
function shadeClump(ctx: Canvas2D, pens: Pens, clump: Clump, fine: number, scalloped: boolean, hatched: boolean): void {
  const { centre, radius } = clump;
  ctx.save();
  ctx.beginPath();
  traceShape(ctx, clump.shape);
  traceShape(ctx, clump.lit);
  ctx.clip('evenodd');
  // Only its far half: the lit side stays white.
  ctx.beginPath();
  traceHalf(ctx, clump, -0.1);
  ctx.clip();
  if (hatched) {
    ctx.beginPath();
    const spacing = pens.spacing * 1.1;
    const reach = radius * 1.3;
    for (let s = -reach; s <= reach; s += spacing) {
      // Across the hatch direction by `s`, the line runs the mass's width.
      const x = centre.x - HATCH.y * s;
      const y = centre.y + HATCH.x * s;
      ctx.moveTo(x - HATCH.x * reach, y - HATCH.y * reach);
      ctx.lineTo(x + HATCH.x * reach, y + HATCH.y * reach);
    }
    ctx.lineWidth = fine * 0.75;
    ctx.stroke();
  }
  if (scalloped) {
    // Leaves in the shade: short arcs, opening towards the light.
    ctx.beginPath();
    const salt = Math.floor(centre.x * 89 + centre.y * 53);
    const toShade = Math.atan2(SHADOW_DIR.y, SHADOW_DIR.x);
    for (let k = 0; k < Math.round(radius * 9); k++) {
      const a = toShade + (hash2(salt, k, 1) - 0.5) * 2.2;
      const d = radius * (0.45 + 0.4 * hash2(salt, k, 2));
      const x = centre.x + Math.cos(a) * d;
      const y = centre.y + Math.sin(a) * d;
      const r = radius * (0.1 + 0.06 * hash2(salt, k, 3));
      ctx.moveTo(x + Math.cos(toShade - 1.2) * r, y + Math.sin(toShade - 1.2) * r);
      ctx.arc(x, y, r, toShade - 1.2, toShade + 1.2);
    }
    ctx.lineWidth = fine;
    ctx.stroke();
  }
  ctx.restore();
}

/** The mass's outline again on its side away from the light, pressed heavier: the scallops whose two roots both lie there, or a conifer's points. */
function pressShadedEdge(ctx: Canvas2D, clump: Clump, width: number): void {
  const { centre } = clump;
  const shaded = (p: Vec): boolean => (p.x - centre.x) * SHADOW_DIR.x + (p.y - centre.y) * SHADOW_DIR.y > clump.radius * 0.15;
  const { points, controls } = clump.shape;
  ctx.beginPath();
  for (let k = 0; k <= points.length; k++) {
    const p = points[k % points.length]!;
    const q = points[(k + points.length - 1) % points.length]!;
    if (k === 0 || !shaded(p) || !shaded(q)) ctx.moveTo(p.x, p.y);
    else if (controls) ctx.quadraticCurveTo(controls[k - 1]!.x, controls[k - 1]!.y, p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.lineWidth = width;
  ctx.stroke();
}

/** The half-plane beyond the mass's middle along the light's fall, moved `shift` of its radius further, as far as the mass reaches. */
function traceHalf(ctx: Canvas2D, { centre, radius }: Clump, shift: number): void {
  const r = radius * 2;
  const along = { x: centre.x + SHADOW_DIR.x * radius * shift, y: centre.y + SHADOW_DIR.y * radius * shift };
  ctx.moveTo(along.x + HATCH.x * r, along.y + HATCH.y * r);
  ctx.lineTo(along.x + HATCH.x * r + SHADOW_DIR.x * r, along.y + HATCH.y * r + SHADOW_DIR.y * r);
  ctx.lineTo(along.x - HATCH.x * r + SHADOW_DIR.x * r, along.y - HATCH.y * r + SHADOW_DIR.y * r);
  ctx.lineTo(along.x - HATCH.x * r, along.y - HATCH.y * r);
  ctx.closePath();
}

/** Gaps in the leaves in solid ink, each with its limb left in paper. */
function cutGaps(ctx: Canvas2D, pens: Pens, crown: Crown, fine: number): void {
  ctx.beginPath();
  for (const gap of crown.gaps) polyPath(gap.ring)(ctx);
  ctx.fillStyle = pens.ink;
  ctx.fill();
  ctx.beginPath();
  for (const { limb } of crown.gaps) {
    ctx.moveTo(limb[0].x, limb[0].y);
    ctx.lineTo(limb[1].x, limb[1].y);
  }
  ctx.strokeStyle = pens.floor;
  ctx.lineWidth = fine * 1.8;
  ctx.stroke();
  ctx.strokeStyle = pens.ink;
}

/** A conifer whorl's needles: a line out from the leader to every branch tip, more of them on the shaded side. */
function ruleNeedles(ctx: Canvas2D, clump: Clump, fine: number): void {
  const { centre, ring } = clump;
  ctx.beginPath();
  for (let k = 1; k < ring.length; k += 4) {
    const tip = ring[k]!;
    const dx = tip.x - centre.x;
    const dy = tip.y - centre.y;
    const shaded = dx * TO_LIGHT.x + dy * TO_LIGHT.y < 0;
    for (const s of shaded ? [-1, 0, 1] : [0]) {
      const spread = s * 0.07;
      ctx.moveTo(centre.x + dx * 0.25, centre.y + dy * 0.25);
      ctx.lineTo(centre.x + dx * (0.85 - Math.abs(s) * 0.15) - dy * spread, centre.y + dy * (0.85 - Math.abs(s) * 0.15) + dx * spread);
    }
  }
  ctx.lineWidth = fine * 0.8;
  ctx.stroke();
}
