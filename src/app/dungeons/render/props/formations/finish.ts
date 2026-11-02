import { glyphTone, lightInGlyph } from '../../art/glyphLight';
import { pathBounds, polyPath, polysPath, runsPath, type PathFn } from '../../art/paths';
import type { Vec } from '../../geometry';
import type { GlyphPen } from '../../glyphPen';
import { mixColours, withAlpha } from '../../palette';
import { isDarkColour } from '../../stone/colours';

/**
 * How a painter finishes a formation's planes: Stone lays light and shade over a face as thin
 * washes of light and black and gives wet calcite its sheen; Engraved leaves a lit face paper and
 * cuts a shaded one in its −45° hatch, and has no sheen. The drawings share everything else.
 */
export interface Finish {
  /** A face turned to the light, `strength` 0..1. */
  lit(pen: GlyphPen, path: PathFn, strength: number): void;
  /** A face turned away from it. */
  shaded(pen: GlyphPen, path: PathFn, strength: number): void;
  /** Wet calcite's highlight: short strokes where the light glints. */
  sheen(pen: GlyphPen, runs: readonly (readonly Vec[])[]): void;
  /** Which painter finishes, for the few places a drawing differs beyond light and shade. */
  painter: 'stone' | 'engraved';
  /** A band of mineral stain in calcite: Stone washes it with the warm tone iron leaves; Engraved leaves it to its lines. */
  stain(pen: GlyphPen, path: PathFn): void;
}

/** What a lit wash brightens towards: white, or the light ink of a dark look. */
function lightOf(pen: GlyphPen): { colour: string; alpha: number } {
  const dark = isDarkColour(pen.palette.floor);
  // The look's own ink, which is light on a dark floor; the pen's ink is the glyph's deep shade.
  return { colour: dark ? pen.hand.scene.env.palette.ink : '#ffffff', alpha: dark ? 0.28 : 0.5 };
}

/** Calcite, paler than the stone round it: what water leaves behind; on a dark floor drawn towards the look's light ink, so it still stands pale. */
export function calcite(pen: GlyphPen): string {
  const raised = pen.paint('raised').fill;
  return pen.hand.scene.env.style.direction === 'stone' && isDarkColour(pen.palette.floor) ? mixColours(raised, pen.hand.scene.env.palette.ink, 0.24) : raised;
}

function wash(pen: GlyphPen, path: PathFn, colour: string): void {
  const { ctx } = pen;
  ctx.save();
  ctx.beginPath();
  path(ctx);
  ctx.fillStyle = colour;
  ctx.fill();
  ctx.restore();
}

export const STONE_FINISH: Finish = {
  painter: 'stone',
  lit: (pen, path, strength) => {
    const light = lightOf(pen);
    wash(pen, path, withAlpha(light.colour, light.alpha * strength));
  },
  shaded: (pen, path, strength) => wash(pen, path, withAlpha('#000000', (isDarkColour(pen.palette.floor) ? 0.2 : 0.32) * strength)),
  stain: (pen, path) => wash(pen, path, withAlpha(pen.paint('wood').fill, 0.22)),
  sheen: (pen, runs) => {
    const light = lightOf(pen);
    const { ctx } = pen;
    ctx.save();
    ctx.beginPath();
    runsPath(runs)(ctx);
    ctx.strokeStyle = withAlpha(light.colour, Math.min(1, light.alpha * 1.6));
    ctx.lineWidth = pen.fine * 1.5;
    ctx.stroke();
    ctx.restore();
  },
};

export const ENGRAVED_FINISH: Finish = {
  painter: 'engraved',
  lit: () => undefined,
  shaded: (pen, path, strength) => {
    const bounds = pathBounds(path);
    if (bounds) glyphTone(pen, () => strength, bounds, path, 'shade');
  },
  sheen: () => undefined,
  stain: () => undefined,
};

/** How much a face whose outward direction is `out` (in the glyph's frame) faces the light: −1..1. */
export function facing(pen: GlyphPen, out: Vec): number {
  const light = lightInGlyph(pen);
  const len = Math.hypot(out.x, out.y) || 1;
  return (out.x * light.x + out.y * light.y) / len;
}

/** A plane of a formation and the direction it faces outward, in the glyph's frame. */
export interface Face {
  poly: Vec[];
  out: Vec;
}

/** Faces split by the light: those turned to it and those turned away, each as one path, with how strongly. */
export function splitByLight(pen: GlyphPen, faces: readonly Face[], finish: Finish, threshold = 0.15): void {
  const lit: Vec[][] = [];
  const shaded: Vec[][] = [];
  let litBy = 0;
  let shadedBy = 0;
  for (const { poly, out } of faces) {
    const f = facing(pen, out);
    if (f > threshold) {
      lit.push(poly);
      litBy = Math.max(litBy, f);
    } else if (f < -threshold) {
      shaded.push(poly);
      shadedBy = Math.max(shadedBy, -f);
    }
  }
  if (lit.length) finish.lit(pen, path => lit.forEach(p => polyPath(p)(path)), 0.35 + 0.45 * litBy);
  if (shaded.length) finish.shaded(pen, path => shaded.forEach(p => polyPath(p)(path)), 0.35 + 0.45 * shadedBy);
}

/** Fills closed outlines in `fill` as one path. */
export function fillPolys(pen: GlyphPen, polys: readonly (readonly Vec[])[], fill: string): void {
  const { ctx } = pen;
  ctx.beginPath();
  polysPath(polys)(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Fills a closed outline in `fill` and inks it at the outline weight. */
export function fillOutline(pen: GlyphPen, poly: readonly Vec[], fill: string): void {
  fillPolys(pen, [poly], fill);
  pen.ctx.stroke();
}

/** Open runs at the fine weight, `alpha` of the ink. */
export function fineRuns(pen: GlyphPen, runs: readonly (readonly Vec[])[], alpha = 1): void {
  const { ctx } = pen;
  ctx.save();
  ctx.beginPath();
  runsPath(runs)(ctx);
  ctx.lineWidth = pen.fine;
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.stroke();
  ctx.restore();
}

/** Open runs at the outline weight: an edge that stands, inked as one line. */
export function outlineRuns(pen: GlyphPen, runs: readonly (readonly Vec[])[]): void {
  const { ctx } = pen;
  ctx.beginPath();
  runsPath(runs)(ctx);
  ctx.stroke();
}

/** Stone's rock texture laid thinly over pale calcite, so it reads as wet stone, not as the dark rock round it; Engraved leaves calcite paper. */
export function calciteGrain(pen: GlyphPen, path: PathFn, finish: Finish): void {
  if (finish.painter !== 'stone') return;
  pen.ctx.save();
  pen.ctx.globalAlpha = 0.35;
  pen.hand.grain(path, 'rock');
  pen.ctx.restore();
}
