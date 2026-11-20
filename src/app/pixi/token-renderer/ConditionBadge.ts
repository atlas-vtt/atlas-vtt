import { Container, FillGradient, Graphics, Sprite, type Texture } from 'pixi.js';
import { mixColor } from '../../styles/designTokens';
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
/** The badge reaches `radius + RIM_WIDTH`: a thin bezel around a disc a little larger than `radius`. */
const RIM_WIDTH = 1;
/** How far the coloured disc reaches past `radius`; the rest of `RIM_WIDTH` is the bezel and its keyline. */
const DISC_GROWTH = 0.35;
/** The dark line around the bezel, so a badge keeps its edge on light art and light maps. */
const KEYLINE_WIDTH = 0.22;
/**
 * Badges are a few UI units wide and PIXI builds a circle from as many pieces as its
 * local radius asks for, so they are drawn this many times larger and scaled down:
 * drawn at their own size, a zoomed-in badge shows corners.
 */
const DRAW_SCALE = 16;
const INK = 0x0b0b0e;
const WHITE = 0xffffff;
/** A gunmetal bezel lit from above, as if the badge were set into the token's metal ring. */
const BEZEL = new FillGradient({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  colorStops: [
    { offset: 0, color: 0x6a6a74 },
    { offset: 0.5, color: 0x2e2e35 },
    { offset: 1, color: 0x141418 },
  ],
});
/** The soft shadow under the badge reaches this far past the rim, and sits a little below it. */
const SHADOW_REACH = 1.6;
const SHADOW_DROP = 0.1;
const SHADOW_ALPHA = 0.5;
/** Glyph edge length as a share of the disc's diameter: icons fill less than letters, whose ink is narrower. */
const ICON_SHARE = 0.56;
const TEXT_SHARE = 0.6;
const DARK_GLYPH_COLOR = 0x16161a;
/** The glyph's own shadow (a light lip under a dark glyph), as a share of the radius. */
const GLYPH_SHADOW_DROP = 0.07;
/** Value pip radius as a share of the badge radius, and where its centre sits. */
const PIP_SHARE = 0.6;
const PIP_OFFSET = 0.72;
const PIP_COLOR = 0x26262d;
const PIP_DIGIT_SHARE = 0.78;

/** A bevel inside the disc's edge: lit along the top, fading out at the sides, in shade at the bottom. */
const BEVEL_WIDTH = 0.55;
const BEVEL = new FillGradient({
  type: 'linear',
  start: { x: 0, y: 0 },
  end: { x: 0, y: 1 },
  colorStops: [
    { offset: 0, color: 'rgba(255, 255, 255, 0.5)' },
    { offset: 0.45, color: 'rgba(255, 255, 255, 0)' },
    { offset: 0.7, color: 'rgba(0, 0, 0, 0)' },
    { offset: 1, color: 'rgba(0, 0, 0, 0.22)' },
  ],
});

/** Gradients depend only on the colour (or the radius, for the shadow), so badges share them. */
const discGradients = new Map<number, FillGradient>();
const shadowGradients = new Map<number, FillGradient>();

/** A dome lit from the upper left: the colour lifted towards white there, sinking towards its rim. */
function discGradient(color: number): FillGradient {
  let gradient = discGradients.get(color);
  if (!gradient) {
    gradient = new FillGradient({
      type: 'radial',
      center: { x: 0.4, y: 0.28 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: mixColor(color, WHITE, 0.24) },
        { offset: 0.45, color },
        { offset: 1, color: mixColor(color, INK, 0.14) },
      ],
    });
    discGradients.set(color, gradient);
  }
  return gradient;
}

/** A contact shadow that fades out past the rim instead of ending in a hard edge. */
function shadowGradient(radius: number): FillGradient {
  let gradient = shadowGradients.get(radius);
  if (!gradient) {
    const reach = radius + RIM_WIDTH + SHADOW_REACH;
    gradient = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: `rgba(0, 0, 0, ${SHADOW_ALPHA})` },
        { offset: (radius + RIM_WIDTH * 0.5) / reach, color: `rgba(0, 0, 0, ${SHADOW_ALPHA})` },
        { offset: 1, color: 'rgba(0, 0, 0, 0)' },
      ],
    });
    shadowGradients.set(radius, gradient);
  }
  return gradient;
}

