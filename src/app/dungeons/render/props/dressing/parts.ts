import { glyphEdges, glyphSolid } from '../../art/glyphLight';
import type { Material } from '../../art/hand';
import type { PathFn } from '../../art/paths';
import { bevel, circlePath, strokeFine, type GlyphPen } from '../../glyphPen';
import { PLINTH, panelPath, panelPoly, shoulders, type Panel } from './shapes';

function surface(pen: GlyphPen, path: PathFn, material: Material): void {
  const paint = pen.paint(material);
  pen.ctx.beginPath();
  path(pen.ctx);
  pen.ctx.fillStyle = paint.fill;
  pen.ctx.fill();
  pen.ctx.save();
  pen.ctx.strokeStyle = paint.ink;
  pen.ctx.stroke();
  pen.ctx.restore();
}

function raisedPanel(pen: GlyphPen, panel: Panel): void {
  surface(pen, panelPath(panel), 'dressed');
  glyphEdges(pen, panelPoly(panel), true);
}

/** A bust on its square plinth, seen from above. */
export function bustBody(pen: GlyphPen, painted: boolean): void {
  raisedPanel(pen, PLINTH);
  bevel(pen, 0, 0, PLINTH.w, PLINTH.h, 0.029);
  surface(pen, shoulders, 'dressed');
  glyphSolid(pen, shoulders, { x: 0, y: 0 }, 0.115, painted ? 0.65 : 0.45);
  // Two carved mantle folds pass behind the crown; no facial features or inscription.
  const { ctx } = pen;
  ctx.beginPath();
  for (const side of [-1, 1]) {
    ctx.moveTo(side * 0.045, -0.025);
    ctx.quadraticCurveTo(side * 0.065, 0.015, side * 0.093, 0.03);
  }
  strokeFine(pen);
  const crown: PathFn = p => circlePath(p, 0.055, 0, -0.025);
  surface(pen, crown, 'stone');
  glyphSolid(pen, crown, { x: 0, y: -0.025 }, 0.055, 0.7);
}
