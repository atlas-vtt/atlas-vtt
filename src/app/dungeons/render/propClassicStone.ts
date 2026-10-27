import { glyphEdges } from './art/glyphLight';
import { polyPath, type PathFn } from './art/paths';
import type { Vec } from './geometry';
import { bevel, block, circlePath, disc, fineLines, fineRing, roundedRect, strokeFine, type GlyphPen } from './glyphPen';
import { materialDisc, panel, rectPoly, roundedTop, surface } from './propClassicParts';

/** A cloak and two shoulders beneath the crown of the head: a standing figure seen from above. */
export function statueFigure(pen: GlyphPen, engraved: boolean): void {
  disc(pen, 0, 0.025, 0.275);
  fineRing(pen, 0, 0.025, 0.237);
  const cloak: PathFn = path => {
    path.moveTo(-0.18, -0.04);
    path.quadraticCurveTo(-0.22, 0.09, -0.15, 0.19);
    path.quadraticCurveTo(0, 0.25, 0.15, 0.19);
    path.quadraticCurveTo(0.22, 0.09, 0.18, -0.04);
    path.closePath();
  };
  surface(pen, cloak, 'stone');
  fineLines(pen, [-0.08, 0.06, -0.12, 0.17, 0, 0.075, 0, 0.2, 0.08, 0.06, 0.12, 0.17]);
  // Shoulders and bent arms are compact foreshortened masses; no face or upright weapon.
  surface(pen, path => {
    for (const x of [-0.13, 0.13]) roundedRect(path, x, -0.035, 0.13, 0.14, 0.055);
    roundedRect(path, 0, -0.12, 0.15, 0.06, 0.025);
  }, 'stone');
  fineLines(pen, [-0.17, -0.06, -0.12, -0.07, 0.12, -0.07, 0.17, -0.06]);
  materialDisc(pen, 0, -0.025, 0.09, 'stone');
  roundedTop(pen, path => circlePath(path, 0.09, 0, -0.025), 0, -0.025, 0.09, engraved);
  // Crown ridge of the carved hood, with the small front projection visible from overhead.
  fineLines(pen, [0, -0.1, 0, 0.045, -0.025, -0.095, 0, -0.12, 0, -0.12, 0.025, -0.095]);
}

function statue(pen: GlyphPen, engraved: boolean): void {
  block(pen, 0, 0, 0.6, 0.6);
  bevel(pen, 0, 0, 0.6, 0.6, 0.055);
  glyphEdges(pen, rectPoly(0, 0, 0.57, 0.57), true);
  statueFigure(pen, engraved);
}

function step(inset: number): Vec[] {
  const x = 1.5 - inset;
  const y = -(1.35 - inset);
  const c = 0.32 - inset * (2 - Math.SQRT2);
  return [{ x: -x, y: 0 }, { x: -x, y: y + c }, { x: -x + c, y },
    { x: x - c, y }, { x, y: y + c }, { x, y: 0 }];
}

/** Three broad treads and their nosings. The back edge is the room's wall and is never inked. */
function dais(pen: GlyphPen, engraved: boolean): void {
  const { ctx } = pen;
  ctx.save();
  // The closed edge helpers are clipped off the wall, including their lit lips and shade cuts.
  ctx.beginPath();
  ctx.rect(-1.6, -1.45, 3.2, 1.425);
  ctx.clip();
  for (const inset of [0, 0.24, 0.48]) {
    const poly = step(inset);
    surface(pen, polyPath(poly), 'dressed');
    glyphEdges(pen, poly, true);
    const nose = step(inset + 0.04);
    ctx.beginPath();
    ctx.moveTo(nose[0]!.x, nose[0]!.y);
    for (const p of nose.slice(1)) ctx.lineTo(p.x, p.y);
    strokeFine(pen);
  }
  const outer = step(0);
  const top = step(0.48);
  const joints: number[] = [];
  for (const i of [1, 2, 3, 4]) joints.push(outer[i]!.x, outer[i]!.y, top[i]!.x, top[i]!.y);
  // Long dressed tread blocks, staggered between the two lower steps.
  for (const x of [-0.6, 0.3]) joints.push(x, -1.34, x, -1.12);
  for (const x of [-0.3, 0.6]) joints.push(x, -1.1, x, -0.88);
  fineLines(pen, joints);
  if (engraved) fineLines(pen, [-0.72, -0.76, 0.72, -0.76]);
  else panel(pen, 0, -0.43, 1.48, 0.61, 'dressed', false);
  ctx.restore();
}

export const STONE_STONE = {
  statue: (pen: GlyphPen): void => statue(pen, false),
  dais: (pen: GlyphPen): void => dais(pen, false),
};

export const STONE_ENGRAVED = {
  statue: (pen: GlyphPen): void => statue(pen, true),
  dais: (pen: GlyphPen): void => dais(pen, true),
};
