import { glyphEdges } from './art/glyphLight';
import { polyPath } from './art/paths';
import { circlePath, disc, fineLines, fineRing, inkDot, roundedRect, strokeFine, type GlyphPen } from './glyphPen';
import { materialDisc, panel, ringPoly, ripples, shaft, surface } from './propClassicParts';

/** Octagonal coping, an inset basin and the top of a central spout; no raised side profile. */
function fountain(pen: GlyphPen, engraved: boolean): void {
  const outer = ringPoly(0.5, 8, Math.PI / 8);
  const inner = ringPoly(0.39, 8, Math.PI / 8);
  surface(pen, polyPath(outer), 'stone');
  glyphEdges(pen, outer, true);
  pen.ctx.beginPath();
  polyPath(inner)(pen.ctx);
  pen.ctx.fillStyle = pen.palette.water;
  pen.ctx.fill();
  glyphEdges(pen, inner, false);
  // Eight radial joints across the coping, with an inset moulding around its edge.
  const joints: number[] = [];
  for (let i = 0; i < outer.length; i++) joints.push(outer[i]!.x, outer[i]!.y, inner[i]!.x, inner[i]!.y);
  fineLines(pen, joints);
  pen.ctx.beginPath();
  polyPath(ringPoly(0.46, 8, Math.PI / 8))(pen.ctx);
  strokeFine(pen);
  ripples(pen, 0.3, 3, 0.4);
  ripples(pen, 0.22, 3, 1.7);
  materialDisc(pen, 0, 0, 0.135, 'stone');
  fineRing(pen, 0, 0, 0.1);
  // A bronze nozzle on its own little pedestal. The dark aperture reads in every look.
  materialDisc(pen, 0, 0, 0.063, 'metal');
  inkDot(pen, 0, 0, 0.022);
  if (engraved) fineLines(pen, [-0.075, -0.075, -0.055, -0.055, 0.055, 0.055, 0.075, 0.075]);
}

/** Stone ring, open shaft, timber windlass and a rope wound around its drum, viewed vertically. */
function well(pen: GlyphPen, engraved: boolean): void {
  disc(pen, 0, 0, 0.4);
  glyphEdges(pen, ringPoly(0.387, 24), true);
  disc(pen, 0, 0, 0.25, pen.palette.water);
  shaft(pen, 0.25, engraved);
  fineRing(pen, 0, 0, 0.355);
  const joints: number[] = [];
  for (let i = 0; i < 11; i++) {
    const a = 0.2 + i * Math.PI * 2 / 11;
    joints.push(Math.cos(a) * 0.255, Math.sin(a) * 0.255, Math.cos(a) * 0.395, Math.sin(a) * 0.395);
  }
  fineLines(pen, joints);
  ripples(pen, 0.18, 2, 0.3);
  // The rope drops into the shaft; its top-down projection ends below the axle.
  surface(pen, path => roundedRect(path, 0, -0.105, 0.03, 0.19, 0.012), 'rope');
  surface(pen, path => {
    for (const x of [-0.318, 0.318]) roundedRect(path, x, 0, 0.105, 0.14, 0.018);
    roundedRect(path, 0, 0, 0.65, 0.07, 0.025);
  }, 'wood');
  panel(pen, 0, 0, 0.22, 0.11, 'rope', false);
  const turns: number[] = [];
  for (const x of [-0.075, -0.035, 0.005, 0.045, 0.085]) turns.push(x - 0.014, -0.045, x + 0.014, 0.045);
  fineLines(pen, turns);
  // The bent handle stays over the ring, inside the unchanged circular lighting outline.
  surface(pen, path => {
    roundedRect(path, 0.318, 0.07, 0.035, 0.15, 0.012);
    circlePath(path, 0.028, 0.318, 0.14);
  }, 'metal');
  for (const x of [-0.318, 0.318]) inkDot(pen, x, 0, 0.015);
}

export const WATER_STONE = {
  fountain: (pen: GlyphPen): void => fountain(pen, false),
  well: (pen: GlyphPen): void => well(pen, false),
};

export const WATER_ENGRAVED = {
  fountain: (pen: GlyphPen): void => fountain(pen, true),
  well: (pen: GlyphPen): void => well(pen, true),
};
