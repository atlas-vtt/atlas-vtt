import { glyphEdges, glyphSolid, lightInGlyph } from './art/glyphLight';
import type { Material } from './art/hand';
import type { PathFn } from './art/paths';
import type { Vec } from './geometry';
import { circlePath, roundedRect, strokeFine, type GlyphPen } from './glyphPen';

/** Small assemblies shared by the two painters; the hand supplies their own pigments or cuts. */
export function surface(pen: GlyphPen, path: PathFn, material: Material): void {
  const { ctx } = pen;
  const colour = pen.paint(material);
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = colour.fill;
  ctx.strokeStyle = colour.ink;
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

export function rectPoly(x: number, y: number, w: number, h: number): Vec[] {
  return [{ x: x - w / 2, y: y - h / 2 }, { x: x + w / 2, y: y - h / 2 },
    { x: x + w / 2, y: y + h / 2 }, { x: x - w / 2, y: y + h / 2 }];
}

export function panel(pen: GlyphPen, x: number, y: number, w: number, h: number, material: Material, raised = true): void {
  surface(pen, path => roundedRect(path, x, y, w, h, 0.018), material);
  if (raised) glyphEdges(pen, rectPoly(x, y, w - 0.025, h - 0.025), true);
}

export function materialDisc(pen: GlyphPen, x: number, y: number, r: number, material: Material): void {
  surface(pen, path => circlePath(path, r, x, y), material);
}

export function ringPoly(r: number, sides = 16, phase = 0): Vec[] {
  return Array.from({ length: sides }, (_, i) => {
    const a = phase + i * Math.PI * 2 / sides;
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  });
}

/** One short arc per sector: water remains visible in monochrome and in SVG. */
export function ripples(pen: GlyphPen, r: number, runs: number, phase: number): void {
  pen.ctx.beginPath();
  for (let i = 0; i < runs; i++) {
    const a = phase + i * Math.PI * 2 / runs;
    pen.ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    pen.ctx.arc(0, 0, r, a, a + Math.PI / runs);
  }
  strokeFine(pen);
}

/** A shaft's undercut rim, on the side facing the map's light, never the object's fixed side. */
export function shaft(pen: GlyphPen, r: number, engraved: boolean): void {
  const { ctx } = pen;
  const light = lightInGlyph(pen);
  const angle = Math.atan2(light.y, light.x);
  ctx.save();
  ctx.beginPath();
  circlePath(ctx, r);
  ctx.clip();
  ctx.beginPath();
  ctx.arc(0, 0, r, angle - Math.PI / 2, angle + Math.PI / 2);
  ctx.arc(-light.x * 0.045, -light.y * 0.045, r, angle + Math.PI / 2, angle - Math.PI / 2, true);
  ctx.closePath();
  ctx.fillStyle = pen.palette.ink;
  if (engraved) ctx.fill();
  else { ctx.globalAlpha = 0.65; ctx.fill(); }
  ctx.restore();
}

export function roundedTop(pen: GlyphPen, path: PathFn, x: number, y: number, radius: number, engraved: boolean): void {
  glyphSolid(pen, path, { x, y }, radius, engraved ? 0.5 : 0.7);
}
