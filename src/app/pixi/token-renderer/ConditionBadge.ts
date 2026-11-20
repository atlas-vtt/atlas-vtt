import { Container, FillGradient, Graphics, Sprite, type Texture } from 'pixi.js';
import { isLightBadgeColor, type ConditionGlyph } from '../../utils/conditionGlyph';
import { getConditionGlyphTexture } from './conditionGlyphTexture';

export interface ConditionBadgeSpec {
  /** Badge colour as 0xRRGGBB. */
  color: number;
  glyph: ConditionGlyph;
  /** Number of a valued condition, shown in a pip on the badge's lower right. */
  value?: number;
}

/** Radius of a badge on the token's ring, in UI units (a medium token is 62 wide). */
export const CONDITION_BADGE_RADIUS = 6;
/** The badge reaches `radius + RIM_WIDTH`, its dark keyline included. */
const RIM_WIDTH = 1;
/** The keyline that keeps the badge's edge on light art and light maps, in UI units. */
const KEYLINE = 0.4;
/** A fine ring inside the disc's edge, as on a seal: how far inside, and how thick, in UI units. */
const INSET_RING = { inset: 0.75, width: 0.3, alpha: 0.4 };
/**
 * Badges are a few UI units wide and PIXI builds a circle from as many pieces as its
 * local radius asks for, so they are drawn this many times larger and scaled down:
 * drawn at their own size, a zoomed-in badge shows corners.
 */
const DRAW_SCALE = 16;
const INK = 0x0b0b0e;
const WHITE = 0xffffff;
/** The faint shadow that lifts the badge off token art reaches this far past it. */
const SHADOW_REACH = 1.2;
const SHADOW_ALPHA = 0.3;
/** Glyph edge length as a share of the disc's diameter: icons fill less than letters, whose ink is narrower. */
const ICON_SHARE = 0.54;
const TEXT_SHARE = 0.58;
const DARK_GLYPH_COLOR = 0x16161a;
/** Value pip radius as a share of the badge radius, and where its centre sits. */
const PIP_SHARE = 0.6;
const PIP_OFFSET = 0.72;
const PIP_COLOR = 0x2a2a31;
const PIP_DIGIT_SHARE = 0.78;

/** Shadows depend only on the badge's radius, so badges of one size share one. */
const shadowFills = new Map<number, FillGradient>();

/**
 * A round condition badge centred on its origin: a flat disc in the condition's colour
 * with a fine ring inside its edge, a dark keyline around it and a faint shadow under it,
 * and the condition's glyph in white (or near-black on light colours). Used on the token's
 * ring and in the hover card, so both read as one.
 */
export function createConditionBadge(spec: ConditionBadgeSpec, radius: number = CONDITION_BADGE_RADIUS): Container {
  const badge = new Container({ eventMode: 'none', interactiveChildren: false });
  const light = isLightBadgeColor(spec.color);
  badge.addChild(drawDisc(spec.color, radius + RIM_WIDTH, light, true));

  const texture = getConditionGlyphTexture(spec.glyph);
  if (texture) {
    const disc = radius + RIM_WIDTH - KEYLINE;
    const size = disc * 2 * (spec.glyph.kind === 'icon' ? ICON_SHARE : TEXT_SHARE);
    badge.addChild(glyphSprite(texture, size, light ? DARK_GLYPH_COLOR : WHITE));
  }
  if (spec.value !== undefined) badge.addChild(createValuePip(spec.value, radius));
  return badge;
}

/** A disc of `color` reaching `outer` UI units with its keyline (a badge also with its shadow and inset ring), drawn `DRAW_SCALE` times larger. */
function drawDisc(color: number, outer: number, light: boolean, badge: boolean): Graphics {
  const s = DRAW_SCALE;
  const disc = outer - KEYLINE;
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

function glyphSprite(texture: Texture, size: number, tint: number): Sprite {
  const sprite = new Sprite({ texture, anchor: 0.5, eventMode: 'none', tint });
  sprite.setSize(size);
  return sprite;
}

/** A small dark disc with the condition's number over the badge's lower right, keylined like the badge. */
function createValuePip(value: number, radius: number): Container {
  const pipRadius = radius * PIP_SHARE;
  const pip = new Container({ eventMode: 'none', interactiveChildren: false });
  pip.position.set(radius * PIP_OFFSET, radius * PIP_OFFSET);
  pip.addChild(drawDisc(PIP_COLOR, pipRadius + KEYLINE, false, false));
  const texture = getConditionGlyphTexture({ kind: 'text', text: String(value) });
  if (texture) pip.addChild(glyphSprite(texture, pipRadius * 2 * PIP_DIGIT_SHARE, WHITE));
  return pip;
}
