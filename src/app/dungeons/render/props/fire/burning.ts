import type { Hand } from '../../art/hand';
import type { PathFn } from '../../art/paths';
import { lavaDuotone } from '../../art/lavaPalette';
import type { Vec } from '../../geometry';
import { circlePath, type GlyphPen } from '../../glyphPen';
import { mixColours, withAlpha } from '../../palette';

/**
 * A fire that burns, seen from above: a glowing bed, the charred fuel lying in it with embers along
 * its cracks, and its flames (`flame.ts`). Stone paints it in
 * fire's colours (two pigments in Monochrome, from dark to light as lava's heat); Engraved cuts the
 * flames in ink on paper and lays the fuel in solid ink. Each part is one pass over all its pieces,
 * as a fire is many small things and every canvas call counts.
 */

export interface FireColours {
  /** Wood burnt black. */
  char: string;
  /** The red of embers in the cracks and of sparks. */
  ember: string;
  flame: string;
  /** The pale heart of a flame. */
  core: string;
}

const colourCache = new WeakMap<Hand, FireColours>();

/** Stone & shadow fills with colour; Engraved leaves the paper and cuts its parts in lines. */
function painted(pen: GlyphPen): boolean {
  return pen.hand.scene.env.style.direction === 'stone';
}

/** A fire's colours in the look of `pen`: fire's own, Monochrome's two pigments, or Engraved's ink and paper. */
export function fireColours(pen: GlyphPen): FireColours {
  let colours = colourCache.get(pen.hand);
  if (!colours) {
    colours = coloursOf(pen);
    colourCache.set(pen.hand, colours);
  }
  return colours;
}

function coloursOf(pen: GlyphPen): FireColours {
  const { palette, view } = pen.hand.scene.env;
  if (!painted(pen)) return { char: palette.ink, ember: palette.ink, flame: palette.floor, core: palette.floor };
  if (view.monochrome) {
    const { deep, surface, glint } = lavaDuotone(palette.ink, palette.floor);
    return { char: deep, ember: surface, flame: mixColours(surface, glint, 0.55), core: glint };
  }
  return { char: '#2b1a12', ember: '#c4421c', flame: '#f58a2c', core: '#fff1c4' };
}

/**
 * The glow of a fire's bed or of a flame on the floor round it: an ellipse of `rx` by `ry` round
 * `c`, palest in its middle and gone at its rim, kept inside `bed`, `strength` times as strong as a
 * fire's bed. Laid on as light (`screen`), so it only ever warms and lightens what it falls on, a
 * pale tint on a light floor and a bloom on a dark one (in Monochrome laid on as its pale pigment). Stone's raster wash alone, as a vector
 * picture and Engraved's line work carry no wash.
 */
export function fireGlow(pen: GlyphPen, bed: PathFn, c: Vec, rx: number, ry: number, strength = 1): void {
  if (!painted(pen) || !pen.hand.scene.raster) return;
  const { ctx } = pen;
  const { core, flame } = fireColours(pen);
  ctx.save();
  ctx.beginPath();
  bed(ctx);
  ctx.clip();
  // Monochrome keeps to its two pigments, which a screen's mix would leave; its pale one lightens there as it is.
  if (!pen.hand.scene.env.view.monochrome) ctx.globalCompositeOperation = 'screen';
  ctx.translate(c.x, c.y);
  ctx.scale(1, ry / rx);
  const glow = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  glow.addColorStop(0, withAlpha(core, Math.min(1, 0.75 * strength)));
  glow.addColorStop(0.35, withAlpha(mixColours(core, flame, 0.45), 0.45 * strength));
  glow.addColorStop(0.7, withAlpha(flame, 0.16 * strength));
  glow.addColorStop(1, withAlpha(flame, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
}

/** Charred fuel: its pieces filled in char, the embers in its cracks and the sparks round it in ember red. */
export function charredFuel(pen: GlyphPen, pieces: PathFn, cracks: readonly number[], sparks: readonly (readonly [number, number, number])[]): void {
  const { ctx } = pen;
  const { char, ember } = fireColours(pen);
  const ink = ctx.strokeStyle;
  ctx.beginPath();
  pieces(ctx);
  ctx.fillStyle = char;
  ctx.fill();
  ctx.strokeStyle = painted(pen) ? ember : pen.hand.scene.env.palette.floor;
  ctx.beginPath();
  for (let i = 0; i < cracks.length; i += 4) {
    ctx.moveTo(cracks[i]!, cracks[i + 1]!);
    ctx.lineTo(cracks[i + 2]!, cracks[i + 3]!);
  }
  // A split glows wider than a fine line, so the embers read through the char.
  const width = ctx.lineWidth;
  ctx.lineWidth = pen.fine * 2;
  ctx.stroke();
  ctx.lineWidth = width;
  ctx.beginPath();
  for (const [x, y, r] of sparks) circlePath(ctx, r, x, y);
  ctx.fillStyle = ember;
  ctx.fill();
  ctx.strokeStyle = ink;
}
