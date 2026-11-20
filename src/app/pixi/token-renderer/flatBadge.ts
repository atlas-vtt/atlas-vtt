import { FillGradient, Graphics } from 'pixi.js';

/**
 * The flat disc every round badge on a token is drawn on (conditions, the instance number,
 * a condition's value): a disc of one colour inside a dark keyline, and for a badge of its
 * own a fine ring inside its edge, as on a seal, and a faint shadow to lift it off token art.
 * No gradients and no light: the badges are flat.
 */

/** The keyline that keeps a badge's edge on light art and light maps, in UI units. */
export const BADGE_KEYLINE = 0.4;
/** The disc of a badge that shows a number: the instance number, a condition's value. */
export const GRAPHITE = 0x2a2a31;
const INK = 0x0b0b0e;
const WHITE = 0xffffff;
/** The fine ring inside the disc's edge: how far inside, and how thick, in UI units. */
const INSET_RING = { inset: 0.75, width: 0.3, alpha: 0.4 };
/** The faint shadow reaches this far past the badge, in UI units. */
const SHADOW_REACH = 1.2;
const SHADOW_ALPHA = 0.3;
/**
 * Badges are a few UI units wide and PIXI builds a circle from as many pieces as its
 * local radius asks for, so they are drawn this many times larger and scaled down:
 * drawn at their own size, a zoomed-in badge shows corners.
 */
const DRAW_SCALE = 16;

/** Shadows depend only on their share of solid, so badges of one size share one. */
const shadowFills = new Map<number, FillGradient>();

/** A disc of `color` reaching `outer` UI units with its keyline (a badge also with its shadow and inset ring), drawn `DRAW_SCALE` times larger. */
export function drawFlatDisc(color: number, outer: number, light: boolean, badge: boolean): Graphics {
  const s = DRAW_SCALE;
  const disc = outer - BADGE_KEYLINE;
  const drawn = new Graphics();
  if (badge) {
    const reach = outer + SHADOW_REACH;
    drawn.circle(0, 0, reach * s).fill(shadowFill(outer / reach));
  }
  drawn
    .circle(0, 0, outer * s)
    .fill({ color: INK, alpha: 0.85 })
    .circle(0, 0, disc * s)
    .fill({ color });
  if (badge) {
    drawn
      .circle(0, 0, (disc - INSET_RING.inset) * s)
      .stroke({ width: INSET_RING.width * s, color: light ? INK : WHITE, alpha: light ? INSET_RING.alpha * 0.6 : INSET_RING.alpha });
  }
  drawn.scale.set(1 / s);
  return drawn;
}

/**
 * A shadow at `solid` of its radius and fading out to its edge. PIXI paints a radial
 * gradient's last stop under its whole texture, so it must end clear.
 */
function shadowFill(solid: number): FillGradient {
  let fill = shadowFills.get(solid);
  if (!fill) {
    fill = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: `rgba(0, 0, 0, ${SHADOW_ALPHA})` },
        { offset: solid, color: `rgba(0, 0, 0, ${SHADOW_ALPHA})` },
        { offset: 1, color: 'rgba(0, 0, 0, 0)' },
      ],
    });
    shadowFills.set(solid, fill);
  }
  return fill;
}