/**
 * A round condition badge centred on its origin: a domed disc in the condition's colour
 * inside a rim of its own colour sunk to near-black, resting on a soft shadow, with the
 * condition's glyph in white (or near-black on light colours). Used on the token's ring
 * and in the hover card, so both read as one.
 */
export function createConditionBadge(spec: ConditionBadgeSpec, radius: number = CONDITION_BADGE_RADIUS): Container {
  const badge = new Container({ eventMode: 'none', interactiveChildren: false });
  badge.addChild(drawDisc(spec.color, radius));

  const texture = getConditionGlyphTexture(spec.glyph);
  if (texture) {
    const size = (radius + DISC_GROWTH) * 2 * (spec.glyph.kind === 'icon' ? ICON_SHARE : TEXT_SHARE);
    const light = isLightBadgeColor(spec.color);
    // A dark glyph is pressed in (a light lip below it), a white one stands out (a soft shadow below it)
    badge.addChild(glyphSprite(texture, size, light ? WHITE : INK, light ? 0.35 : 0.4, radius * GLYPH_SHADOW_DROP));
    badge.addChild(glyphSprite(texture, size, light ? DARK_GLYPH_COLOR : WHITE, 1, 0));
  }
  if (spec.value !== undefined) badge.addChild(createValuePip(spec.value, radius));
  return badge;
}

/** Shadow, keyline, bezel, lit disc and its bevel, drawn `DRAW_SCALE` times larger. */
function drawDisc(color: number, radius: number): Graphics {
  const s = DRAW_SCALE;
  const outer = (radius + RIM_WIDTH) * s;
  const r = (radius + DISC_GROWTH) * s;
  const disc = new Graphics()
    .circle(0, radius * SHADOW_DROP * s, outer + SHADOW_REACH * s)
    .fill(shadowGradient(radius))
    .circle(0, 0, outer)
    .fill({ color: INK, alpha: 0.85 })
    .circle(0, 0, outer - KEYLINE_WIDTH * s)
    .fill(BEZEL)
    .circle(0, 0, r)
    .fill(discGradient(color))
    .circle(0, 0, r)
    .stroke({ width: BEVEL_WIDTH * s, fill: BEVEL, alignment: 1 });
  disc.scale.set(1 / s);
  return disc;
}

function glyphSprite(texture: Texture, size: number, tint: number, alpha: number, drop: number): Sprite {
  const sprite = new Sprite({ texture, anchor: 0.5, eventMode: 'none', tint, alpha });
  sprite.setSize(size);
  sprite.y = drop;
  return sprite;
}

/** Small graphite disc with the condition's number over the badge's lower right, in the badge's bezel. */
function createValuePip(value: number, radius: number): Container {
  const s = DRAW_SCALE;
  const pipRadius = radius * PIP_SHARE;
  const pip = new Container({ eventMode: 'none', interactiveChildren: false });
  pip.position.set(radius * PIP_OFFSET, radius * PIP_OFFSET);
  const disc = new Graphics()
    .circle(0, 0, (pipRadius + RIM_WIDTH * 0.75) * s)
    .fill({ color: INK, alpha: 0.85 })
    .circle(0, 0, (pipRadius + RIM_WIDTH * 0.75 - KEYLINE_WIDTH) * s)
    .fill(BEZEL)
    .circle(0, 0, pipRadius * s)
    .fill(discGradient(PIP_COLOR));
  disc.scale.set(1 / s);
  pip.addChild(disc);
  const texture = getConditionGlyphTexture({ kind: 'text', text: String(value) });
  if (texture) pip.addChild(glyphSprite(texture, pipRadius * 2 * PIP_DIGIT_SHARE, WHITE, 1, 0));
  return pip;
}
